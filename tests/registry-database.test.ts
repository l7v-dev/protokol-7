/**
 * Test suite for RegistryDatabase - actor runs, pipeline executions, scheduled jobs.
 * Uses in-memory SQLite to ensure zero disk side-effects.
 */

import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { RegistryDatabase } from "../src/core/registry-database";

describe("RegistryDatabase - Actor Runs", () => {
  let db: RegistryDatabase;

  before(() => {
    db = new RegistryDatabase({ inMemory: true });
  });

  it("creates a run and retrieves it with status pending", () => {
    db.createRun({
      runId: "run-1",
      actorName: "arxiv",
      input: { q: "machine learning" },
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    const run = db.getRun("run-1");
    assert.ok(run, "run should exist");
    assert.equal(run.runId, "run-1");
    assert.equal(run.actorName, "arxiv");
    assert.equal(run.status, "pending");
    assert.deepEqual(run.input, { q: "machine learning" });
    assert.equal(run.logs.length, 0);
  });

  it("startRun transitions status to running", () => {
    db.startRun("run-1");
    const run = db.getRun("run-1");
    assert.equal(run?.status, "running");
  });

  it("appendLog persists log entries correctly", () => {
    db.appendLog("run-1", {
      timestamp: "2026-01-01T00:00:01.000Z",
      level: "INFO",
      message: "Querying arXiv API",
    });
    db.appendLog("run-1", {
      timestamp: "2026-01-01T00:00:02.000Z",
      level: "PASS",
      message: "Retrieved 5 papers",
    });
    const run = db.getRun("run-1");
    assert.equal(run?.logs.length, 2);
    assert.equal(run?.logs[0].level, "INFO");
    assert.equal(run?.logs[1].level, "PASS");
  });

  it("completeRun sets status to succeeded with output and metrics", () => {
    db.completeRun("run-1", { papers: [{ title: "Attention Is All You Need" }] }, 1, "2026-01-01T00:00:05.000Z", 5000);
    const run = db.getRun("run-1");
    assert.equal(run?.status, "succeeded");
    assert.equal(run?.itemCount, 1);
    assert.equal(run?.durationMs, 5000);
    assert.ok(run?.output);
  });

  it("listRuns returns all runs ordered by started_at DESC", () => {
    db.createRun({
      runId: "run-2",
      actorName: "wikimedia",
      input: { title: "Python" },
      startedAt: "2026-01-02T00:00:00.000Z",
    });
    db.completeRun("run-2", { text: "..." }, 1, "2026-01-02T00:00:01.000Z", 100);

    const runs = db.listRuns(10);
    assert.ok(runs.length >= 2, "should have at least 2 runs");
    assert.equal(runs[0].runId, "run-2", "most recent run should be first");
  });

  it("failRun sets status to failed with error message", () => {
    db.createRun({
      runId: "run-3",
      actorName: "sec-edgar",
      input: { ticker: "AAPL" },
      startedAt: "2026-01-03T00:00:00.000Z",
    });
    db.startRun("run-3");
    db.failRun("run-3", "HTTP 503 upstream error", "2026-01-03T00:00:02.000Z", 2000);

    const run = db.getRun("run-3");
    assert.equal(run?.status, "failed");
    assert.equal(run?.errorMessage, "HTTP 503 upstream error");
    assert.equal(run?.durationMs, 2000);
  });

  it("returns undefined for a non-existent run_id", () => {
    const run = db.getRun("run-does-not-exist");
    assert.equal(run, undefined);
  });
});

describe("RegistryDatabase - Pipeline Executions", () => {
  let db: RegistryDatabase;

  before(() => {
    db = new RegistryDatabase({ inMemory: true });
  });

  it("records a successful pipeline execution and lists it", () => {
    db.recordPipelineExecution({
      runId: "pipe-1",
      pipelineName: "trwiki-parquet",
      actorId: "wikimedia",
      status: "succeeded",
      itemCount: 482800,
      durationMs: 840000,
      startedAt: "2026-09-25T11:00:00.000Z",
      completedAt: "2026-09-25T11:14:00.000Z",
    });

    const execs = db.listPipelineExecutions();
    assert.equal(execs.length, 1);
    assert.equal(execs[0].runId, "pipe-1");
    assert.equal(execs[0].status, "succeeded");
    assert.equal(execs[0].itemCount, 482800);
  });

  it("records a failed pipeline execution with error field", () => {
    db.recordPipelineExecution({
      runId: "pipe-2",
      pipelineName: "enwiki-parquet",
      actorId: "wikimedia",
      status: "failed",
      itemCount: 0,
      durationMs: 100,
      error: "Drive quota exceeded",
      startedAt: "2026-09-26T00:00:00.000Z",
      completedAt: "2026-09-26T00:00:01.000Z",
    });

    const execs = db.listPipelineExecutions();
    assert.ok(execs.length >= 1);
    const failed = execs.find((e) => e.runId === "pipe-2");
    assert.ok(failed);
    assert.equal(failed?.status, "failed");
    assert.equal(failed?.error, "Drive quota exceeded");
  });

  it("listPipelineExecutions respects limit parameter", () => {
    for (let i = 3; i <= 10; i++) {
      db.recordPipelineExecution({
        runId: `pipe-${i}`,
        pipelineName: "batch-etl",
        actorId: "arxiv",
        status: "succeeded",
        itemCount: i * 100,
        durationMs: i * 1000,
        startedAt: `2026-09-${20 + i}T00:00:00.000Z`,
        completedAt: `2026-09-${20 + i}T00:01:00.000Z`,
      });
    }
    const limited = db.listPipelineExecutions(3);
    assert.equal(limited.length, 3);
  });
});

describe("RegistryDatabase - Scheduled Jobs", () => {
  let db: RegistryDatabase;

  before(() => {
    db = new RegistryDatabase({ inMemory: true });
  });

  it("upserts a scheduled job and lists it", () => {
    db.upsertScheduledJob({
      id: "daily-etl",
      cronExpression: "0 2 * * *",
      running: true,
      runCount: 0,
    });

    const jobs = db.listScheduledJobs();
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].id, "daily-etl");
    assert.equal(jobs[0].cronExpression, "0 2 * * *");
    assert.equal(jobs[0].running, true);
    assert.equal(jobs[0].runCount, 0);
  });

  it("updateScheduledJobRun increments run count and sets lastRunAt", () => {
    db.updateScheduledJobRun("daily-etl", "2026-09-27T02:00:00.000Z", 1);
    const jobs = db.listScheduledJobs();
    const job = jobs.find((j) => j.id === "daily-etl");
    assert.equal(job?.runCount, 1);
    assert.equal(job?.lastRunAt, "2026-09-27T02:00:00.000Z");
  });

  it("setScheduledJobRunning persists running=false on stop", () => {
    db.setScheduledJobRunning("daily-etl", false);
    const jobs = db.listScheduledJobs();
    const job = jobs.find((j) => j.id === "daily-etl");
    assert.equal(job?.running, false);
  });

  it("upsert on existing job updates fields idempotently", () => {
    db.upsertScheduledJob({
      id: "daily-etl",
      cronExpression: "0 3 * * *",
      running: true,
      runCount: 5,
    });
    const jobs = db.listScheduledJobs();
    const job = jobs.find((j) => j.id === "daily-etl");
    assert.equal(job?.cronExpression, "0 3 * * *");
    assert.equal(job?.running, true);
    assert.equal(job?.runCount, 5);
    assert.equal(jobs.length, 1, "upsert should not create duplicate");
  });
});

