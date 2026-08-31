import { describe, expect, it } from 'vitest';

import { DeliveryLedgerError, TaskDeliveryLedger } from '../../src/orchestrator/delivery-ledger.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };

describe('TaskDeliveryLedger', () => {
  it('commits one result per derived idempotency key and returns an idempotent receipt to duplicate delivery', () => {
    let now = new Date('2026-08-27T00:00:00.000Z');
    const ledger = new TaskDeliveryLedger(() => now);
    const acquired = ledger.acquire(scope, 'worker_1', 5_000);
    if (!('leaseEpoch' in acquired)) throw new Error('Expected lease.');
    const checksum = 'a'.repeat(64);
    const committed = ledger.commit(scope, 'worker_1', acquired.leaseEpoch, checksum);
    const duplicate = ledger.acquire(scope, 'worker_2', 5_000);

    expect(committed).toMatchObject({ resultChecksumSha256: checksum, idempotent: false });
    expect(duplicate).toMatchObject({ deliveryId: committed.deliveryId, idempotent: true });
    expect(ledger.auditEvents(scope).map((event) => event.type)).toEqual(['LEASE_ACQUIRED', 'RESULT_COMMITTED']);
    now = new Date(now.getTime() + 1);
  });

  it('enforces worker ownership, heartbeat and expiry/reclaim lease epochs', () => {
    let now = new Date('2026-08-27T00:00:00.000Z');
    const ledger = new TaskDeliveryLedger(() => now);
    const first = ledger.acquire(scope, 'worker_1', 1_000);
    if (!('leaseEpoch' in first)) throw new Error('Expected lease.');
    expect(() => ledger.heartbeat(scope, 'worker_2', first.leaseEpoch, 1_000)).toThrowError(expect.objectContaining({ code: 'LEASE_CONFLICT' }));
    ledger.heartbeat(scope, 'worker_1', first.leaseEpoch, 1_000);
    now = new Date(now.getTime() + 1_001);
    expect(() => ledger.commit(scope, 'worker_1', first.leaseEpoch)).toThrowError(expect.objectContaining({ code: 'LEASE_EXPIRED' }));
    const reclaimed = ledger.acquire(scope, 'worker_2', 1_000);
    if (!('leaseEpoch' in reclaimed)) throw new Error('Expected reclaimed lease.');
    expect(reclaimed.leaseEpoch).toBe(first.leaseEpoch + 1);
    expect(ledger.commit(scope, 'worker_2', reclaimed.leaseEpoch)).toMatchObject({ idempotent: false });
  });

  it('rejects malformed/cross-scope and conflicting idempotent result inputs without value leakage', () => {
    const ledger = new TaskDeliveryLedger(() => new Date('2026-08-27T00:00:00.000Z'));
    expect(() => ledger.acquire({ ...scope, tenantId: 'bad id' }, 'worker_1', 1_000)).toThrow(DeliveryLedgerError);
    const acquired = ledger.acquire(scope, 'worker_1', 1_000);
    if (!('leaseEpoch' in acquired)) throw new Error('Expected lease.');
    ledger.commit(scope, 'worker_1', acquired.leaseEpoch, 'a'.repeat(64));
    expect(() => ledger.commit(scope, 'worker_1', acquired.leaseEpoch, 'b'.repeat(64))).toThrowError(expect.objectContaining({ code: 'DELIVERY_SCOPE_MISMATCH' }));
    expect(() => ledger.auditEvents({ ...scope, taskId: 'task_2' })).not.toThrow();
    expect(JSON.stringify(ledger.auditEvents(scope))).not.toContain('authorization');
  });
});
