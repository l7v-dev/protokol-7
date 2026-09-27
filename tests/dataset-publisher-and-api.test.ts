/**
 * Test Suite: Dataset Snapshot, Training Manifest Publisher, and REST/MCP Endpoints.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createServer } from "../src/api/server";
import { DatasetPublisher } from "../src/dataset/dataset-publisher";
import { ProtokolMcpServer } from "../src/mcp/protokol-mcp-server";

describe("Dataset Publisher & Training Manifest API", () => {
  let server: http.Server;
  let baseUrl: string;
  const testOutputDir = join(process.cwd(), "data", "test_snapshots");
  const testShardsDir = join(process.cwd(), "data", "test_shards");

  before(async () => {
    // Setup test dirs
    mkdirSync(testOutputDir, { recursive: true });
    mkdirSync(testShardsDir, { recursive: true });

    // Start test HTTP server
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    // Cleanup test dirs
    try {
      if (existsSync(testOutputDir)) rmSync(testOutputDir, { recursive: true, force: true });
      if (existsSync(testShardsDir)) rmSync(testShardsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it("DatasetPublisher.publishSnapshot creates verified manifest and checksums file", async () => {
    const file1 = join(testShardsDir, "test-shard-01.parquet");
    const file2 = join(testShardsDir, "test-shard-02.parquet");
    const file3 = join(testShardsDir, "test-shard-03.parquet");

    writeFileSync(file1, "MOCK_PARQUET_CONTENT_1");
    writeFileSync(file2, "MOCK_PARQUET_CONTENT_2");
    writeFileSync(file3, "MOCK_PARQUET_CONTENT_3");

    const publisher = new DatasetPublisher();
    const result = await publisher.publishSnapshot({
      datasetName: "unit_test_corpus",
      version: "1.0.0",
      filePaths: [file1, file2, file3],
      outputDir: join("data", "test_snapshots", "unit_test_v1"),
      splitRatios: { train: 0.6, validation: 0.2, test: 0.2 },
      licenseGroup: "permissive_commercial",
      metadata: { recordCountPerFile: 50, language: "en" },
    });

    assert.equal(result.datasetName, "unit_test_corpus");
    assert.equal(result.version, "1.0.0");
    assert.ok(result.snapshotId.startsWith("dss_"));

    // Check manifest properties
    assert.equal(result.manifest.schemaVersion, "1.0.0");
    assert.equal(result.manifest.statistics.totalShards, 3);
    assert.equal(result.manifest.statistics.totalRecords, 150);
    assert.ok(result.manifest.statistics.totalTokensEstimated > 0);

    // Check splits
    assert.ok(result.splits.train.shardCount >= 1);
    assert.equal(
      result.splits.train.shardCount +
        result.splits.validation.shardCount +
        result.splits.test.shardCount,
      3
    );

    // Check manifest file on disk
    const manifestPath = join(
      process.cwd(),
      "data",
      "test_snapshots",
      "unit_test_v1",
      "manifest.json"
    );
    assert.ok(existsSync(manifestPath));
    const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
    assert.equal(parsed.datasetName, "unit_test_corpus");

    // Check checksums.sha256 file on disk
    const checksumsPath = join(
      process.cwd(),
      "data",
      "test_snapshots",
      "unit_test_v1",
      "checksums.sha256"
    );
    assert.ok(existsSync(checksumsPath));
    const checksumsContent = readFileSync(checksumsPath, "utf-8");
    assert.ok(checksumsContent.includes("test-shard-01.parquet"));
  });

  it("DatasetPublisher handles single shard edge case with 100% train split", async () => {
    const singleFile = join(testShardsDir, "single-shard.parquet");
    writeFileSync(singleFile, "SINGLE_SHARD_CONTENT");

    const publisher = new DatasetPublisher();
    const result = await publisher.publishSnapshot({
      datasetName: "single_shard_corpus",
      filePaths: [singleFile],
      outputDir: join("data", "test_snapshots", "single_v1"),
    });

    assert.equal(result.splits.train.shardCount, 1);
    assert.equal(result.splits.validation.shardCount, 0);
    assert.equal(result.splits.test.shardCount, 0);
  });

  it("DatasetPublisher respects explicit split mapping", async () => {
    const s1 = join(testShardsDir, "part-a.parquet");
    const s2 = join(testShardsDir, "part-b.parquet");
    writeFileSync(s1, "PART_A");
    writeFileSync(s2, "PART_B");

    const publisher = new DatasetPublisher();
    const result = await publisher.publishSnapshot({
      datasetName: "explicit_split_corpus",
      filePaths: [s1, s2],
      explicitSplits: {
        train: ["part-a.parquet"],
        test: ["part-b.parquet"],
      },
      outputDir: join("data", "test_snapshots", "explicit_v1"),
    });

    assert.equal(result.splits.train.shardCount, 1);
    assert.equal(result.splits.test.shardCount, 1);
    assert.equal(result.splits.train.shards[0].fileName, "part-a.parquet");
    assert.equal(result.splits.test.shards[0].fileName, "part-b.parquet");
  });

  it("DatasetPublisher rejects path traversal in outputDir", async () => {
    const publisher = new DatasetPublisher();
    await assert.rejects(
      async () => {
        await publisher.publishSnapshot({
          datasetName: "traversal_test",
          filePaths: [join(testShardsDir, "single-shard.parquet")],
          outputDir: "../../unsafe_dir",
        });
      },
      {
        message: /Path traversal detected/,
      }
    );
  });

  it("POST /api/v1/datasets/publish creates snapshot via HTTP REST", async () => {
    const shardFile = join(testShardsDir, "http-shard.parquet");
    writeFileSync(shardFile, "HTTP_TEST_CONTENT");

    const res = await fetch(`${baseUrl}/api/v1/datasets/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        datasetName: "http_api_dataset",
        version: "2026.09.27",
        filePaths: [shardFile],
        outputDir: join("data", "test_snapshots", "http_api_v1"),
      }),
    });

    assert.equal(res.status, 201);
    const data = (await res.json()) as {
      success: boolean;
      datasetName: string;
      snapshotId: string;
      statistics: { totalShards: number };
    };
    assert.equal(data.success, true);
    assert.equal(data.datasetName, "http_api_dataset");
    assert.ok(data.snapshotId);
    assert.equal(data.statistics.totalShards, 1);
  });

  it("POST /api/v1/datasets/publish rejects invalid payload with 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/datasets/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "INVALID_DATASET_PAYLOAD");
  });

  it("GET /api/v1/datasets returns catalog list with snapshot summary", async () => {
    const res = await fetch(`${baseUrl}/api/v1/datasets`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      success: boolean;
      count: number;
      datasets: Array<{ name: string; shardCount: number }>;
    };
    assert.equal(data.success, true);
    assert.ok(data.count > 0);
    assert.ok(data.datasets.some((d) => d.name === "http_api_dataset"));
  });

  it("GET /api/v1/datasets/:name returns details, shards, and snapshots", async () => {
    const res = await fetch(`${baseUrl}/api/v1/datasets/http_api_dataset`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      success: boolean;
      dataset: { name: string };
      shards: { count: number };
      snapshots: { count: number };
    };
    assert.equal(data.success, true);
    assert.equal(data.dataset.name, "http_api_dataset");
    assert.ok(data.snapshots.count >= 1);
  });

  it("GET /api/v1/datasets/:name returns 404 for unknown dataset", async () => {
    const res = await fetch(`${baseUrl}/api/v1/datasets/non_existent_dataset_12345`);
    assert.equal(res.status, 404);

    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "DATASET_NOT_FOUND");
  });

  it("GET /api/v1/datasets/:name/manifest returns raw manifest.json", async () => {
    const res = await fetch(`${baseUrl}/api/v1/datasets/http_api_dataset/manifest`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      schemaVersion: string;
      datasetName: string;
      statistics: { totalShards: number };
    };
    assert.equal(data.schemaVersion, "1.0.0");
    assert.equal(data.datasetName, "http_api_dataset");
    assert.equal(data.statistics.totalShards, 1);
  });

  it("MCP tools/call executes publish_dataset, list_datasets, and get_dataset_manifest", async () => {
    const mcp = new ProtokolMcpServer();
    const testShard = join(testShardsDir, "mcp-shard.parquet");
    writeFileSync(testShard, "MCP_TEST_CONTENT");

    // 1. publish_dataset
    const publishRes = await mcp.processRequest({
      jsonrpc: "2.0",
      id: "mcp-pub-1",
      method: "tools/call",
      params: {
        name: "publish_dataset",
        arguments: {
          datasetName: "mcp_corpus",
          version: "1.0.0",
          filePaths: [testShard],
          outputDir: join("data", "test_snapshots", "mcp_v1"),
        },
      },
    });

    assert.ok(publishRes?.result);
    const pubResult = publishRes.result as { content: Array<{ text: string }> };
    const pubContent = JSON.parse(pubResult.content[0].text);
    assert.equal(pubContent.datasetName, "mcp_corpus");

    // 2. list_datasets
    const listRes = await mcp.processRequest({
      jsonrpc: "2.0",
      id: "mcp-list-1",
      method: "tools/call",
      params: {
        name: "list_datasets",
        arguments: {},
      },
    });

    assert.ok(listRes?.result);
    const listResult = listRes.result as { content: Array<{ text: string }> };
    const listContent = JSON.parse(listResult.content[0].text);
    assert.ok(listContent.count > 0);
    assert.ok(listContent.datasets.some((d: { name: string }) => d.name === "mcp_corpus"));

    // 3. get_dataset_manifest
    const manifestRes = await mcp.processRequest({
      jsonrpc: "2.0",
      id: "mcp-man-1",
      method: "tools/call",
      params: {
        name: "get_dataset_manifest",
        arguments: {
          identifier: "mcp_corpus",
        },
      },
    });

    assert.ok(manifestRes?.result);
    const manResult = manifestRes.result as { content: Array<{ text: string }> };
    const manContent = JSON.parse(manResult.content[0].text);
    assert.equal(manContent.datasetName, "mcp_corpus");
    assert.equal(manContent.schemaVersion, "1.0.0");
  });
});