describe("RegistryDatabase - RunRegistry integration", () => {
  it("RunRegistry persists and retrieves runs through RegistryDatabase", async () => {
    const { RunRegistry } = await import("../src/core/run-registry");
    const db = new RegistryDatabase({ inMemory: true });
    const registry = new RunRegistry({ db });

    const run = registry.createRun("wikimedia", { title: "Istanbul" });
    registry.startRun(run.runId);
    registry.appendLog(run.runId, "INFO", "Fetching Wikipedia page");
    registry.completeRun(run.runId, { text: "Istanbul is a city..." }, 1);

    // Flush in-memory cache to simulate service restart
    const freshDb = db; // same in-memory instance — test reads from DB
    const runs = freshDb.listRuns(10);
    assert.ok(runs.length >= 1, "DB should have at least one run");
    const persisted = runs.find((r) => r.runId === run.runId);
    assert.ok(persisted, "run should be in DB");
    assert.equal(persisted?.status, "succeeded");
  });

  it("persists and reads rich metadata (version, domain, status code, byte size)", async () => {
    const { RunRegistry } = await import("../src/core/run-registry");
    const db = new RegistryDatabase({ inMemory: true });
    const registry = new RunRegistry({ db });

    const run = registry.createRun(
      "cheerio-scraper",
      { targetUrl: "https://example.com/articles/1" },
      {
        actorVersion: "1.2.0",
        actorCategory: "SCRAPING",
        executionTarget: "local",
        sourceUrl: "https://example.com/articles/1",
        sourceDomain: "example.com",
        contentLanguage: "en",
        pipelineRunId: "pipe-batch-42",
      }
    );

    registry.startRun(run.runId);
    const mockOutput = { title: "Test Article", content: "Body text" };
    const byteSize = Buffer.byteLength(JSON.stringify(mockOutput));
    registry.completeRun(run.runId, mockOutput, 1, {
      httpStatusCode: 200,
      retryCount: 0,
      byteSizeOutput: byteSize,
    });

    const retrieved = db.getRun(run.runId);
    assert.ok(retrieved?.metadata, "metadata should be populated");
    assert.equal(retrieved.metadata.actorVersion, "1.2.0");
    assert.equal(retrieved.metadata.actorCategory, "SCRAPING");
    assert.equal(retrieved.metadata.executionTarget, "local");
    assert.equal(retrieved.metadata.sourceUrl, "https://example.com/articles/1");
    assert.equal(retrieved.metadata.sourceDomain, "example.com");
    assert.equal(retrieved.metadata.contentLanguage, "en");
    assert.equal(retrieved.metadata.pipelineRunId, "pipe-batch-42");
    assert.equal(retrieved.metadata.httpStatusCode, 200);
    assert.equal(retrieved.metadata.retryCount, 0);
    assert.equal(retrieved.metadata.byteSizeOutput, byteSize);
  });

  it("persists failure metadata with status code and retry count", async () => {
    const { RunRegistry } = await import("../src/core/run-registry");
    const db = new RegistryDatabase({ inMemory: true });
    const registry = new RunRegistry({ db });

    const run = registry.createRun(
      "arxiv",
      { id: "2401.99999" },
      {
        actorVersion: "1.1.0",
        actorCategory: "DOCUMENT",
        sourceUrl: "https://arxiv.org/abs/2401.99999",
        sourceDomain: "arxiv.org",
      }
    );

    registry.startRun(run.runId);
    registry.failRun(run.runId, "Paper not found", {
      httpStatusCode: 404,
      retryCount: 2,
    });

    const retrieved = db.getRun(run.runId);
    assert.ok(retrieved?.metadata);
    assert.equal(retrieved.status, "failed");
    assert.equal(retrieved.metadata.httpStatusCode, 404);
    assert.equal(retrieved.metadata.retryCount, 2);
    assert.equal(retrieved.metadata.sourceDomain, "arxiv.org");
  });
});
