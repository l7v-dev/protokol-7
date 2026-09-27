/**
 * Training Dataset Snapshot & Manifest Publisher Engine.
 * Seals filtered/deduplicated corpus shards into versioned dataset snapshots,
 * computes deterministic train/val/test splits, generates verifiable manifest.json
 * with SHA-256 checksums, and persists snapshot lineage in RegistryDatabase.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize, resolve } from "node:path";
import {
  type DatasetRecord,
  type DatasetShardRecord,
  type DatasetSnapshotRecord,
  getDefaultRegistryDatabase,
  RegistryDatabase,
} from "../core/registry-database";
import { ConnectorRegistry } from "../pipeline/connectors/connector-registry";
import { B2Storage } from "../pipeline/storage/b2-storage";
import { LocalStorage } from "../pipeline/storage/local-storage";
import { R2Storage } from "../pipeline/storage/r2-storage";
import { S3Storage } from "../pipeline/storage/s3-storage";
import type {
  PublishDatasetOptions,
  PublishDatasetResult,
  ShardManifestEntry,
  SplitDefinition,
  SplitRatios,
  TrainingDatasetManifest,
} from "./types";

export interface DatasetPublisherOptions {
  registryDb?: RegistryDatabase;
  connectorRegistry?: ConnectorRegistry;
  defaultOutputDir?: string;
}

export class DatasetPublisher {
  private readonly registryDb: RegistryDatabase;
  private readonly connectorRegistry: ConnectorRegistry;
  private readonly defaultOutputDir: string;

  constructor(options?: DatasetPublisherOptions) {
    this.registryDb = options?.registryDb ?? getDefaultRegistryDatabase();
    this.connectorRegistry = options?.connectorRegistry ?? new ConnectorRegistry();
    this.defaultOutputDir = options?.defaultOutputDir ?? "data/snapshots";
  }

  /**
   * Publishes a versioned dataset snapshot with training manifest.json and checksums.sha256.
   */
  async publishSnapshot(options: PublishDatasetOptions): Promise<PublishDatasetResult> {
    if (!options.datasetName || typeof options.datasetName !== "string") {
      throw new Error("Dataset name is required and must be a non-empty string.");
    }

    const datasetName = options.datasetName.trim().toLowerCase();
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, ".");
    const version = options.version?.trim() || `${dateStamp}.1`;
    const snapshotId = `dss_${randomUUID().replace(/-/g, "").slice(0, 16)}`;

    // 1. Resolve Shards
    const shards = await this.resolveShards(datasetName, options);
    if (shards.length === 0) {
      throw new Error(
        `No shards found for dataset '${datasetName}'. Register shards or supply filePaths/shardIds.`
      );
    }

    // 2. Verify Checksums on Disk if requested
    if (options.verifyChecksumsOnDisk) {
      for (const shard of shards) {
        this.verifyShardChecksumOnDisk(shard);
      }
    }

    // 3. Compute Splits
    const splits = this.computeSplits(shards, options);

    // 4. Compute Totals and Statistics
    let totalRecords = 0;
    let totalSizeBytes = 0;
    const checksumsSha256: Record<string, string> = {};

    for (const shard of shards) {
      totalRecords += shard.recordCount;
      totalSizeBytes += shard.sizeBytes;
      checksumsSha256[shard.fileName] = shard.sha256Hash;
    }

    const totalTokensEstimated = this.estimateTokens(
      totalRecords,
      totalSizeBytes,
      options.metadata
    );

    // 5. Assemble Training Dataset Manifest
    const manifest: TrainingDatasetManifest = {
      schemaVersion: "1.0.0",
      snapshotId,
      datasetName,
      version,
      title: options.title || `${datasetName} Training Dataset`,
      description:
        options.description ||
        `Cryptographically verified training dataset snapshot for ${datasetName}.`,
      createdAt: now.toISOString(),
      license: {
        group: options.licenseGroup || "permissive_commercial",
        details: options.licenseDetails || "Permissive commercial and research usage.",
      },
      statistics: {
        totalShards: shards.length,
        totalRecords,
        totalSizeBytes,
        totalTokensEstimated,
        compressionCodec: shards[0]?.compressionCodec || "zstd",
      },
      splits,
      checksumsSha256,
      metadata: options.metadata || {},
    };

    // 6. Write Manifest to Local Output Directory
    const safeOutputDir = this.resolveSafeOutputDir(options.outputDir, datasetName, version);
    if (!existsSync(safeOutputDir)) {
      mkdirSync(safeOutputDir, { recursive: true });
    }

    const localManifestPath = join(safeOutputDir, "manifest.json");
    writeFileSync(localManifestPath, JSON.stringify(manifest, null, 2), "utf-8");

    // Write standard checksums.sha256 file
    const checksumLines = Object.entries(checksumsSha256)
      .map(([fileName, hash]) => `${hash}  ${fileName}`)
      .join("\n");
    writeFileSync(join(safeOutputDir, "checksums.sha256"), `${checksumLines}\n`, "utf-8");

    let manifestUri = localManifestPath;
    let remoteReceipt: PublishDatasetResult["remoteReceipt"];

    // 7. Remote Storage Upload (if connector specified)
    if (options.connectorName) {
      const uploadResult = await this.uploadManifestToRemote(
        options.connectorName,
        options.connectorPrefix || `datasets/${datasetName}/${version}`,
        Buffer.from(JSON.stringify(manifest, null, 2), "utf-8")
      );
      manifestUri = uploadResult.uri;
      remoteReceipt = uploadResult;
    }

    // 8. Record Dataset Snapshot in Registry Database
    const splitsSummary: Record<string, string[]> = {};
    for (const [splitName, splitDef] of Object.entries(splits)) {
      splitsSummary[splitName] = splitDef.shards.map((s) => s.fileName);
    }

    const snapshotRecord: DatasetSnapshotRecord = {
      snapshotId,
      datasetName,
      version,
      splitsJson: JSON.stringify(splitsSummary),
      shardCount: shards.length,
      totalRecordCount: totalRecords,
      totalSizeBytes,
      totalTokensEstimated,
      manifestUri,
      manifestJson: JSON.stringify(manifest),
      createdAt: now.toISOString(),
    };

    this.registryDb.recordDatasetSnapshot(snapshotRecord);

    // Upsert dataset catalog entry
    const datasetRecord: DatasetRecord = {
      datasetId: `ds_${datasetName}`,
      name: datasetName,
      sourcePlatform: String(options.metadata?.sourcePlatform || "corpus_pipeline"),
      licenseGroup: options.licenseGroup || "permissive_commercial",
      defaultLanguage: String(options.metadata?.language || "und"),
      description: options.description,
      createdAt: now.toISOString(),
    };
    this.registryDb.upsertDataset(datasetRecord);

    return {
      snapshotId,
      datasetName,
      version,
      manifestUri,
      manifest,
      splits,
      remoteReceipt,
    };
  }

  /**
   * Retrieves snapshot by snapshotId.
   */
  getSnapshot(snapshotId: string): DatasetSnapshotRecord | undefined {
    return this.registryDb.getDatasetSnapshot(snapshotId);
  }

  /**
   * Retrieves latest snapshot for datasetName.
   */
  getLatestSnapshot(datasetName: string): DatasetSnapshotRecord | undefined {
    return this.registryDb.getLatestDatasetSnapshot(datasetName);
  }

  /**
   * Lists snapshots for a given datasetName or all datasets.
   */
  listSnapshots(datasetName?: string, limit = 50): DatasetSnapshotRecord[] {
    return this.registryDb.listDatasetSnapshots(datasetName, limit);
  }

  /**
   * Retrieves and parses the full manifest for a snapshot or dataset.
   */
  getManifest(snapshotIdOrName: string): TrainingDatasetManifest | undefined {
    let snapshot = this.registryDb.getDatasetSnapshot(snapshotIdOrName);
    if (!snapshot) {
      snapshot = this.registryDb.getLatestDatasetSnapshot(snapshotIdOrName);
    }
    if (!snapshot) {
      return undefined;
    }
    try {
      return JSON.parse(snapshot.manifestJson) as TrainingDatasetManifest;
    } catch {
      return undefined;
    }
  }

  // --- Internal Helpers ---

  private async resolveShards(
    datasetName: string,
    options: PublishDatasetOptions
  ): Promise<DatasetShardRecord[]> {
    // A. Shards from Direct File Paths
    if (options.filePaths && options.filePaths.length > 0) {
      const records: DatasetShardRecord[] = [];
      const cwd = process.cwd();

      for (const rawPath of options.filePaths) {
        const fullPath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);
        if (!existsSync(fullPath)) {
          throw new Error(`Shard file not found on disk: ${fullPath}`);
        }

        const stat = statSync(fullPath);
        const buffer = readFileSync(fullPath);
        const hash = createHash("sha256").update(buffer).digest("hex");
        const fileName = basename(fullPath);
        const shardId = `sh_${createHash("sha256").update(fullPath).digest("hex").slice(0, 14)}`;

        // Approximate records if not specified in metadata
        const recordsPerFile = Number(options.metadata?.recordCountPerFile) || 100;

        const shardRecord: DatasetShardRecord = {
          shardId,
          datasetName,
          fileName,
          storageUri: fullPath,
          storageBackend: "local",
          recordCount: recordsPerFile,
          sizeBytes: stat.size,
          sha256Hash: hash,
          compressionCodec:
            fileName.endsWith(".zst") || fileName.endsWith(".zstd") ? "zstd" : "none",
          createdAt: new Date().toISOString(),
        };

        this.registryDb.recordDatasetShard(shardRecord);
        records.push(shardRecord);
      }
      return records;
    }

    // B. Shards by Explicit IDs
    if (options.shardIds && options.shardIds.length > 0) {
      const records: DatasetShardRecord[] = [];
      for (const id of options.shardIds) {
        const shard = this.registryDb.getDatasetShard(id);
        if (!shard) {
          throw new Error(`Shard with ID '${id}' not found in registry database.`);
        }
        records.push(shard);
      }
      return records;
    }

    // C. Query Registry Database for Dataset
    return this.registryDb.listDatasetShards(datasetName, 1000);
  }

  private verifyShardChecksumOnDisk(shard: DatasetShardRecord): void {
    const cwd = process.cwd();
    const candidatePath = isAbsolute(shard.storageUri)
      ? shard.storageUri
      : resolve(cwd, shard.storageUri);

    if (existsSync(candidatePath)) {
      const buffer = readFileSync(candidatePath);
      const computed = createHash("sha256").update(buffer).digest("hex");
      if (computed !== shard.sha256Hash) {
        throw new Error(
          `Checksum mismatch for shard '${shard.fileName}': expected ${shard.sha256Hash}, computed ${computed}.`
        );
      }
    }
  }

  private computeSplits(
    shards: DatasetShardRecord[],
    options: PublishDatasetOptions
  ): Record<string, SplitDefinition> {
    const splits: Record<string, SplitDefinition> = {};

    // 1. Explicit splits provided
    if (options.explicitSplits) {
      const shardMap = new Map<string, DatasetShardRecord>();
      for (const s of shards) {
        shardMap.set(s.fileName, s);
        shardMap.set(s.shardId, s);
      }

      for (const [splitName, keys] of Object.entries(options.explicitSplits)) {
        const matchedShards: ShardManifestEntry[] = [];
        let splitRecords = 0;
        let splitBytes = 0;

        for (const key of keys) {
          const matched = shardMap.get(key);
          if (matched) {
            matchedShards.push({
              shardId: matched.shardId,
              fileName: matched.fileName,
              storageUri: matched.storageUri,
              recordCount: matched.recordCount,
              sizeBytes: matched.sizeBytes,
              sha256Hash: matched.sha256Hash,
              compressionCodec: matched.compressionCodec,
            });
            splitRecords += matched.recordCount;
            splitBytes += matched.sizeBytes;
          }
        }

        splits[splitName] = {
          shardCount: matchedShards.length,
          recordCount: splitRecords,
          sizeBytes: splitBytes,
          shards: matchedShards,
        };
      }
      return splits;
    }

    // 2. Single shard edge case: assign 100% to train
    if (shards.length === 1) {
      const s = shards[0];
      splits.train = {
        shardCount: 1,
        recordCount: s.recordCount,
        sizeBytes: s.sizeBytes,
        shards: [
          {
            shardId: s.shardId,
            fileName: s.fileName,
            storageUri: s.storageUri,
            recordCount: s.recordCount,
            sizeBytes: s.sizeBytes,
            sha256Hash: s.sha256Hash,
            compressionCodec: s.compressionCodec,
          },
        ],
      };
      splits.validation = { shardCount: 0, recordCount: 0, sizeBytes: 0, shards: [] };
      splits.test = { shardCount: 0, recordCount: 0, sizeBytes: 0, shards: [] };
      return splits;
    }

    // 3. Proportional Ratio Split (default: 80% train, 10% val, 10% test)
    const ratios: SplitRatios = options.splitRatios ?? {
      train: 0.8,
      validation: 0.1,
      test: 0.1,
    };

    const trainRatio = ratios.train ?? 0.8;
    const valRatio = ratios.validation ?? 0.1;

    const total = shards.length;
    const trainCount = Math.max(1, Math.floor(total * trainRatio));
    const valCount = Math.floor(total * valRatio);

    const trainShards = shards.slice(0, trainCount);
    const valShards = shards.slice(trainCount, trainCount + valCount);
    const testShards = shards.slice(trainCount + valCount);

    const makeSplitDef = (items: DatasetShardRecord[]): SplitDefinition => ({
      shardCount: items.length,
      recordCount: items.reduce((acc, curr) => acc + curr.recordCount, 0),
      sizeBytes: items.reduce((acc, curr) => acc + curr.sizeBytes, 0),
      shards: items.map((i) => ({
        shardId: i.shardId,
        fileName: i.fileName,
        storageUri: i.storageUri,
        recordCount: i.recordCount,
        sizeBytes: i.sizeBytes,
        sha256Hash: i.sha256Hash,
        compressionCodec: i.compressionCodec,
      })),
    });

    splits.train = makeSplitDef(trainShards);
    splits.validation = makeSplitDef(valShards);
    splits.test = makeSplitDef(testShards);

    return splits;
  }

  private estimateTokens(
    totalRecords: number,
    totalSizeBytes: number,
    metadata?: Record<string, unknown>
  ): number {
    const avgTokensPerRecord = Number(metadata?.avgTokensPerRecord);
    if (!Number.isNaN(avgTokensPerRecord) && avgTokensPerRecord > 0) {
      return Math.round(totalRecords * avgTokensPerRecord);
    }
    // Heuristic: ~4 characters / bytes per token
    return Math.max(totalRecords * 100, Math.round(totalSizeBytes / 4));
  }

  private resolveSafeOutputDir(
    outputDir: string | undefined,
    datasetName: string,
    version: string
  ): string {
    const cwd = process.cwd();
    const candidate = outputDir || join(this.defaultOutputDir, `${datasetName}_${version}`);
    const normalized = normalize(candidate);

    if (normalized.includes("..")) {
      throw new Error(`Path traversal detected in output directory: '${outputDir}'`);
    }

    return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
  }

  private async uploadManifestToRemote(
    connectorName: string,
    prefix: string,
    data: Buffer
  ): Promise<{ backend: string; uri: string; bytesWritten: number }> {
    const config = this.connectorRegistry.resolve(connectorName);
    let storageBackend: LocalStorage | S3Storage;

    switch (config.type) {
      case "s3":
        storageBackend = new S3Storage({
          bucket: config.bucket || "datasets",
          region: config.region,
          endpoint: config.endpoint,
          credentials:
            config.access_key_id && config.secret_access_key
              ? {
                  accessKeyId: config.access_key_id,
                  secretAccessKey: config.secret_access_key,
                }
              : undefined,
        });
        break;
      case "r2":
        storageBackend = new R2Storage({
          bucket: config.bucket || "datasets",
          accountId: config.account_id,
          endpoint: config.endpoint,
          credentials:
            config.access_key_id && config.secret_access_key
              ? {
                  accessKeyId: config.access_key_id,
                  secretAccessKey: config.secret_access_key,
                }
              : undefined,
        });
        break;
      case "b2":
        storageBackend = new B2Storage({
          bucket: config.bucket || "datasets",
          endpoint: config.endpoint,
          credentials:
            config.access_key_id && config.secret_access_key
              ? {
                  accessKeyId: config.access_key_id,
                  secretAccessKey: config.secret_access_key,
                }
              : undefined,
        });
        break;
      default:
        storageBackend = new LocalStorage({ baseDir: "data/remote_sim" });
    }

    const receipt = await storageBackend.upload("manifest.json", data, prefix);
    return {
      backend: receipt.backend,
      uri: receipt.uri,
      bytesWritten: receipt.bytesWritten,
    };
  }
}
