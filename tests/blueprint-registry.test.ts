import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { applyBlueprintMigration } from "../src/api/blueprint-migration";
import { RegistryDatabase } from "../src/api/registry-database";
import { recordAnomaly } from "../src/telemetry/anomalies";
import { LogEmitter } from "../src/telemetry/log-emitter";

const TRACE_ID = "1".repeat(32);
const SPAN_ID = "2".repeat(16);
const NOW = "2026-10-05T12:00:00.000Z";

describe("Blueprint registry migration", () => {
  it("upgrades existing rows and reopens without duplicate columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "blueprint-registry-"));
    const path = join(dir, "registry.sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE actor_runs (
        run_id TEXT PRIMARY KEY, actor_name TEXT NOT NULL, status TEXT NOT NULL,
        input_json TEXT NOT NULL, output_json TEXT, error_message TEXT,
        item_count INTEGER DEFAULT 0, duration_ms INTEGER, started_at TEXT NOT NULL, finished_at TEXT
      );
      INSERT INTO actor_runs (run_id, actor_name, status, input_json, started_at)
        VALUES ('legacy-run', 'arxiv', 'succeeded', '{"q":"existing"}', '${NOW}');
    `);
    legacy.close();
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const registry = new RegistryDatabase({ dbPath: path });
        try {
          assert.equal(registry.getRun("legacy-run")?.status, "succeeded");
          assert.deepEqual(registry.getRun("legacy-run")?.input, { q: "existing" });
          registry.createRun({
            runId: `new-run-${attempt}`,
            actorName: "arxiv",
            input: {},
            startedAt: NOW,
            metadata: { traceId: TRACE_ID, spanId: SPAN_ID },
          });
          assert.equal(registry.getRun(`new-run-${attempt}`)?.metadata?.traceId, TRACE_ID);
          assert.equal(
            registry.listRuns().find((run) => run.runId === `new-run-${attempt}`)?.metadata?.spanId,
            SPAN_ID
          );
        } finally {
          registry.close();
        }
      }
      const db = new DatabaseSync(path);
      try {
        const columns = db.prepare("PRAGMA table_info(actor_runs)").all();
        assert.equal(columns.filter((column) => column.name === "trace_id").length, 1);
        const names = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table'")
          .all()
          .map((row) => row.name);
        for (const table of [
          "pipeline_run_manifests",
          "document_provenance",
          "document_occurrences",
          "dataset_release_gates",
          "otel_log_events",
          "source_verification_evidence",
        ]) {
          assert.ok(names.includes(table), table);
        }
        assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rolls back every Blueprint change when an index cannot be created", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(
        "CREATE TABLE actor_runs (run_id TEXT); CREATE TABLE dataset_snapshots (snapshot_id TEXT PRIMARY KEY); CREATE TABLE dataset_shards (shard_id TEXT); CREATE TABLE otel_log_events (event_id INTEGER);"
      );
      assert.throws(() => applyBlueprintMigration(db), /trace_id|no such column/);
      assert.equal(
        db.prepare("SELECT name FROM sqlite_master WHERE name='document_provenance'").all().length,
        0
      );
      assert.equal(
        db
          .prepare("PRAGMA table_info(actor_runs)")
          .all()
          .some((row) => row.name === "trace_id"),
        false
      );
      db.exec("BEGIN; ROLLBACK;");
    } finally {
      db.close();
    }
  });

  it("matches the fresh SQL schema and enforces foreign keys and gate constraints", () => {
    const dir = mkdtempSync(join(tmpdir(), "blueprint-schema-"));
    const path = join(dir, "registry.sqlite");
    const registry = new RegistryDatabase({ dbPath: path });
    registry.close();
    const actual = new DatabaseSync(path);
    const expected = new DatabaseSync(":memory:");
    try {
      expected.exec(readFileSync("context/schema.sql", "utf8"));
      const tables = expected
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name != 'sqlite_sequence'")
        .all();
      for (const { name } of tables) {
        const columns = (db: DatabaseSync) =>
          db
            .prepare(`PRAGMA table_info(${name})`)
            .all()
            .map(({ cid: _cid, ...column }) => column)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        assert.deepEqual(columns(actual), columns(expected), String(name));
      }
      actual.exec("PRAGMA foreign_keys=ON");
      assert.throws(
        () =>
          actual.exec(
            `INSERT INTO document_occurrences (document_id,source_id,source_record_id,source_uri,acquired_at,raw_artifact_id) VALUES ('missing','source','record','https://example.org','${NOW}','raw')`
          ),
        /FOREIGN KEY/
      );
      actual.exec(
        `INSERT INTO dataset_snapshots (snapshot_id,dataset_name,version,splits_json,manifest_uri,manifest_json,created_at) VALUES ('snapshot-1','test','v1.0.0','{}','file:///tmp/manifest.json','{}','${NOW}')`
      );
      assert.throws(
        () =>
          actual.exec(
            `INSERT INTO dataset_release_gates (gate_id,snapshot_id,release_state,created_at) VALUES ('gate-1','snapshot-1','released','${NOW}')`
          ),
        /CHECK/
      );
      actual.exec(
        `INSERT INTO document_provenance (document_id,canonicalization_version,language,created_at) VALUES ('doc-1','explicit-nfkc-v1','tr','${NOW}')`
      );
      actual.exec(
        `INSERT INTO document_occurrences (document_id,source_id,source_record_id,source_uri,acquired_at,raw_artifact_id) VALUES ('doc-1','source','record','https://example.org','${NOW}','raw')`
      );
      actual.exec("DELETE FROM document_provenance WHERE document_id='doc-1'");
      assert.equal(actual.prepare("SELECT count(*) AS n FROM document_occurrences").get()?.n, 0);
      actual.exec("DELETE FROM dataset_snapshots WHERE snapshot_id='snapshot-1'");
      assert.equal(actual.prepare("SELECT count(*) AS n FROM dataset_release_gates").get()?.n, 0);
    } finally {
      actual.close();
      expected.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Local OTel log emitter", () => {
  it("persists correlatable events with service identity and no captured payload", () => {
    const db = new RegistryDatabase({ inMemory: true });
    try {
      const emitter = new LogEmitter({ db, serviceVersion: "1.1.0", deploymentEnv: "test" });
      const event = emitter.emit({
        eventName: "pipeline.finished",
        severity: "INFO",
        traceId: TRACE_ID,
        spanId: SPAN_ID,
        durationMs: 12,
        runId: "123e4567-e89b-42d3-a456-426614174000",
      });
      assert.equal(event.severity_number, 9);
      assert.equal(event.content_capture, false);
      assert.equal(event.body, "pipeline.finished");
      assert.equal(event.service_version, "1.1.0");
      assert.deepEqual(
        db.listOtelLogEvents(TRACE_ID).map(({ event_id, ...stored }) => {
          assert.ok(event_id > 0);
          return stored;
        }),
        [event]
      );
      emitter.emit({ eventName: "pipeline.failed", severity: "ERROR" });
      assert.equal(db.listOtelLogEvents(TRACE_ID).length, 1);
      assert.equal(db.listOtelLogEvents(undefined, 1)[0].severity_number, 17);
    } finally {
      db.close();
    }
  });

  it("rejects malformed IDs, negative durations and inconsistent severity before writing", () => {
    const db = new RegistryDatabase({ inMemory: true });
    try {
      const emitter = new LogEmitter({ db });
      assert.throws(() => emitter.emit({ eventName: "invalid payload text", severity: "INFO" }));
      assert.throws(() =>
        emitter.emit({ eventName: "pipeline.failed", severity: "ERROR", traceId: "0".repeat(32) })
      );
      assert.throws(() =>
        emitter.emit({ eventName: "pipeline.failed", severity: "ERROR", durationMs: -1 })
      );
      assert.equal(db.listOtelLogEvents().length, 0);
      const event = emitter.emit({ eventName: "pipeline.finished", severity: "INFO" });
      assert.throws(() => db.recordOtelLogEvent({ ...event, severity_number: 17 }));
      assert.throws(() => db.recordOtelLogEvent({ ...event, body: "password=secret" }));
      assert.throws(() =>
        db.recordOtelLogEvent({ ...event, service_name: "private payload text" })
      );
      assert.throws(() =>
        db.recordOtelLogEvent({ ...event, blueprint_agent_id: "password=secret" })
      );
      assert.throws(() => db.listOtelLogEvents(undefined, -1));
      assert.equal(db.listOtelLogEvents().length, 1);
    } finally {
      db.close();
    }
  });

  it("maps CRITICAL anomalies to ERROR and excludes URL, message and metadata from storage", () => {
    const dir = mkdtempSync(join(tmpdir(), "blueprint-anomaly-"));
    const path = join(dir, "events.jsonl");
    const db = new RegistryDatabase({ inMemory: true });
    try {
      const event = recordAnomaly(
        {
          anomalyCode: "SSRF_INTERCEPTION",
          severity: "CRITICAL",
          component: "CrawlerActor",
          targetUrl: "https://example.org/private?token=secret-token",
          message: "sensitive-document-content",
          metadata: { password: "private-password" },
          traceId: TRACE_ID,
          spanId: SPAN_ID,
        },
        path,
        new LogEmitter({ db })
      );
      assert.equal(event.severity, "CRITICAL");
      const stored = db.listOtelLogEvents(TRACE_ID)[0];
      assert.equal(stored.severity_text, "ERROR");
      assert.equal(stored.severity_number, 17);
      const mirror = JSON.parse(readFileSync(path, "utf8"));
      assert.equal(mirror.content_capture, false);
      assert.equal(mirror.anomalyCode, "SSRF_INTERCEPTION");
      assert.equal(mirror.component, "CrawlerActor");
      assert.equal(mirror.message, "anomaly.SSRF_INTERCEPTION");
      for (const forbidden of ["secret-token", "sensitive-document-content", "private-password"]) {
        assert.ok(!JSON.stringify(stored).includes(forbidden));
        assert.ok(!JSON.stringify(mirror).includes(forbidden));
      }
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not report success when the SQLite writer is closed", () => {
    const db = new RegistryDatabase({ inMemory: true });
    db.close();
    assert.throws(
      () => new LogEmitter({ db }).emit({ eventName: "pipeline.finished", severity: "INFO" }),
      /closed|not open|finalized/i
    );
  });
});
