import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OutboxDispatcher, SqliteLedgerRepository } from "../src/storage/ledger/index.js";

describe("LedgerRepository & Control Plane Conformance Suite", () => {
  it("creates sources and manages partition cursors with revision fencing", async () => {
    const repo = new SqliteLedgerRepository();

    const source = await repo.createSource({
      name: "doaj-source",
      descriptor: { mode: "oai_pmh", base_url: "https://doaj.org/oai" },
      enabled: true,
    });
    assert.ok(source.id);
    assert.equal(source.name, "doaj-source");

    const fetched = await repo.getSource(source.id);
    assert.ok(fetched);
    assert.equal(fetched.name, "doaj-source");

    // Partition creation and idempotency
    const partition1 = await repo.getOrCreatePartition(source.id, "all-records");
    assert.equal(partition1.revision, 0);

    const partition2 = await repo.getOrCreatePartition(source.id, "all-records");
    assert.equal(partition1.id, partition2.id);

    // Cursor update with expected revision
    const updated = await repo.updatePartitionCursor(
      partition1.id,
      { token: "resumption-token-123" },
      0
    );
    assert.equal(updated, true);

    // Stale revision rejection
    const staleUpdate = await repo.updatePartitionCursor(
      partition1.id,
      { token: "resumption-token-456" },
      0
    );
    assert.equal(staleUpdate, false, "Stale revision must be rejected");

    repo.close();
  });

  it("upserts documents and deduplicates content objects and artifacts", async () => {
    const repo = new SqliteLedgerRepository();

    const source = await repo.createSource({
      name: "arxiv-source",
      descriptor: { mode: "rest" },
    });

    // Document upsert
    const doc1 = await repo.upsertDocument({
      sourceId: source.id,
      externalId: "2401.00001",
      canonicalUrl: "https://arxiv.org/abs/2401.00001",
    });
    const doc2 = await repo.upsertDocument({
      sourceId: source.id,
      externalId: "2401.00001",
    });
    assert.equal(doc1.id, doc2.id);

    // Artifact recording with automatic content object deduplication
    const artifact = await repo.recordArtifact({
      documentId: doc1.id,
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      sizeBytes: 0,
      mimeType: "application/pdf",
      providerId: "r2-primary",
      container: "protokol7-lake",
      objectKey: "bronze/arxiv/2401.00001.pdf",
      transformVersion: "v1.0",
      role: "raw_pdf",
    });
    assert.ok(artifact.id);
    assert.equal(
      artifact.sha256,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );

    repo.close();
  });

  it("handles atomic job lifecycle, epoch fencing, heartbeat, and outbox emission", async () => {
    const repo = new SqliteLedgerRepository();

    // Create job
    const job = await repo.createJob({
      operation: "download",
      idempotencyKey: "download-arxiv-2401.00001",
      input: { url: "https://arxiv.org/pdf/2401.00001.pdf" },
      maxAttempts: 3,
    });
    assert.equal(job.status, "pending");
    assert.equal(job.attempt, 0);

    // Idempotent duplicate job creation
    const dupJob = await repo.createJob({
      operation: "download",
      idempotencyKey: "download-arxiv-2401.00001",
      input: { url: "https://arxiv.org/pdf/2401.00001.pdf" },
    });
    assert.equal(job.id, dupJob.id);

    // Claim job by worker-1
    const claimed = await repo.claimJob("worker-1", 120);
    assert.ok(claimed);
    assert.equal(claimed.id, job.id);
    assert.equal(claimed.status, "running");
    assert.equal(claimed.leaseOwner, "worker-1");
    assert.equal(claimed.leaseEpoch, 1);
    assert.equal(claimed.attempt, 1);

    // Heartbeat
    const heartbeated = await repo.heartbeatJob(claimed.id, "worker-1", 1, 120);
    assert.equal(heartbeated, true);

    // Stale epoch heartbeat rejection
    const staleHeartbeat = await repo.heartbeatJob(claimed.id, "worker-1", 0, 120);
    assert.equal(staleHeartbeat, false);

    // Finalize job with child job and outbox event
    const finalized = await repo.finalizeJob(claimed.id, "worker-1", 1, {
      childJobs: [
        {
          operation: "extract",
          idempotencyKey: "extract-arxiv-2401.00001",
          input: { text: true },
        },
      ],
      outboxEvents: [
        {
          eventType: "artifact.downloaded",
          payload: { jobId: claimed.id },
        },
      ],
    });
    assert.equal(finalized, true);

    // Verify outbox event was generated
    const outboxEvents = await repo.claimOutboxEvents("dispatcher-1", 10, 60);
    assert.equal(outboxEvents.length, 1);
    assert.equal(outboxEvents[0].eventType, "artifact.downloaded");

    // Mark outbox event as published
    const published = await repo.markOutboxPublished(
      outboxEvents[0].id,
      "dispatcher-1",
      outboxEvents[0].dispatchEpoch
    );
    assert.equal(published, true);

    // No more pending outbox events
    const emptyOutbox = await repo.claimOutboxEvents("dispatcher-1", 10, 60);
    assert.equal(emptyOutbox.length, 0);

    repo.close();
  });

  it("dispatches events via OutboxDispatcher subscriber pattern", async () => {
    const repo = new SqliteLedgerRepository();

    const job = await repo.createJob({
      operation: "extract",
      idempotencyKey: "extract-job-1",
      input: {},
    });
    assert.ok(job.id);
    const claimed = await repo.claimJob("worker-1", 60);
    assert.ok(claimed);

    await repo.finalizeJob(claimed.id, "worker-1", claimed.leaseEpoch, {
      outboxEvents: [
        {
          eventType: "document.extracted",
          payload: { documentId: "doc-123", words: 450 },
        },
      ],
    });

    const receivedEvents: string[] = [];
    const dispatcher = new OutboxDispatcher({ repository: repo });

    dispatcher.subscribe("document.extracted", async (event) => {
      receivedEvents.push(event.eventType);
      assert.equal(event.payload.words, 450);
    });

    const result = await dispatcher.dispatchOnce();
    assert.equal(result.claimed, 1);
    assert.equal(result.dispatched, 1);
    assert.equal(result.failed, 0);
    assert.equal(receivedEvents.length, 1);

    repo.close();
  });

  it("reaps expired leases and handles recovery", async () => {
    const repo = new SqliteLedgerRepository();

    const job = await repo.createJob({
      operation: "ocr",
      idempotencyKey: "ocr-job-timeout",
      input: {},
      maxAttempts: 1, // Will fail on single timeout
    });
    assert.ok(job.id);

    // Claim with 0 seconds lease so it expires immediately
    const claimed = await repo.claimJob("worker-dead", 0);
    assert.ok(claimed);

    // Delay 5ms to ensure lease is in the past
    await new Promise((resolve) => setTimeout(resolve, 10));

    const reaped = await repo.reapExpiredLeases();
    assert.equal(reaped.expiredJobs, 1);

    repo.close();
  });
});
