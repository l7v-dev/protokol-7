/**
 * Independent Task Worker CLI Daemon — protokol-7
 *
 * Runs a standalone worker pool claiming tasks from SQLite control plane ledger,
 * executing downloads/extractions, and recording artifacts into LocalObjectStore.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane) and RFC 05 (Production Runbook).
 */

import * as path from "node:path";
import { LocalObjectStore } from "../src/storage/adapters/local-object-store.js";
import { SqliteLedgerRepository } from "../src/storage/ledger/sqlite-ledger-repository.js";
import { badge, banner, divider, panel } from "../src/utils/terminal-theme.js";
import {
  createDownloadJobHandler,
  createExtractJobHandler,
  WorkerPool,
} from "../src/workers/index.js";

interface CliOptions {
  concurrency: number;
  dbPath: string;
  storageDir: string;
  operations?: string[];
  pollIntervalMs: number;
}

function parseCliArgs(args: string[]): CliOptions {
  let concurrency = parseInt(process.env.WORKER_CONCURRENCY || "2", 10);
  let dbPath = process.env.LEDGER_DB_PATH || "data/catalogs/control_plane.sqlite";
  let storageDir = process.env.STORAGE_DIR || "data/vault";
  let operations: string[] | undefined = process.env.WORKER_OPERATIONS
    ? process.env.WORKER_OPERATIONS.split(",").map((s) => s.trim())
    : undefined;
  let pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || "1000", 10);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[++i], 10);
    } else if (arg === "--db-path" && args[i + 1]) {
      dbPath = args[++i];
    } else if (arg === "--storage-dir" && args[i + 1]) {
      storageDir = args[++i];
    } else if (arg === "--operations" && args[i + 1]) {
      operations = args[++i].split(",").map((s) => s.trim());
    } else if (arg === "--poll-interval" && args[i + 1]) {
      pollIntervalMs = parseInt(args[++i], 10);
    }
  }

  return {
    concurrency: Number.isNaN(concurrency) ? 2 : Math.max(1, concurrency),
    dbPath,
    storageDir,
    operations,
    pollIntervalMs: Number.isNaN(pollIntervalMs) ? 1000 : Math.max(100, pollIntervalMs),
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  console.log(banner("PROTOKOL-7 TASK WORKER DAEMON", "RFC 03 & RFC 05 CONTROL PLANE"));
  console.log(
    panel("RUNTIME CONFIGURATION", [
      ["Concurrency", String(options.concurrency)],
      ["Database", path.resolve(options.dbPath)],
      ["Storage Directory", path.resolve(options.storageDir)],
      ["Operations", options.operations ? options.operations.join(", ") : "all"],
      ["Poll Interval", `${options.pollIntervalMs} ms`],
    ])
  );
  console.log(divider());

  const ledger = new SqliteLedgerRepository({ dbPath: options.dbPath });
  const objectStore = new LocalObjectStore({ baseDir: options.storageDir });

  const pool = new WorkerPool(ledger, {
    concurrency: options.concurrency,
    objectStore,
    workerConfig: {
      allowedOperations: options.operations,
      pollIntervalMs: options.pollIntervalMs,
    },
  });

  // Register canonical task handlers
  pool.registerHandler("download", createDownloadJobHandler());
  pool.registerHandler("extract", createExtractJobHandler());

  console.log(
    badge("OK", `Worker pool initialized with ${options.concurrency} concurrent workers.`)
  );
  console.log(badge("INFO", "Listening for control plane tasks. Press Ctrl+C to terminate."));

  pool.start();

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log();
    console.log(badge("WARN", `Received ${signal}. Draining active tasks and shutting down...`));

    try {
      await pool.drain();
      ledger.close();
      const stats = pool.getStats();
      console.log(
        panel("FINAL TELEMETRY", [
          ["Jobs Claimed", String(stats.jobsClaimed)],
          ["Jobs Succeeded", String(stats.jobsSucceeded)],
          ["Jobs Failed", String(stats.jobsFailed)],
          ["Jobs Quarantined", String(stats.jobsQuarantined)],
        ])
      );
      console.log(badge("OK", "Task worker daemon terminated cleanly."));
      process.exit(0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(badge("ERROR", `Error during shutdown: ${msg}`));
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(badge("FAIL", `Fatal worker startup error: ${msg}`));
  process.exit(1);
});
