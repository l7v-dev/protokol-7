import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { LocalExecutor } from "../src/pipeline/execution/local-executor";
import { BufferedSink, StreamSink } from "../src/pipeline/output-sink";
import { PipelineRunner } from "../src/pipeline/pipeline-runner";
import { CsvWriter } from "../src/pipeline/processors/csv-writer";
import { JsonlWriter } from "../src/pipeline/processors/jsonl-writer";
import { ParquetPacker } from "../src/pipeline/processors/parquet-packer";
import { PassthroughWriter } from "../src/pipeline/processors/passthrough-writer";
import { LocalStorage } from "../src/pipeline/storage/local-storage";

describe("Pipeline Execution & Processing Layer", () => {
  let tempPoolDir: string;

  beforeEach(() => {
    tempPoolDir = mkdtempSync(join(tmpdir(), "protokol-test-pool-"));
  });

  afterEach(() => {
    try {
      rmSync(tempPoolDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("Output Sinks", () => {
    it("BufferedSink accumulates items and tracks metrics", () => {
      const sink = new BufferedSink();
      sink.write([
        { id: 1, title: "Alpha" },
        { id: 2, title: "Beta" },
      ]);
      assert.equal(sink.getItemCount(), 2);
      assert.ok(sink.getByteLength() > 0);
      assert.equal(sink.getItems().length, 2);
    });

    it("StreamSink accepts items until closed", () => {
      const sink = new StreamSink();
      sink.write([{ item: 1 }]);
      sink.close();
      assert.equal(sink.getItemCount(), 1);
      assert.throws(() => sink.write([{ item: 2 }]), /Cannot write to closed/);
    });
  });

  describe("Output Processors", () => {
    const sampleItems = [
      { id: "doc-1", title: "Introduction", rank: 1 },
      { id: "doc-2", title: "Methods", rank: 2 },
    ];

    it("JsonlWriter formats records into newline-delimited JSON buffer", async () => {
      const writer = new JsonlWriter();
      const output = await writer.process(sampleItems, "test-output");

      assert.equal(output.format, "jsonl");
      assert.equal(output.fileName, "test-output.jsonl");
      assert.equal(output.rowCount, 2);

      const content = output.buffer.toString("utf8");
      const lines = content.trim().split("\n");
      assert.equal(lines.length, 2);
      assert.deepEqual(JSON.parse(lines[0]), sampleItems[0]);
      assert.deepEqual(JSON.parse(lines[1]), sampleItems[1]);
    });

    it("PassthroughWriter formats records into JSON buffer", async () => {
      const writer = new PassthroughWriter();
      const output = await writer.process(sampleItems, "test-output");

      assert.equal(output.format, "passthrough");
      assert.equal(output.fileName, "test-output.json");
      const parsed = JSON.parse(output.buffer.toString("utf8"));
      assert.deepEqual(parsed, sampleItems);
    });

    it("CsvWriter formats records into RFC 4180 CSV buffer", async () => {
      const writer = new CsvWriter();
      const output = await writer.process(sampleItems, "test-output");

      assert.equal(output.format, "csv");
      assert.equal(output.fileName, "test-output.csv");
      const text = output.buffer.toString("utf8");
      assert.ok(text.includes("id,title,rank"));
      assert.ok(text.includes("doc-1,Introduction,1"));
    });

    it("ParquetPacker falls back to JSONL when subprocess bridge is unavailable", async () => {
      const packer = new ParquetPacker({ pythonPath: "invalid-nonexistent-python" });
      const output = await packer.process(sampleItems, "fallback-test");

      assert.equal(output.format, "jsonl");
      assert.equal(output.fileName, "fallback-test.jsonl");
      assert.equal(output.rowCount, 2);
    });
  });

  describe("LocalStorage Backend", () => {
    it("writes data buffer and calculates accurate SHA-256 StorageReceipt", async () => {
      const storage = new LocalStorage({ baseDir: tempPoolDir });
      const payload = Buffer.from("test-payload-data", "utf8");
      const expectedHash = createHash("sha256").update(payload).digest("hex");

      const receipt = await storage.upload("artifact.txt", payload, "subfolder");

      assert.equal(receipt.backend, "local");
      assert.equal(receipt.bytesWritten, payload.length);
      assert.equal(receipt.checksumSha256, expectedHash);
      assert.ok(existsSync(receipt.uri));

      const written = readFileSync(receipt.uri, "utf8");
      assert.equal(written, "test-payload-data");
    });
  });

  describe("PipelineRunner Orchestration", () => {
    it("executes end-to-end pipeline run with custom local executor", async () => {
      const mockItems = [
        { title: "Article 1", content: "Content 1" },
        { title: "Article 2", content: "Content 2" },
      ];

      const executor = new LocalExecutor({
        customRunner: async (_actorId, _config) => mockItems,
      });

      const storage = new LocalStorage({ baseDir: tempPoolDir });

      const runner = new PipelineRunner({
        executor,
        storageBackends: { local: storage },
      });

      const yaml = `
name: end-to-end-pipeline
actor:
  id: wikimedia
  config:
    title: "Türkiye"
schedule:
  type: one-time
execution:
  target: local
output:
  format: jsonl
storage:
  backend: local
  prefix: "harvested/wiki"
`;

      const result = await runner.runYaml(yaml);

      assert.equal(result.status, "succeeded");
      assert.equal(result.pipelineName, "end-to-end-pipeline");
      assert.equal(result.actorId, "wikimedia");
      assert.equal(result.itemCount, 2);
      assert.ok(result.durationMs >= 0);
      assert.ok(result.receipt);
      assert.ok(existsSync(result.receipt.uri));

      // Verify file content matches written lines
      const content = readFileSync(result.receipt.uri, "utf8").trim().split("\n");
      assert.equal(content.length, 2);
      assert.deepEqual(JSON.parse(content[0]), mockItems[0]);

      // Verify run history
      assert.equal(runner.getRunHistory().length, 1);
      assert.equal(runner.getFailedRuns().length, 0);
    });

    it("gracefully catches actor execution failure without crashing host process", async () => {
      const executor = new LocalExecutor({
        customRunner: async () => {
          throw new Error("Simulated upstream network timeout");
        },
      });

      const runner = new PipelineRunner({ executor });

      const yaml = `
name: failing-pipeline
actor:
  id: wikimedia
  config:
    title: "Failure"
`;

      const result = await runner.runYaml(yaml);

      assert.equal(result.status, "failed");
      assert.match(result.error || "", /Simulated upstream network timeout/);
      assert.equal(runner.getFailedRuns().length, 1);
      assert.equal(runner.getRunHistory().length, 1);
    });

    it("handles invalid YAML or missing actor gracefully", async () => {
      const runner = new PipelineRunner();
      const yaml = `
name: unknown-actor-pipeline
actor:
  id: does-not-exist
  config: {}
`;

      const result = await runner.runYaml(yaml);

      assert.equal(result.status, "failed");
      assert.match(result.error || "", /Actor not registered/);
      assert.equal(runner.getFailedRuns().length, 1);
    });
  });
});
