import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { RegistryDatabase } from "../src/api/registry-database.js";
import { TextNormalizer } from "../src/pipeline/processors/text-normalizer.js";
import {
  reconcileWorkerProvenance,
  recordWorkerProvenance,
} from "../src/storage/producer-provenance.js";

test("Python and TypeScript produce compatible canonical identities", () => {
  const samples = [
    " A\r\nＡ ",
    "a\t  b\n\n\n\n c",
    "\u0085text\u0085",
    "\u200bＡ\u00a0 B\u2060",
    "\u2028x\u2029",
  ];
  const output = spawnSync(
    ".venv/bin/python",
    [
      "-c",
      "import json,sys; from pipelines.shared.producer_provenance import canonical_text; print(json.dumps([canonical_text(s) for s in json.loads(sys.argv[1])]))",
      JSON.stringify(samples),
    ],
    { encoding: "utf8" }
  );
  assert.equal(output.status, 0, output.stderr);
  const normalizer = new TextNormalizer();
  assert.deepEqual(
    JSON.parse(output.stdout),
    samples.map((text) => [normalizer.normalize(text), normalizer.canonicalizationVersion])
  );
});

test("Worker raw evidence and normalized lineage replay atomically in the actual catalog", () => {
  const root = mkdtempSync(join(tmpdir(), "producer-"));
  const path = join(root, "catalog.sqlite");
  const previous = process.env.PROTOKOL_PROVENANCE_DB;
  try {
    const registry = new RegistryDatabase({ dbPath: path });
    registry.close();
    process.env.PROTOKOL_PROVENANCE_DB = path;
    const receipt = {
      sha256: createHash("sha256").update("<p>Actual text</p>").digest("hex"),
      size: 18,
      storageUri: "object-store://local/raw/key",
      sourceUri: "https://example.org/page?api_key=secret",
      sourceId: "fixture",
      sourceRecordId: "one",
      runId: randomUUID(),
      acquiredAt: new Date().toISOString(),
      text: "Actual text",
    };
    recordWorkerProvenance({ ...receipt, text: undefined });
    recordWorkerProvenance(receipt);
    recordWorkerProvenance(receipt);
    const ledgerPath = join(root, "ledger.sqlite");
    const ledger = new DatabaseSync(ledgerPath);
    ledger.exec("CREATE TABLE jobs(id TEXT,status TEXT,updated_at TEXT)");
    ledger
      .prepare("INSERT INTO jobs VALUES (?,?,?)")
      .run(receipt.runId, "succeeded", receipt.acquiredAt);
    ledger.close();
    reconcileWorkerProvenance(ledgerPath);
    reconcileWorkerProvenance(ledgerPath);
    const db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("SELECT count(*) AS n FROM document_occurrences").get()?.n, 1);
      assert.equal(db.prepare("SELECT count(*) AS n FROM raw_artifacts").get()?.n, 1);
      assert.equal(
        db.prepare("SELECT source_uri FROM document_occurrences").get()?.source_uri,
        "https://example.org/page"
      );
      assert.equal(db.prepare("SELECT count(*) AS n FROM raw_artifact_acquisitions").get()?.n, 1);
      assert.equal(
        db.prepare("SELECT status FROM pipeline_run_manifests").get()?.status,
        "success"
      );
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      db.close();
    }
  } finally {
    if (previous === undefined) delete process.env.PROTOKOL_PROVENANCE_DB;
    else process.env.PROTOKOL_PROVENANCE_DB = previous;
    rmSync(root, { recursive: true, force: true });
  }
});
