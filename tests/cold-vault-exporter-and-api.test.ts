/**
 * Test Suite: Cold Vault Offline Storage Exporter, Verifier, REST API, and MCP Integration.
 */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { getDefaultRegistryDatabase } from "../src/api/registry-database";
import { createServer } from "../src/api/server";
import { ProtokolMcpServer } from "../src/mcp/protokol-mcp-server";
import { ColdVaultExporter } from "../src/vault/cold-vault-exporter";

describe("Cold Vault Exporter & Verification Engine", () => {
  const testDir = join(process.cwd(), "scratch", `vault_test_${randomUUID().slice(0, 8)}`);
  const sourceShardsDir = join(testDir, "source_shards");
  const volumeRoot = join(testDir, "VOL-2026-TEST");
  const db = getDefaultRegistryDatabase();

  let server: http.Server;
  let baseUrl: string;
  let mcpServer: ProtokolMcpServer;

  const datasetName = "test_physics_corpus";
  let shardId1: string;
  let shardId2: string;
  let shard1Hash: string;
  let shard2Hash: string;
  let shard1Path: string;
  let shard2Path: string;

  before(async () => {
    mkdirSync(sourceShardsDir, { recursive: true });

    // 1. Create sample source shards on disk
    const content1 = "Sample physics document 1: General Relativity and Gravitational Waves.\n";
    const content2 = "Sample physics document 2: Quantum Field Theory in Curved Spacetime.\n";

    shard1Path = join(sourceShardsDir, "physics-shard-00001.parquet");
    shard2Path = join(sourceShardsDir, "physics-shard-00002.parquet");

    writeFileSync(shard1Path, content1, "utf8");
    writeFileSync(shard2Path, content2, "utf8");

    shard1Hash = createHash("sha256").update(content1).digest("hex");
    shard2Hash = createHash("sha256").update(content2).digest("hex");

    // 2. Register dataset, shards, and snapshot in SQLite
    const now = new Date().toISOString();
    db.upsertDataset({
      datasetId: `ds_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: datasetName,
      sourcePlatform: "arxiv",
      licenseGroup: "permissive_commercial",
      defaultLanguage: "en",
      createdAt: now,
    });

    shardId1 = `sh_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    shardId2 = `sh_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    db.recordDatasetShard({
      shardId: shardId1,
      datasetName,
      fileName: "physics-shard-00001.parquet",
      storageUri: shard1Path,
      storageBackend: "local",
      recordCount: 1,
      sizeBytes: Buffer.byteLength(content1),
      sha256Hash: shard1Hash,
      createdAt: now,
    });

    db.recordDatasetShard({
      shardId: shardId2,
      datasetName,
      fileName: "physics-shard-00002.parquet",
      storageUri: shard2Path,
      storageBackend: "local",
      recordCount: 1,
      sizeBytes: Buffer.byteLength(content2),
      sha256Hash: shard2Hash,
      createdAt: now,
    });

    const manifestObj = {
      datasetName,
      version: "2026.09.27.1",
      totalShards: 2,
      totalRecords: 2,
      totalBytes: Buffer.byteLength(content1) + Buffer.byteLength(content2),
      createdAt: now,
    };

    db.recordDatasetSnapshot({
      snapshotId: `dss_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      datasetName,
      version: "2026.09.27.1",
      splitsJson: JSON.stringify({ train: 0.8, validation: 0.1, test: 0.1 }),
      shardCount: 2,
      totalRecordCount: 2,
      totalSizeBytes: manifestObj.totalBytes,
      totalTokensEstimated: 25,
      manifestUri: `file://${join(sourceShardsDir, "manifest.json")}`,
      manifestJson: JSON.stringify(manifestObj, null, 2),
      createdAt: now,
    });

    // 3. Start test HTTP server
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
    mcpServer = new ProtokolMcpServer();
  });

  after(async () => {
    mcpServer.close();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    // Cleanup temporary test artifacts
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("ColdVaultExporter.initVolume creates standard self-describing directory layout", () => {
    const exporter = new ColdVaultExporter(db);
    const volumeInfo = exporter.initVolume(volumeRoot, "VOL-2026-TEST", "btrfs");

    assert.equal(volumeInfo.volumeLabel, "VOL-2026-TEST");
    assert.equal(volumeInfo.filesystem, "btrfs");
    assert.equal(volumeInfo.schemaVersion, "1.0.0");
    assert.ok(existsSync(join(volumeRoot, "volume.json")));
    assert.ok(existsSync(join(volumeRoot, "checksums")));
    assert.ok(existsSync(join(volumeRoot, "datasets")));
    assert.ok(existsSync(join(volumeRoot, "logs")));
  });

  it("ColdVaultExporter.exportDataset packages shards, computes SHA256SUMS, and records replicas", async () => {
    const exporter = new ColdVaultExporter(db);
    const receipt = await exporter.exportDataset({
      datasetName,
      volumeRoot,
      version: "2026.09.27.1",
      copyMode: "copy",
      verifyChecksums: true,
    });

    assert.equal(receipt.datasetName, datasetName);
    assert.equal(receipt.version, "2026.09.27.1");
    assert.equal(receipt.totalShards, 2);
    assert.ok(receipt.totalSizeBytes > 0);

    // Verify files on cold vault volume
    const targetDir = join(volumeRoot, "datasets", datasetName, "2026.09.27.1");
    const exportedShard1 = join(targetDir, "physics-shard-00001.parquet");
    const exportedShard2 = join(targetDir, "physics-shard-00002.parquet");
    const exportedManifest = join(targetDir, "manifest.json");

    assert.ok(existsSync(exportedShard1));
    assert.ok(existsSync(exportedShard2));
    assert.ok(existsSync(exportedManifest));

    // Verify SHA256SUMS ledger
    const sha256sumsPath = join(volumeRoot, "checksums", "SHA256SUMS");
    assert.ok(existsSync(sha256sumsPath));
    const ledgerContent = readFileSync(sha256sumsPath, "utf8");

    assert.ok(ledgerContent.includes(shard1Hash));
    assert.ok(ledgerContent.includes(shard2Hash));
    assert.ok(
      ledgerContent.includes(`datasets/${datasetName}/2026.09.27.1/physics-shard-00001.parquet`)
    );

    // Verify storage_replicas in database
    const replicas1 = db.listStorageReplicas(shardId1);
    assert.ok(replicas1.length >= 1);
    assert.equal(replicas1[0].storageProvider, "local_cold_vault");
    assert.equal(replicas1[0].syncStatus, "VERIFIED");
    assert.equal(replicas1[0].remoteSha256Hash, shard1Hash);
  });

  it("ColdVaultExporter.verifyVolume confirms volume integrity as healthy", async () => {
    const exporter = new ColdVaultExporter(db);
    const verification = await exporter.verifyVolume(volumeRoot);

    assert.equal(verification.status, "healthy");
    assert.equal(verification.corruptedFiles, 0);
    assert.equal(verification.missingFiles, 0);
    assert.ok(verification.verifiedFiles >= 3); // 2 shards + 1 manifest
  });

  it("ColdVaultExporter.verifyVolume detects file corruption and tampering", async () => {
    const exporter = new ColdVaultExporter(db);
    const targetDir = join(volumeRoot, "datasets", datasetName, "2026.09.27.1");
    const shardToCorrupt = join(targetDir, "physics-shard-00001.parquet");

    // Tamper with content
    writeFileSync(shardToCorrupt, "TAMPERED BIT-ROT CORRUPTED DATA", "utf8");

    const verification = await exporter.verifyVolume(volumeRoot);
    assert.equal(verification.status, "corrupted");
    assert.ok(verification.corruptedFiles >= 1);

    // Restore original content
    writeFileSync(
      shardToCorrupt,
      "Sample physics document 1: General Relativity and Gravitational Waves.\n",
      "utf8"
    );
    const restoredVerification = await exporter.verifyVolume(volumeRoot);
    assert.equal(restoredVerification.status, "healthy");
  });

  it("POST /api/v1/vault/export exports dataset via REST endpoint", async () => {
    const restVolumeRoot = join(testDir, "VOL-REST-API");
    const res = await fetch(`${baseUrl}/api/v1/vault/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetName,
        volumeRoot: restVolumeRoot,
        volumeLabel: "VOL-REST-API",
      }),
    });

    assert.equal(res.status, 201);
    const data = (await res.json()) as {
      success: boolean;
      receipt: { totalShards: number; datasetName: string };
    };
    assert.equal(data.success, true);
    assert.equal(data.receipt.datasetName, datasetName);
    assert.equal(data.receipt.totalShards, 2);
  });

  it("POST /api/v1/vault/export rejects missing datasetName with 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/vault/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumeRoot: "some/path" }),
    });

    assert.equal(res.status, 400);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "INVALID_EXPORT_PAYLOAD");
  });

  it("POST /api/v1/vault/export blocks path traversal with 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/vault/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetName,
        volumeRoot: "../../etc/cold_vault",
      }),
    });

    assert.equal(res.status, 403);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "PATH_TRAVERSAL_DETECTED");
  });

  it("POST /api/v1/vault/verify audits volume via REST endpoint", async () => {
    const res = await fetch(`${baseUrl}/api/v1/vault/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volumeRoot }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      success: boolean;
      verification: { status: string; verifiedFiles: number };
    };
    assert.equal(data.success, true);
    assert.equal(data.verification.status, "healthy");
    assert.ok(data.verification.verifiedFiles >= 3);
  });

  it("GET /api/v1/vault/inspect returns volume metadata", async () => {
    const res = await fetch(
      `${baseUrl}/api/v1/vault/inspect?volumeRoot=${encodeURIComponent(volumeRoot)}`
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      success: boolean;
      volume: { volumeLabel: string; schemaVersion: string };
    };
    assert.equal(data.success, true);
    assert.equal(data.volume.volumeLabel, "VOL-2026-TEST");
    assert.equal(data.volume.schemaVersion, "1.0.0");
  });

  it("MCP tool 'export_cold_vault' packages dataset via JSON-RPC", async () => {
    const mcpVolumeRoot = join(testDir, "VOL-MCP-EXPORT");
    const res = await mcpServer.processRequest({
      jsonrpc: "2.0",
      id: "mcp-export-1",
      method: "tools/call",
      params: {
        name: "export_cold_vault",
        arguments: {
          datasetName,
          volumeRoot: mcpVolumeRoot,
          volumeLabel: "VOL-MCP-EXPORT",
        },
      },
    });

    assert.ok(res);
    assert.equal(res.id, "mcp-export-1");
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text) as {
      datasetName: string;
      totalShards: number;
    };
    assert.equal(parsed.datasetName, datasetName);
    assert.equal(parsed.totalShards, 2);
  });

  it("MCP tool 'verify_cold_vault' verifies volume via JSON-RPC", async () => {
    const res = await mcpServer.processRequest({
      jsonrpc: "2.0",
      id: "mcp-verify-1",
      method: "tools/call",
      params: {
        name: "verify_cold_vault",
        arguments: {
          volumeRoot,
        },
      },
    });

    assert.ok(res);
    assert.equal(res.id, "mcp-verify-1");
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    assert.equal(result.isError, undefined);
    const parsed = JSON.parse(result.content[0].text) as {
      status: string;
      verifiedFiles: number;
    };
    assert.equal(parsed.status, "healthy");
    assert.ok(parsed.verifiedFiles >= 3);
  });
});
