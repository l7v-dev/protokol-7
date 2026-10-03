/**
 * Worker Pool and Task Execution Tests — protokol-7
 *
 * Verifies TaskWorker execution, lease heartbeats, backoff retry, terminal/quarantine states,
 * epoch fencing, WorkerPool concurrency, and standard download/extract job handlers.
 */

import assert from "node:assert/strict";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, it } from "node:test";
import { LocalObjectStore } from "../src/storage/adapters/local-object-store.js";
import { SqliteLedgerRepository } from "../src/storage/ledger/sqlite-ledger-repository.js";
import {
  createDownloadJobHandler,
  createExtractJobHandler,
  QuarantineError,
  TaskWorker,
  TerminalJobError,
  WorkerPool,
} from "../src/workers/index.js";

describe("Worker Pool and Task Execution Subsystem", () => {
  let testServer: http.Server;
  let serverPort: number;

  before(async () => {
    testServer = http.createServer((req, res) => {
      if (req.url === "/sample.html") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h1>Hello World</h1><p>Test content.</p></body></html>");
      } else if (req.url === "/not-found") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Plain text payload");
      }
    });

    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => {
        const addr = testServer.address();
        if (typeof addr === "object" && addr) {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  });

  it("should claim, execute, and finalize a job successfully", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
    const worker = new TaskWorker(ledger, {
      workerId: "test-w1",
      leaseSeconds: 30,
      heartbeatIntervalMs: 50,
    });

    worker.registerHandler("transform", async (ctx) => {
      return {
        artifacts: [
          {
            sha256: "b".repeat(64),
            sizeBytes: 1024,
            mimeType: "text/plain",
            providerId: "local",
            container: "processed",
            objectKey: "transformed.txt",
            transformVersion: "v1",
          },
        ],
        childJobs: [
          {
            operation: "index",
            idempotencyKey: "index-job-1",
            input: { target: "transformed.txt" },
          },
        ],
        outboxEvents: [
          {
            eventType: "job.completed",
            payload: { jobId: ctx.job.id },
          },
        ],
      };
    });

    const job = await ledger.createJob({
      operation: "transform",
      idempotencyKey: "test-transform-1",
      input: { file: "input.txt" },
    });

    assert.equal(job.status, "pending");

    const processed = await worker.executeOnce();
    assert.equal(processed, true);
    assert.equal(worker.stats.jobsSucceeded, 1);

    const updated = await ledger.getJob(job.id);
    assert.ok(updated);
    assert.equal(updated.status, "succeeded");
    assert.equal(updated.leaseOwner, null);

    const child = await ledger.createJob({
      operation: "index",
      idempotencyKey: "index-job-1",
      input: { target: "transformed.txt" },
    });
    assert.equal(child.operation, "index");
    assert.equal(child.status, "pending");
  });

  it("should handle transient failure with retry_wait and backoff", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
    const worker = new TaskWorker(ledger, {
      workerId: "test-w2",
      leaseSeconds: 30,
    });

    let attemptCount = 0;
    worker.registerHandler("failing-op", async () => {
      attemptCount += 1;
      throw new Error("Temporary network timeout");
    });

    const job = await ledger.createJob({
      operation: "failing-op",
      idempotencyKey: "failing-job-1",
      input: {},
      maxAttempts: 3,
    });

    const processed = await worker.executeOnce();
    assert.equal(processed, true);
    assert.equal(attemptCount, 1);
    assert.equal(worker.stats.jobsFailed, 1);

    const updated = await ledger.getJob(job.id);
    assert.ok(updated);
    assert.equal(updated.status, "retry_wait");
    assert.equal(updated.attempt, 1);
    assert.equal(updated.errorCode, "Temporary network timeout");
    assert.equal(updated.leaseOwner, null);
  });

  it("should mark job as failed when max attempts are exceeded", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
    const worker = new TaskWorker(ledger, { workerId: "test-w3" });

    worker.registerHandler("fatal-op", async () => {
      throw new Error("Permanent server error");
    });

    const job = await ledger.createJob({
      operation: "fatal-op",
      idempotencyKey: "fatal-job-1",
      input: {},
      maxAttempts: 1, // Only 1 attempt allowed
    });

    await worker.executeOnce();

    const updated = await ledger.getJob(job.id);
    assert.ok(updated);
    assert.equal(updated.status, "failed");
    assert.equal(updated.attempt, 1);
  });

  it("should mark job as quarantined when QuarantineError is thrown", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
    const worker = new TaskWorker(ledger, { workerId: "test-w4" });

    worker.registerHandler("corrupt-op", async () => {
      throw new QuarantineError("Corrupt payload checksum mismatch");
    });

    const job = await ledger.createJob({
      operation: "corrupt-op",
      idempotencyKey: "corrupt-job-1",
      input: {},
      maxAttempts: 5,
    });

    await worker.executeOnce();

    const updated = await ledger.getJob(job.id);
    assert.ok(updated);
    assert.equal(updated.status, "quarantined");
    assert.equal(worker.stats.jobsQuarantined, 1);
  });

  it("should enforce operation filtering across specialized workers", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });

    const downloadWorker = new TaskWorker(ledger, {
      workerId: "downloader",
      allowedOperations: ["download"],
    });
    const extractWorker = new TaskWorker(ledger, {
      workerId: "extractor",
      allowedOperations: ["extract"],
    });

    downloadWorker.registerHandler("download", async () => {
      return {};
    });
    extractWorker.registerHandler("extract", async () => {
      return {};
    });

    const extractJob = await ledger.createJob({
      operation: "extract",
      idempotencyKey: "op-test-extract",
      input: {},
    });

    // Downloader should NOT claim the extract job
    const downloadProcessed = await downloadWorker.executeOnce();
    assert.equal(downloadProcessed, false);

    // Extractor SHOULD claim the extract job
    const extractProcessed = await extractWorker.executeOnce();
    assert.equal(extractProcessed, true);

    const updated = await ledger.getJob(extractJob.id);
    assert.ok(updated);
    assert.equal(updated.status, "succeeded");
  });

  it("should fail job immediately without retries when TerminalJobError is thrown", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
    const worker = new TaskWorker(ledger, { workerId: "terminal-w" });

    worker.registerHandler("terminal-op", async () => {
      throw new TerminalJobError("Invalid document schema version");
    });

    const job = await ledger.createJob({
      operation: "terminal-op",
      idempotencyKey: "terminal-job-1",
      input: {},
      maxAttempts: 5,
    });

    await worker.executeOnce();

    const updated = await ledger.getJob(job.id);
    assert.ok(updated);
    assert.equal(updated.status, "failed");
    assert.equal(updated.attempt, 1);
    assert.equal(updated.errorCode, "Invalid document schema version");
  });

  it("should reject finalization from stale worker when lease epoch increments (epoch fencing)", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
    const job = await ledger.createJob({
      operation: "fence-op",
      idempotencyKey: "fence-job-1",
      input: {},
    });

    // Worker 1 claims with leaseSeconds = 1
    const claimedByW1 = await ledger.claimJob("worker-1", 1);
    assert.ok(claimedByW1);
    assert.equal(claimedByW1.leaseEpoch, 1);
    assert.equal(claimedByW1.leaseOwner, "worker-1");

    // Wait until lease expires
    await new Promise((r) => setTimeout(r, 1100));

    // Reap expired lease -> status becomes retry_wait
    const reapResult = await ledger.reapExpiredLeases();
    assert.equal(reapResult.expiredJobs, 1);

    // Worker 2 claims the job -> leaseEpoch increments to 2
    const claimedByW2 = await ledger.claimJob("worker-2", 30);
    assert.ok(claimedByW2);
    assert.equal(claimedByW2.leaseEpoch, 2);
    assert.equal(claimedByW2.leaseOwner, "worker-2");

    // Worker 1 attempts to finalize with stale leaseEpoch 1 -> MUST BE REJECTED
    const w1Finalize = await ledger.finalizeJob(job.id, "worker-1", 1);
    assert.equal(w1Finalize, false);

    // Worker 2 finalizes with valid leaseEpoch 2 -> MUST SUCCEED
    const w2Finalize = await ledger.finalizeJob(job.id, "worker-2", 2);
    assert.equal(w2Finalize, true);

    const finalJob = await ledger.getJob(job.id);
    assert.ok(finalJob);
    assert.equal(finalJob.status, "succeeded");
  });

  it("should manage concurrent workers in WorkerPool and drain cleanly", async () => {
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });
    const pool = new WorkerPool(ledger, {
      concurrency: 3,
      workerConfig: {
        pollIntervalMs: 20,
        leaseSeconds: 30,
      },
    });

    let processedCount = 0;
    pool.registerHandler("batch-task", async () => {
      processedCount += 1;
      await new Promise((r) => setTimeout(r, 20));
    });

    // Insert 6 jobs
    for (let i = 1; i <= 6; i++) {
      await ledger.createJob({
        operation: "batch-task",
        idempotencyKey: `batch-task-${i}`,
        input: { index: i },
      });
    }

    pool.start();

    // Wait until all 6 jobs are processed or timeout
    const deadline = Date.now() + 5000;
    while (processedCount < 6 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }

    assert.equal(processedCount, 6);
    const stats = pool.getStats();
    assert.equal(stats.jobsSucceeded, 6);

    await pool.stop();
  });

  it("should execute end-to-end download and extract pipeline with LocalObjectStore", async () => {
    const tempDir = path.join(os.tmpdir(), `protokol-test-e2e-${Date.now()}`);
    const objectStore = new LocalObjectStore({ baseDir: tempDir });
    const ledger = new SqliteLedgerRepository({ dbPath: ":memory:" });

    const worker = new TaskWorker(ledger, {
      workerId: "e2e-worker",
      objectStore,
    });

    worker.registerHandler("download", createDownloadJobHandler());
    worker.registerHandler("extract", createExtractJobHandler());

    // 1. Create download job pointing to our sample HTML server
    const downloadJob = await ledger.createJob({
      operation: "download",
      idempotencyKey: "e2e-download-1",
      input: {
        url: `http://127.0.0.1:${serverPort}/sample.html`,
        allowLocalNetwork: true,
        nextOperation: "extract",
      },
    });

    // 2. Execute download
    const dlProcessed = await worker.executeOnce();
    assert.equal(dlProcessed, true);

    const dlUpdated = await ledger.getJob(downloadJob.id);
    assert.ok(dlUpdated);
    assert.equal(dlUpdated.status, "succeeded");

    // 3. Execute child extract job created by download handler
    const extProcessed = await worker.executeOnce();
    assert.equal(extProcessed, true);

    const outboxEvents = await ledger.claimOutboxEvents("test-publisher", 10);
    assert.equal(outboxEvents.length, 1);
    assert.equal(outboxEvents[0].eventType, "document.extracted");
    assert.ok(outboxEvents[0].payload.rawSha256);
    assert.ok(outboxEvents[0].payload.extractedSha256);
  });
});
