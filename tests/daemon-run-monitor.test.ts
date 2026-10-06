import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, test } from "node:test";
import { getDaemonRunHealth, reapStaleDaemonRuns } from "../src/storage/daemon-run-monitor";
import { SqliteLedgerRepository } from "../src/storage/ledger/sqlite-ledger-repository";
import { WorkerPool } from "../src/workers/worker-pool";

let directory: string;
let catalog: string;
const now = new Date("2026-10-05T12:00:00Z");

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "daemon-runs-"));
  catalog = join(directory, "monitor.sqlite");
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

function seed() {
  execFileSync(".venv/bin/python", [
    "-c",
    "import sys; from pipelines.shared.daemon_run import DaemonRun\nwith DaemonRun(sys.argv[1], 'pilot'): pass",
    catalog,
  ]);
  const db = new DatabaseSync(catalog);
  db.exec(`UPDATE pipeline_runs SET status='INGESTING', completed_at=NULL,
    last_heartbeat_at='2026-10-05T11:56:59+00:00', heartbeat_interval_seconds=60`);
  db.close();
}

test("Python producer schema is consumed by health and reaper", () => {
  seed();
  const health = getDaemonRunHealth(catalog, now);
  assert.equal(health.monitoring, "ready");
  assert.equal(health.stale_runs.length, 1);
  assert.equal(health.stale_runs[0].pipeline_name, "pilot");
  assert.equal(reapStaleDaemonRuns(catalog, now), 1);
  assert.equal(reapStaleDaemonRuns(catalog, now), 0);
  assert.equal(getDaemonRunHealth(catalog, now).stale_runs[0].status, "FAILED");
  execFileSync(".venv/bin/python", [
    "-c",
    "import sys; from pipelines.shared.daemon_run import DaemonRun\nwith DaemonRun(sys.argv[1], 'pilot'): pass",
    catalog,
  ]);
  assert.equal(getDaemonRunHealth(catalog, now).stale_runs.length, 0);
});

test("NULL, exact boundary, fresh heartbeat and completed runs are preserved", () => {
  seed();
  const db = new DatabaseSync(catalog);
  try {
    for (const heartbeat of [null, "2026-10-05T11:57:00Z", "2026-10-05T12:00:00Z"]) {
      db.prepare("UPDATE pipeline_runs SET last_heartbeat_at=?").run(heartbeat);
      assert.equal(getDaemonRunHealth(catalog, now).stale_runs.length, 0);
      assert.equal(reapStaleDaemonRuns(catalog, now), 0);
    }
    db.exec(
      "UPDATE pipeline_runs SET status='COMPLETED', last_heartbeat_at='2026-10-05T11:00:00Z'"
    );
    assert.equal(reapStaleDaemonRuns(catalog, now), 0);
  } finally {
    db.close();
  }
});

test("unconfigured or missing monitoring catalogs never appear healthy as ready", () => {
  assert.equal(getDaemonRunHealth("").monitoring, "disabled");
  assert.equal(getDaemonRunHealth(catalog).monitoring, "unavailable");
  assert.throws(() => reapStaleDaemonRuns(catalog));
  assert.equal(existsSync(catalog), false);
});

test("ordinary source catalog is rejected and not mutated", () => {
  const db = new DatabaseSync(catalog);
  db.exec("CREATE TABLE shards (name TEXT)");
  assert.equal(getDaemonRunHealth(catalog).monitoring, "unavailable");
  assert.throws(() => reapStaleDaemonRuns(catalog));
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get()?.n,
    1
  );
  db.close();
});

test("WorkerPool timer invokes daemon reaper and stops with the pool", async () => {
  seed();
  const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
  let calls = 0;
  let observed: (() => void) | undefined;
  const tick = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const pool = new WorkerPool(ledger, {
    reapIntervalMs: 10,
    workerConfig: { pollIntervalMs: 10 },
    reapDaemonRuns: () => {
      calls++;
      const count = reapStaleDaemonRuns(catalog, now);
      observed?.();
      return count;
    },
  });
  pool.start();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      tick,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Reaper callback did not run")), 2000);
      }),
    ]);
    assert.ok(calls > 0);
    assert.equal(getDaemonRunHealth(catalog, now).stale_runs[0].status, "FAILED");
  } finally {
    clearTimeout(timer);
    await pool.stop();
    ledger.close();
  }
});

test("health route and versioned alias expose degraded daemon monitoring", async () => {
  seed();
  const previousPath = process.env.PROTOKOL_DAEMON_RUN_DB;
  const previousMode = process.env.NODE_ENV;
  const previousLedger = process.env.LEDGER_DB_PATH;
  process.env.NODE_ENV = "test";
  process.env.LEDGER_DB_PATH = ":memory:";
  process.env.PROTOKOL_DAEMON_RUN_DB = catalog;
  const { createServer } = await import("../src/api/server.js");
  const server = createServer();
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    for (const path of ["/health", "/api/v1/health"]) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}${path}`);
      assert.equal(response.status, 200);
      const body = (await response.json()) as {
        status: string;
        daemonMonitoring: string;
        stale_runs: unknown[];
      };
      assert.equal(body.status, "degraded");
      assert.equal(body.daemonMonitoring, "ready");
      assert.equal(body.stale_runs.length, 1);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousPath === undefined) delete process.env.PROTOKOL_DAEMON_RUN_DB;
    else process.env.PROTOKOL_DAEMON_RUN_DB = previousPath;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    if (previousLedger === undefined) delete process.env.LEDGER_DB_PATH;
    else process.env.LEDGER_DB_PATH = previousLedger;
  }
});
