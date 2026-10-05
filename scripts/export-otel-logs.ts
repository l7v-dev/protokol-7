import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MetadataLogEventSchema } from "../src/telemetry/log-event";
import { exportOtlpLogs, OtlpRejectedBatchError } from "../src/telemetry/otlp-exporter";

function syncDirectory(path: string) {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function persistJson(path: string, data: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(data));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  syncDirectory(dirname(path));
}

export async function exportMetadataLogs(args: string[] = process.argv.slice(2)) {
  const [
    catalog = "data/catalog.sqlite",
    checkpoint = "data/monitoring/otel-cursor.json",
    mode = "once",
  ] = args;
  if (mode !== "once" && mode !== "watch") throw new Error("Unknown export mode.");
  const source = resolve(catalog);
  const cursorPath = resolve(checkpoint);
  const missing: string[] = [];
  for (let parent = dirname(cursorPath); !existsSync(parent); parent = dirname(parent))
    missing.push(parent);
  for (const directory of missing.reverse()) {
    mkdirSync(directory, { mode: 0o700 });
    syncDirectory(dirname(directory));
  }
  if (existsSync(`${cursorPath}.blocked`))
    throw new Error("Blocked OTLP batch requires manual resolution.");
  // An exclusive lock prevents two exporters from acknowledging the same checkpoint concurrently.
  const lock = openSync(`${cursorPath}.lock`, "wx", 0o600);
  let db: DatabaseSync | undefined;
  let stop = false;
  const requestStop = () => {
    stop = true;
  };
  try {
    writeFileSync(lock, JSON.stringify({ pid: process.pid, source }));
    fsyncSync(lock);
    if (existsSync(`${cursorPath}.blocked`))
      throw new Error("Blocked OTLP batch requires manual resolution.");
    let cursor = 0;
    if (existsSync(cursorPath)) {
      const saved = JSON.parse(readFileSync(cursorPath, "utf8"));
      if (
        saved.source !== source ||
        !Number.isSafeInteger(saved.lastEventId) ||
        saved.lastEventId < 0
      )
        throw new Error("Invalid exporter checkpoint.");
      cursor = saved.lastEventId;
    }
    db = new DatabaseSync(source, { readOnly: true });
    process.once("SIGINT", requestStop);
    process.once("SIGTERM", requestStop);
    do {
      const rows = db
        .prepare("SELECT * FROM otel_log_events WHERE event_id > ? ORDER BY event_id LIMIT 100")
        .all(cursor);
      const events = rows.map(({ event_id: _id, ...row }) =>
        MetadataLogEventSchema.parse({
          schema_version: "log-event.v1",
          ...Object.fromEntries(
            Object.entries(row)
              .filter(([, value]) => value !== null)
              .map(([key, value]) => [key, key === "content_capture" ? value !== 0 : value])
          ),
        })
      );
      try {
        await exportOtlpLogs(events);
      } catch (error) {
        if (error instanceof OtlpRejectedBatchError)
          persistJson(`${cursorPath}.blocked`, {
            source,
            firstEventId: rows[0]?.event_id,
            lastEventId: rows.at(-1)?.event_id,
            reason: "non_retryable_or_partial_ack",
          });
        throw error;
      }
      if (rows.length) {
        cursor = Number(rows[rows.length - 1].event_id);
        persistJson(cursorPath, { source, lastEventId: cursor });
      }
      if (mode === "watch" && !stop)
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
    } while (mode === "watch" && !stop);
    console.log("[PASS] Metadata log export completed.");
  } finally {
    process.removeListener("SIGINT", requestStop);
    process.removeListener("SIGTERM", requestStop);
    db?.close();
    closeSync(lock);
    unlinkSync(`${cursorPath}.lock`);
  }
}

if (process.argv[1]?.endsWith("export-otel-logs.ts"))
  exportMetadataLogs().catch(() => {
    console.error(
      "[ERROR] Metadata log export stopped; checkpoint retained. Check collector, catalog and lock."
    );
    process.exitCode = 1;
  });
