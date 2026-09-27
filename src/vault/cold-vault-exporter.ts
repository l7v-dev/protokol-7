/**
 * src/vault/cold-vault-exporter.ts
 *
 * Cold Vault Offline Storage Packaging and Cryptographic Verification Engine.
 * Exports sealed zstd Parquet shards and manifests conforming to
 * docs/protokol-cold-vault-mimari-sartnamesi.md.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { getDefaultRegistryDatabase, type RegistryDatabase } from "../api/registry-database";
import type {
  ColdVaultExportOptions,
  ColdVaultExportReceipt,
  ExportedShardReceipt,
  VolumeInfo,
  VolumeVerificationItem,
  VolumeVerificationResult,
} from "./types";

export class ColdVaultExporter {
  private readonly db: RegistryDatabase;

  constructor(db?: RegistryDatabase) {
    this.db = db ?? getDefaultRegistryDatabase();
  }

  /**
   * Computes cryptographic SHA-256 hash of a local file.
   */
  computeSha256(filePath: string): string {
    const buffer = readFileSync(filePath);
    return createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Ensures the standard Cold Vault directory layout and initializes volume.json.
   */
  initVolume(
    volumeRoot: string,
    volumeLabel?: string,
    filesystem: "btrfs" | "ext4" | "other" = "btrfs"
  ): VolumeInfo {
    const root = normalize(resolve(process.cwd(), volumeRoot));
    const label = volumeLabel?.trim() || basename(root);

    const datasetsDir = join(root, "datasets");
    const checksumsDir = join(root, "checksums");
    const logsDir = join(root, "logs");

    mkdirSync(datasetsDir, { recursive: true });
    mkdirSync(checksumsDir, { recursive: true });
    mkdirSync(logsDir, { recursive: true });

    const volumeMetaPath = join(root, "volume.json");
    const now = new Date().toISOString();

    if (existsSync(volumeMetaPath)) {
      try {
        const existing = JSON.parse(readFileSync(volumeMetaPath, "utf8")) as VolumeInfo;
        return {
          ...existing,
          volumeLabel: existing.volumeLabel || label,
        };
      } catch {
        // If malformed, re-create below
      }
    }

    const volumeInfo: VolumeInfo = {
      volumeId: `vol_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      volumeLabel: label,
      schemaVersion: "1.0.0",
      filesystem,
      createdAt: now,
      updatedAt: now,
    };

    writeFileSync(volumeMetaPath, JSON.stringify(volumeInfo, null, 2), "utf8");
    return volumeInfo;
  }

  /**
   * Inspects volume metadata from volume.json.
   */
  inspectVolume(volumeRoot: string): VolumeInfo | undefined {
    const root = normalize(resolve(process.cwd(), volumeRoot));
    const volumeMetaPath = join(root, "volume.json");
    if (!existsSync(volumeMetaPath)) {
      return undefined;
    }
    try {
      return JSON.parse(readFileSync(volumeMetaPath, "utf8")) as VolumeInfo;
    } catch {
      return undefined;
    }
  }

  /**
   * Exports dataset shards and manifest to the cold vault volume.
   */
  async exportDataset(options: ColdVaultExportOptions): Promise<ColdVaultExportReceipt> {
    const { datasetName, volumeRoot } = options;
    if (!datasetName?.trim()) {
      throw new Error("datasetName is required for cold vault export.");
    }
    if (!volumeRoot?.trim()) {
      throw new Error("volumeRoot directory path is required for cold vault export.");
    }

    const root = normalize(resolve(process.cwd(), volumeRoot));
    const volumeInfo = this.initVolume(root, options.volumeLabel, options.filesystem);

    // 1. Resolve snapshot or shards from database
    let snapshot = options.snapshotId ? this.db.getDatasetSnapshot(options.snapshotId) : undefined;

    if (!snapshot) {
      snapshot = this.db.getLatestDatasetSnapshot(datasetName);
    }

    const version = options.version?.trim() || snapshot?.version || "1.0.0";
    const shards = this.db.listDatasetShards(datasetName, 2000);

    if (shards.length === 0) {
      throw new Error(`No registered shards found in database for dataset '${datasetName}'.`);
    }

    const targetDatasetDir = join(root, "datasets", datasetName, version);
    mkdirSync(targetDatasetDir, { recursive: true });

    const exportedShards: ExportedShardReceipt[] = [];
    let totalExportBytes = 0;
    const sha256LinesToAppend: Array<{ hash: string; relPath: string }> = [];

    // 2. Export and verify each shard
    for (const shard of shards) {
      // Resolve source file location
      let srcPath = shard.storageUri;
      if (srcPath.startsWith("file://")) {
        srcPath = srcPath.slice("file://".length);
      }
      if (!isAbsolute(srcPath)) {
        srcPath = resolve(process.cwd(), srcPath);
      }

      if (!existsSync(srcPath)) {
        // Fallback to checking default local shard locations
        const altPath = resolve(process.cwd(), "data", "shards", shard.fileName);
        if (existsSync(altPath)) {
          srcPath = altPath;
        } else {
          throw new Error(
            `Source shard file '${shard.fileName}' (id: ${shard.shardId}) not found at '${srcPath}'.`
          );
        }
      }

      const relativeVaultPath = join("datasets", datasetName, version, shard.fileName);
      const destPath = join(root, relativeVaultPath);

      // Copy or hardlink
      const tempDestPath = `${destPath}.tmp_${randomUUID().slice(0, 8)}`;
      mkdirSync(dirname(destPath), { recursive: true });

      let useCopy = options.copyMode !== "hardlink";
      if (!useCopy) {
        try {
          if (existsSync(destPath)) {
            unlinkSync(destPath);
          }
          linkSync(srcPath, destPath);
        } catch {
          // Hardlink across filesystems fails; fallback to copy
          useCopy = true;
        }
      }

      if (useCopy) {
        copyFileSync(srcPath, tempDestPath);
        renameSync(tempDestPath, destPath);
      }

      // Cryptographic verification
      const actualSize = statSync(destPath).size;
      const actualHash = this.computeSha256(destPath);

      if (options.verifyChecksums !== false && shard.sha256Hash) {
        if (actualHash !== shard.sha256Hash) {
          if (existsSync(destPath)) {
            unlinkSync(destPath);
          }
          throw new Error(
            `Cryptographic checksum mismatch for shard '${shard.fileName}': expected ${shard.sha256Hash}, got ${actualHash}`
          );
        }
      }

      totalExportBytes += actualSize;
      sha256LinesToAppend.push({ hash: actualHash, relPath: relativeVaultPath });

      // Record replica in SQLite catalog
      const replicaId = `rep_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      this.db.recordStorageReplica({
        replicaId,
        shardId: shard.shardId,
        storageProvider: "local_cold_vault",
        remoteUri: `file://${destPath}`,
        remoteSha256Hash: actualHash,
        remoteSizeBytes: actualSize,
        syncStatus: "VERIFIED",
        verifiedAt: new Date().toISOString(),
      });

      exportedShards.push({
        shardId: shard.shardId,
        fileName: shard.fileName,
        relativeVaultPath,
        destinationUri: `file://${destPath}`,
        sizeBytes: actualSize,
        sha256Hash: actualHash,
        verified: true,
      });
    }

    // 3. Export manifest.json if present
    const manifestVaultRelPath = join("datasets", datasetName, version, "manifest.json");
    const manifestDestPath = join(root, manifestVaultRelPath);

    if (snapshot?.manifestJson) {
      writeFileSync(manifestDestPath, snapshot.manifestJson, "utf8");
      const manifestHash = this.computeSha256(manifestDestPath);
      sha256LinesToAppend.push({ hash: manifestHash, relPath: manifestVaultRelPath });
    }

    // 4. Update checksums/SHA256SUMS idempotently
    const sha256sumsPath = join(root, "checksums", "SHA256SUMS");
    const existingEntries = new Map<string, string>(); // relPath -> hash

    if (existsSync(sha256sumsPath)) {
      const content = readFileSync(sha256sumsPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [hash, ...pathParts] = trimmed.split(/\s+/);
        const rel = pathParts.join(" ");
        if (hash && rel) {
          existingEntries.set(rel, hash);
        }
      }
    }

    for (const item of sha256LinesToAppend) {
      existingEntries.set(item.relPath, item.hash);
    }

    const sortedLines: string[] = [];
    for (const [rel, hash] of Array.from(existingEntries.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      sortedLines.push(`${hash}  ${rel}`);
    }
    writeFileSync(sha256sumsPath, `${sortedLines.join("\n")}\n`, "utf8");

    // 5. Append local disk audit log
    const auditLogPath = join(root, "logs", "export_audit.jsonl");
    const auditRecord = {
      timestamp: new Date().toISOString(),
      action: "export_dataset",
      datasetName,
      version,
      snapshotId: snapshot?.snapshotId,
      shardCount: exportedShards.length,
      totalSizeBytes: totalExportBytes,
    };
    appendFileSync(auditLogPath, `${JSON.stringify(auditRecord)}\n`, "utf8");

    // 6. Update volume metadata
    volumeInfo.updatedAt = new Date().toISOString();
    volumeInfo.datasetsCount = (volumeInfo.datasetsCount || 0) + 1;
    volumeInfo.totalBytes = (volumeInfo.totalBytes || 0) + totalExportBytes;
    writeFileSync(join(root, "volume.json"), JSON.stringify(volumeInfo, null, 2), "utf8");

    return {
      exportId: `exp_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      datasetName,
      version,
      snapshotId: snapshot?.snapshotId,
      volumeRoot: root,
      volumeLabel: volumeInfo.volumeLabel,
      totalShards: exportedShards.length,
      totalSizeBytes: totalExportBytes,
      manifestVaultPath: manifestVaultRelPath,
      sha256sumsVaultPath: "checksums/SHA256SUMS",
      shards: exportedShards,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Verifies the cryptographic integrity of all files listed in volume's SHA256SUMS.
   */
  async verifyVolume(volumeRoot: string): Promise<VolumeVerificationResult> {
    const root = normalize(resolve(process.cwd(), volumeRoot));
    const volumeMeta = this.inspectVolume(root);
    const sha256sumsPath = join(root, "checksums", "SHA256SUMS");

    if (!existsSync(sha256sumsPath)) {
      return {
        volumeRoot: root,
        volumeLabel: volumeMeta?.volumeLabel,
        status: "incomplete",
        totalFiles: 0,
        verifiedFiles: 0,
        corruptedFiles: 0,
        missingFiles: 0,
        items: [],
        verifiedAt: new Date().toISOString(),
      };
    }

    const content = readFileSync(sha256sumsPath, "utf8");
    const lines = content.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    const items: VolumeVerificationItem[] = [];

    let verifiedCount = 0;
    let corruptedCount = 0;
    let missingCount = 0;

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const expectedHash = parts[0];
      const relPath = parts.slice(1).join(" ");

      if (!expectedHash || !relPath) continue;

      const fullPath = join(root, relPath);

      if (!existsSync(fullPath)) {
        missingCount++;
        items.push({
          relativeVaultPath: relPath,
          expectedSha256: expectedHash,
          status: "missing",
          error: "File does not exist on disk",
        });
        continue;
      }

      try {
        const size = statSync(fullPath).size;
        const actualHash = this.computeSha256(fullPath);

        if (actualHash === expectedHash) {
          verifiedCount++;
          items.push({
            relativeVaultPath: relPath,
            expectedSha256: expectedHash,
            actualSha256: actualHash,
            status: "verified",
            sizeBytes: size,
          });
        } else {
          corruptedCount++;
          items.push({
            relativeVaultPath: relPath,
            expectedSha256: expectedHash,
            actualSha256: actualHash,
            status: "corrupted",
            sizeBytes: size,
            error: "SHA-256 checksum does not match expected hash",
          });
        }
      } catch (err) {
        corruptedCount++;
        items.push({
          relativeVaultPath: relPath,
          expectedSha256: expectedHash,
          status: "corrupted",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    let overallStatus: VolumeVerificationResult["status"] = "healthy";
    if (corruptedCount > 0) {
      overallStatus = "corrupted";
    } else if (missingCount > 0) {
      overallStatus = "incomplete";
    }

    return {
      volumeRoot: root,
      volumeLabel: volumeMeta?.volumeLabel,
      status: overallStatus,
      totalFiles: items.length,
      verifiedFiles: verifiedCount,
      corruptedFiles: corruptedCount,
      missingFiles: missingCount,
      items,
      verifiedAt: new Date().toISOString(),
    };
  }
}
