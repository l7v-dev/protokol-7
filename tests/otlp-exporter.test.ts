import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { exportMetadataLogs } from "../scripts/export-otel-logs";
import { RegistryDatabase } from "../src/api/registry-database";
import { LogEmitter } from "../src/telemetry/log-emitter";
import { exportOtlpLogs, otlpLogs } from "../src/telemetry/otlp-exporter";

test("OTLP export carries correlatable metadata with decimal nanoseconds and hex identifiers", async () => {
  const db = new RegistryDatabase({ inMemory: true });
  const event = new LogEmitter({ db }).emit({
    eventName: "pipeline.completed",
    severity: "INFO",
    durationMs: 10,
  });
  try {
    const payload = otlpLogs([event]);
    const record = payload.resourceLogs[0].scopeLogs[0].logRecords[0];
    assert.equal(record.traceId, event.trace_id);
    assert.equal(record.timeUnixNano, String(BigInt(Date.parse(event.timestamp)) * 1000000n));
    assert.deepEqual(record.body, { stringValue: "pipeline.completed" });
    assert.deepEqual(record.attributes, [
      { key: "blueprint.duration.ms", value: { intValue: "10" } },
    ]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url, options) => {
      assert.equal(options?.redirect, "error");
      assert.deepEqual(JSON.parse(String(options?.body)), payload);
      return new Response("{}", { status: 200 });
    };
    try {
      await exportOtlpLogs([event]);
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.throws(() => otlpLogs([{ ...event, body: "private document" }]), /metadata/);
    await assert.rejects(exportOtlpLogs([event], "http://example.com/v1/logs"), /local collector/);
  } finally {
    db.close();
  }
});

test("OTLP rejects failed and partial acknowledgements", async () => {
  const db = new RegistryDatabase({ inMemory: true });
  const event = new LogEmitter({ db }).emit({ eventName: "pipeline.failed", severity: "ERROR" });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    await assert.rejects(exportOtlpLogs([event]), /did not accept/);
    globalThis.fetch = async () =>
      new Response('{"partialSuccess":{"rejectedLogRecords":"1"}}', { status: 200 });
    await assert.rejects(exportOtlpLogs([event]), /rejected/);
    globalThis.fetch = async () => new Response(" ".repeat(65537), { status: 200 });
    await assert.rejects(exportOtlpLogs([event]), /64 KiB/);
  } finally {
    globalThis.fetch = originalFetch;
    db.close();
  }
});

test("exporter blocks partial replay durably and checkpoints accepted batches across restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "otel-checkpoint-"));
  const catalog = join(root, "catalog.sqlite");
  const cursor = join(root, "cursor.json");
  const db = new RegistryDatabase({ dbPath: catalog });
  new LogEmitter({ db }).emit({ eventName: "fixture.completed", severity: "INFO" });
  db.close();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response('{"partialSuccess":{"rejectedLogRecords":"1"}}', { status: 200 });
    };
    await assert.rejects(exportMetadataLogs([catalog, cursor]), /rejected/);
    assert.equal(existsSync(cursor), false);
    assert.equal(existsSync(`${cursor}.lock`), false);
    assert.equal(existsSync(`${cursor}.blocked`), true);
    await assert.rejects(exportMetadataLogs([catalog, cursor]), /manual resolution/);
    assert.equal(calls, 1);
    const accepted = join(root, "accepted.json");
    globalThis.fetch = async () => {
      calls++;
      return new Response("{}", { status: 200 });
    };
    await exportMetadataLogs([catalog, accepted]);
    const state = JSON.parse(readFileSync(accepted, "utf8"));
    assert.equal(state.lastEventId, 1);
    await exportMetadataLogs([catalog, accepted]);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    rmSync(root, { recursive: true, force: true });
  }
});
