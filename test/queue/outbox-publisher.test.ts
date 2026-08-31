import { describe, expect, it, vi } from 'vitest';

import type { OutboxRecord, OutboxRepository } from '../../src/database/repositories/outbox-repository.js';
import { OutboxPublisher } from '../../src/queue/outbox-publisher.js';
import type { QueueRuntime } from '../../src/queue/runtime.js';

function pendingRecord(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    id: 'outbox_1',
    tenantId: 'tenant_1',
    aggregateType: 'job',
    aggregateId: 'job_1',
    messageType: 'job.create',
    schemaVersion: 1,
    payload: { jobId: 'job_1' },
    correlationId: 'corr_1',
    causationId: null,
    status: 'PENDING',
    attempts: 0,
    availableAt: new Date('2026-08-26T00:00:00.000Z'),
    claimedAt: null,
    publishedAt: null,
    lastErrorCode: null,
    createdAt: new Date('2026-08-26T00:00:00.000Z'),
    ...overrides
  };
}

describe('outbox publisher', () => {
  it('publishes a valid outbox record with a deduplicated message id', async () => {
    const record = pendingRecord();
    const repository = {
      listPendingIds: vi.fn().mockResolvedValue([record.id]),
      claim: vi.fn().mockResolvedValue(record),
      markPublished: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn(),
      requeueStalePublishing: vi.fn()
    };
    const queue = { add: vi.fn().mockResolvedValue(record.id) };
    const publisher = new OutboxPublisher(
      repository as unknown as OutboxRepository,
      queue as unknown as QueueRuntime,
      { serviceName: 'test-publisher', serviceVersion: '0.1.0' }
    );

    const result = await publisher.publishBatch();

    expect(result).toEqual({ scanned: 1, published: 1, failed: 0 });
    expect(queue.add).toHaveBeenCalledWith(
      'job.commands',
      expect.objectContaining({
        messageId: record.id,
        messageType: 'job.create',
        tenantId: record.tenantId
      })
    );
    expect(repository.markPublished).toHaveBeenCalledWith(record.id);
  });

  it('returns a pending record to the queue after a publish failure', async () => {
    const record = pendingRecord();
    const repository = {
      listPendingIds: vi.fn().mockResolvedValue([record.id]),
      claim: vi.fn().mockResolvedValue(record),
      markPublished: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(undefined),
      requeueStalePublishing: vi.fn()
    };
    const queue = { add: vi.fn().mockRejectedValue(new Error('redis unavailable')) };
    const publisher = new OutboxPublisher(
      repository as unknown as OutboxRepository,
      queue as unknown as QueueRuntime,
      { serviceName: 'test-publisher', serviceVersion: '0.1.0', retryDelayMs: 1000 }
    );

    const result = await publisher.publishBatch();

    expect(result).toEqual({ scanned: 1, published: 0, failed: 1 });
    expect(repository.markFailed).toHaveBeenCalledWith(
      record.id,
      'OUTBOX_PUBLISH_FAILED',
      expect.any(Date)
    );
    expect(repository.markPublished).not.toHaveBeenCalled();
  });

  it('requeues stale publishing claims for recovery', async () => {
    const repository = {
      listPendingIds: vi.fn(),
      claim: vi.fn(),
      markPublished: vi.fn(),
      markFailed: vi.fn(),
      requeueStalePublishing: vi.fn().mockResolvedValue(2)
    };
    const publisher = new OutboxPublisher(
      repository as unknown as OutboxRepository,
      {} as QueueRuntime,
      { serviceName: 'test-publisher', serviceVersion: '0.1.0' }
    );

    const result = await publisher.reconcile(1000);

    expect(result).toBe(2);
    expect(repository.requeueStalePublishing).toHaveBeenCalledWith(expect.any(Date));
  });
});
