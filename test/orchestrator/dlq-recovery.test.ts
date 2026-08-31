import { describe, expect, it } from 'vitest';

import { DlqRecoveryError, DlqRecoveryRegistry } from '../../src/orchestrator/dlq-recovery.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1' };
const registry = () => new DlqRecoveryRegistry(() => new Date('2026-08-27T00:00:00.000Z'));
const transientRecord = {
  deadLetterId: 'dlq_1',
  originalMessageId: 'message_1',
  messageType: 'task.execute' as const,
  taskId: 'task_1',
  attemptId: 'attempt_1',
  failureClass: 'TRANSIENT' as const,
  failureCode: 'UPSTREAM_TIMEOUT',
  failedAt: '2026-08-26T23:59:00.000Z'
};

describe('DLQ review, replay intent and recovery contracts', () => {
  it('returns tenant/job-scoped, secret-safe DLQ review records in deterministic order', () => {
    const dlq = registry();
    dlq.register(scope, transientRecord);
    dlq.register(scope, { ...transientRecord, deadLetterId: 'dlq_2', originalMessageId: 'message_2', failedAt: '2026-08-26T23:58:00.000Z' });

    const review = dlq.review(scope);
    expect(review.map((record) => record.deadLetterId)).toEqual(['dlq_2', 'dlq_1']);
    expect(review[0]).toMatchObject({ reviewStatus: 'PENDING_REVIEW', failureClass: 'TRANSIENT' });
    expect(JSON.stringify(review)).not.toContain('payload');
    expect(() => dlq.register(scope, transientRecord)).toThrowError(expect.objectContaining({ code: 'DLQ_CONFLICT' }));
  });

  it('requires explicit operator approval and creates an idempotent, non-dispatching replay intent', () => {
    const dlq = registry();
    dlq.register(scope, transientRecord);
    const approval = { operatorId: 'operator_1', reasonCode: 'RECOVERY_REVIEWED', approvedAt: '2026-08-27T00:00:00.000Z' };
    const first = dlq.createReplayIntent(scope, 'dlq_1', approval);
    const second = dlq.createReplayIntent(scope, 'dlq_1', approval);

    expect(first).toMatchObject({ deadLetterId: 'dlq_1', approvedBy: 'operator_1', dispatchAllowed: false, allowBypass: false });
    expect(first.replayId).toBe(second.replayId);
    expect(dlq.review(scope)[0]).toMatchObject({ reviewStatus: 'REPLAY_APPROVED' });
    expect(dlq.auditEvents(scope).map((event) => event.action)).toEqual(['REPLAY_INTENT_CREATED', 'REPLAY_INTENT_REUSED']);
  });

  it('blocks policy/authentication/anti-bot DLQ replay and rejects cross-scope or malformed recovery inputs', () => {
    const dlq = registry();
    dlq.register(scope, { ...transientRecord, deadLetterId: 'dlq_policy', failureClass: 'POLICY' });
    dlq.register(scope, { ...transientRecord, deadLetterId: 'dlq_auth', failureClass: 'AUTHORIZATION' });
    dlq.register(scope, { ...transientRecord, deadLetterId: 'dlq_challenge', failureClass: 'ANTI_BOT' });

    for (const deadLetterId of ['dlq_policy', 'dlq_auth', 'dlq_challenge']) {
      expect(() => dlq.createReplayIntent(scope, deadLetterId, { operatorId: 'operator_1', reasonCode: 'RECOVERY_REVIEWED', approvedAt: '2026-08-27T00:00:00.000Z' })).toThrowError(expect.objectContaining({ code: 'DLQ_REPLAY_BLOCKED' }));
    }
    expect(() => dlq.review({ tenantId: 'tenant_2', jobId: 'job_1' })).not.toThrow();
    expect(() => dlq.createReplayIntent(scope, 'dlq_policy', { operatorId: 'bad id', reasonCode: 'RECOVERY_REVIEWED', approvedAt: 'bad-date' })).toThrow(DlqRecoveryError);
    expect(() => dlq.recordRecovery(scope, 'dlq_policy', 'replay_1')).toThrowError(expect.objectContaining({ code: 'DLQ_SCOPE_MISMATCH' }));
  });
});
