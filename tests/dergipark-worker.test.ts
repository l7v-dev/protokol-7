import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { SqliteLedgerRepository } from "../src/storage/ledger/sqlite-ledger-repository.js";
import {
  createDergiParkHarvestJobHandler,
  TaskWorker,
  TerminalJobError,
} from "../src/workers/index.js";

describe("DergiPark Harvest Worker Handler Suite", () => {
  let tempDir: string;
  let dbPath: string;
  let ledger: SqliteLedgerRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dp_worker_test_"));
    dbPath = path.join(tempDir, "control_plane.sqlite");
    ledger = new SqliteLedgerRepository({ dbPath });
  });

  afterEach(() => {
    ledger.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("registers dergipark_harvest handler and executes dry-run task", async () => {
    const handler = createDergiParkHarvestJobHandler();

    const job = await ledger.createJob({
      operation: "dergipark_harvest",
      idempotencyKey: "test_job_1",
      input: {
        fromDate: "2024-01-01",
        untilDate: "2024-01-02",
        maxRecords: 2,
        dryRun: true,
        noDrive: true,
      },
    });

    const abortController = new AbortController();
    const result = await handler({
      job,
      workerId: "test-worker-1",
      signal: abortController.signal,
      ledger,
    });

    assert.ok(result);
    assert.ok(Array.isArray(result.outboxEvents));
    assert.equal(result.outboxEvents.length, 1);
    assert.equal(result.outboxEvents[0].eventType, "dergipark.harvest.completed");
    assert.equal(result.outboxEvents[0].payload.jobId, job.id);
  });

  it("handles abort signal properly during job execution", async () => {
    const handler = createDergiParkHarvestJobHandler();

    const job = await ledger.createJob({
      operation: "dergipark_harvest",
      idempotencyKey: "test_job_abort",
      input: {
        fromDate: "2024-01-01",
        untilDate: "2024-01-02",
        maxRecords: 100,
        dryRun: true,
      },
    });

    const abortController = new AbortController();
    abortController.abort(); // Pre-aborted signal

    await assert.rejects(
      async () => {
        await handler({
          job,
          workerId: "test-worker-abort",
          signal: abortController.signal,
          ledger,
        });
      },
      (err: unknown) => {
        assert.ok(
          err instanceof TerminalJobError || (err instanceof Error && err.message.includes("abort"))
        );
        return true;
      }
    );
  });

  it("runs full worker task lifecycle with lease and finalization", async () => {
    const worker = new TaskWorker(ledger, {
      workerId: "test-worker-full",
      leaseSeconds: 30,
      allowedOperations: ["dergipark_harvest"],
    });

    worker.registerHandler("dergipark_harvest", createDergiParkHarvestJobHandler());

    const job = await ledger.createJob({
      operation: "dergipark_harvest",
      idempotencyKey: "test_lifecycle_job",
      input: {
        fromDate: "2024-01-01",
        untilDate: "2024-01-02",
        maxRecords: 2,
        dryRun: true,
        noDrive: true,
      },
    });

    // Execute single worker iteration
    const processed = await worker.executeOnce();
    assert.equal(processed, true);

    assert.equal(worker.stats.jobsClaimed, 1);
    assert.equal(worker.stats.jobsSucceeded, 1);
    assert.equal(worker.stats.jobsFailed, 0);

    const updated = await ledger.getJob(job.id);
    assert.ok(updated);
    assert.equal(updated.status, "succeeded");
    assert.equal(updated.leaseOwner, null);
  });
});
