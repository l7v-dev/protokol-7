import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { RegistryDatabase } from "../src/api/registry-database";
import { PipelineRunner } from "../src/pipeline/pipeline-runner";
import { DecontaminateFilter } from "../src/pipeline/processors/decontaminate-filter";
import { ParquetPacker } from "../src/pipeline/processors/parquet-packer";
import { TextNormalizer } from "../src/pipeline/processors/text-normalizer";
import type { StorageBackend, StorageReceipt } from "../src/pipeline/storage";

const normalizer = new TextNormalizer();
const hash = createHash("sha256").update("evaluation text").digest("hex");
const config = {
  enabled: true,
  canonicalization_version: normalizer.canonicalizationVersion,
  evaluation_snapshot_ids: ["eval-snapshot-1"],
  evaluation_hashes: [hash],
};
const records = normalizer.processBatch([
  {
    id: "overlap",
    split: "train",
    text: "evaluation   text",
    occurrences: [{ source_id: "source-a" }],
  },
  { id: "retained", split: "train", text: "evaluation texT" },
  { id: "evaluation", split: "test", text: "evaluation text" },
]);

class CapturingStorage implements StorageBackend {
  readonly backend = "local";
  readonly writes: Array<{ name: string; buffer: Buffer; prefix: string }> = [];
  async upload(name: string, buffer: Buffer, prefix = ""): Promise<StorageReceipt> {
    this.writes.push({ name, buffer, prefix });
    return {
      backend: this.backend,
      uri: `memory://${prefix}/${name}`,
      bytesWritten: buffer.length,
      checksumSha256: createHash("sha256").update(buffer).digest("hex"),
      timestamp: new Date().toISOString(),
    };
  }
}

describe("Exact evaluation decontamination", () => {
  it("quarantines normalized train overlap and preserves evaluation and occurrence links", () => {
    const before = JSON.stringify(records);
    const result = new DecontaminateFilter(config).partition(records);
    assert.deepEqual(
      result.retained.map((record) => record.id),
      ["retained", "evaluation"]
    );
    assert.deepEqual(result.quarantined[0].occurrences, [{ source_id: "source-a" }]);
    assert.equal(result.report.overlapCount, 1);
    assert.equal(result.report.remainingOverlapCount, 0);
    assert.equal(result.report.algorithm, "exact-sha256");
    assert.equal(JSON.stringify(records), before);
  });

  it("blocks unknown splits, missing hashes and incompatible policies", () => {
    const filter = new DecontaminateFilter(config);
    assert.throws(
      () =>
        filter.partition([
          { split: "train", canonicalization_version: "other", normalized_sha256: hash },
        ]),
      /versions/
    );
    assert.throws(() =>
      filter.partition([
        { split: "train", canonicalization_version: config.canonicalization_version },
      ])
    );
    assert.throws(() => filter.partition([{ normalized_sha256: hash }]), /explicit/);
    assert.throws(() => new DecontaminateFilter({ ...config, evaluation_snapshot_ids: [] }));
  });

  it("runner uploads separate quarantine/report artifacts before the retained output", async () => {
    const storage = new CapturingStorage();
    const db = new RegistryDatabase({ inMemory: true });
    try {
      const runner = new PipelineRunner({
        registryDb: db,
        storageBackends: { local: storage, quarantine: storage },
        executor: {
          name: "fixture",
          async run() {
            return { success: true, items: records, itemCount: records.length, durationMs: 0 };
          },
        },
      });
      const result = await runner.runYaml(
        `name: decontamination-fixture\nactor:\n  id: cheerio-scraper\n  config:\n    targetUrl: https://example.org\ndecontamination:\n  canonicalization_version: ${config.canonicalization_version}\n  evaluation_snapshot_ids: [eval-snapshot-1]\n  evaluation_hashes: [${hash}]\ndedup:\n  enabled: true\n`
      );
      assert.equal(result.status, "succeeded");
      assert.equal(result.itemCount, 2);
      assert.equal(result.contamination?.overlapCount, 1);
      assert.ok(result.contaminationReceipt);
      assert.ok(result.quarantineReceipt);
      assert.deepEqual(db.listPipelineExecutions()[0].contamination, result.contamination);
      assert.deepEqual(
        db.listPipelineExecutions()[0].contaminationReceipt,
        result.contaminationReceipt
      );
      assert.match(storage.writes[1].prefix, /^quarantine\//);
      assert.equal(JSON.parse(storage.writes[1].buffer.toString().trim()).id, "overlap");
      assert.equal(storage.writes[2].buffer.toString().includes('"id":"overlap"'), false);
    } finally {
      db.close();
    }
  });
  it("evaluation records bypass quality filters even when train rows are rejected", async () => {
    const storage = new CapturingStorage();
    const db = new RegistryDatabase({ inMemory: true });
    try {
      const runner = new PipelineRunner({
        registryDb: db,
        storageBackends: { local: storage, quarantine: storage },
        executor: {
          name: "fixture-quality",
          async run() {
            return { success: true, items: records, itemCount: records.length, durationMs: 0 };
          },
        },
      });
      const result = await runner.runYaml(
        `name: eval-preservation-fixture\nactor:\n  id: cheerio-scraper\n  config:\n    targetUrl: https://example.org\ndecontamination:\n  canonicalization_version: ${config.canonicalization_version}\n  evaluation_snapshot_ids: [eval-snapshot-1]\n  evaluation_hashes: [${hash}]\nquality_gate:\n  min_words: 3\n  min_chars: 1\n`
      );
      assert.equal(result.status, "succeeded");
      assert.equal(result.itemCount, 1);
      const retained = JSON.parse(storage.writes[2].buffer.toString().trim());
      assert.deepEqual(retained, records[2]);
    } finally {
      db.close();
    }
  });
});

describe("Document PII status output", () => {
  it("preserves statuses in real Parquet, including missing status in the first record", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pii-parquet-"));
    try {
      const packer = new ParquetPacker({
        pythonPath: join(process.cwd(), ".venv/bin/python"),
        disableFallback: true,
      });
      const output = await packer.process(
        [{ text: "first" }, { text: "second", pii_status: "redacted" }],
        "fixture"
      );
      const path = join(dir, "fixture.parquet");
      writeFileSync(path, output.buffer);
      const read = spawnSync(
        join(process.cwd(), ".venv/bin/python"),
        [
          "-c",
          "import json, sys, pyarrow.parquet as pq; t=pq.read_table(sys.argv[1]); print(json.dumps({'values':t.column('pii_status').to_pylist(), 'type':str(t.schema.field('pii_status').type)}))",
          path,
        ],
        { encoding: "utf8" }
      );
      assert.equal(read.status, 0, read.stderr);
      assert.deepEqual(JSON.parse(read.stdout), {
        values: ["unchecked", "redacted"],
        type: "string",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fallback keeps unchecked status and never bypasses invalid-status validation", async () => {
    const packer = new ParquetPacker({ pythonPath: "missing-python" });
    const output = await packer.process([{ text: "fixture" }], "fallback");
    assert.equal(JSON.parse(output.buffer.toString()).pii_status, "unchecked");
    await assert.rejects(packer.process([{ pii_status: "assumed-clear" }], "invalid"));
  });
});
