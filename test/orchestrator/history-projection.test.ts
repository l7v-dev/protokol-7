import { describe, expect, it } from 'vitest';

import { HistoryProjectionError, RunAttemptHistoryProjection } from '../../src/orchestrator/history-projection.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1' };
const projection = () => new RunAttemptHistoryProjection(() => new Date('2026-08-27T00:00:00.000Z'));

describe('run/attempt history, reconciliation and safe audit projection contracts', () => {
  it('keeps run and attempt history append-only, ordered and detached from callers', () => {
    const history = projection();
    history.recordRun(scope, { runId: 'run_2', status: 'RUNNING', recordedAt: '2026-08-27T00:02:00.000Z' });
    history.recordRun(scope, { runId: 'run_1', status: 'COMPLETED', recordedAt: '2026-08-27T00:01:00.000Z' });
    history.appendAttempt(scope, 'run_1', { attemptId: 'attempt_1', taskId: 'task_1', attemptNo: 1, status: 'SUCCEEDED', recordedAt: '2026-08-27T00:01:01.000Z', resultChecksumSha256: 'a'.repeat(64) });
    history.appendAttempt(scope, 'run_1', { attemptId: 'attempt_2', taskId: 'task_1', attemptNo: 2, status: 'SUCCEEDED', recordedAt: '2026-08-27T00:01:02.000Z', durationMs: 12 });

    const firstSnapshot = history.snapshot(scope);
    expect(firstSnapshot.runs.map((run) => run.runId)).toEqual(['run_1', 'run_2']);
    expect(firstSnapshot).toMatchObject({ runCount: 2, attemptCount: 2 });
    const firstAttempt = firstSnapshot.runs[0]?.attempts[0];
    if (!firstAttempt) throw new Error('Beklenen attempt snapshot içinde bulunamadı.');
    firstAttempt.taskId = 'tampered';
    expect(history.snapshot(scope).runs[0]?.attempts[0]).toMatchObject({ taskId: 'task_1', attemptNo: 1 });
    expect(() => history.appendAttempt(scope, 'run_1', { attemptId: 'attempt_3', taskId: 'task_1', attemptNo: 4, status: 'FAILED', recordedAt: '2026-08-27T00:01:03.000Z' })).toThrowError(expect.objectContaining({ code: 'HISTORY_CONFLICT' }));
  });

  it('returns deterministic dry-run discrepancy findings without applying a repair', () => {
    const history = projection();
    history.recordRun(scope, { runId: 'run_1', status: 'COMPLETED', recordedAt: '2026-08-27T00:00:00.000Z' });
    history.appendAttempt(scope, 'run_1', { attemptId: 'attempt_1', taskId: 'task_seen', attemptNo: 1, status: 'SUCCEEDED', recordedAt: '2026-08-27T00:00:01.000Z' });

    const report = history.reconcile(scope, {
      plannedTaskIds: ['task_seen', 'task_missing'],
      persistedTaskIds: ['task_seen', 'task_pending'],
      queuedTaskIds: ['task_seen', 'task_queue_only'],
      dispatchPendingTaskIds: ['task_pending'],
      activeLeases: [{ taskId: 'task_orphan', leaseEpoch: 2, expiresAt: '2026-08-26T23:59:59.000Z' }],
      unpublishedOutboxTaskIds: ['task_outbox'],
      jobStatus: 'COMPLETED'
    });

    expect(report).toMatchObject({ dryRun: true, repairAllowed: false, counts: { historicalRunCount: 1, historicalAttemptCount: 1, historicalTaskCount: 1 } });
    expect(report.findings.map((finding) => finding.code)).toEqual([
      'PLANNED_TASK_WITHOUT_ATTEMPT',
      'QUEUE_TASK_WITHOUT_PERSISTED_RECORD',
      'DISPATCH_PENDING_TASK_NOT_QUEUED',
      'ORPHAN_ACTIVE_LEASE',
      'EXPIRED_ACTIVE_LEASE',
      'TERMINAL_JOB_WITH_ACTIVE_LEASE',
      'UNPUBLISHED_OUTBOX_TASK'
    ]);
  });

  it('merges only tenant/job-matching safe audit fields and rejects malformed scope input', () => {
    const history = projection();
    history.recordRun(scope, { runId: 'run_1', status: 'RUNNING', recordedAt: '2026-08-27T00:00:00.000Z' });
    const view = history.auditView(scope, {
      delivery: [{ type: 'LEASE_ACQUIRED', deliveryId: 'delivery_1', idempotencyKey: 'secret-derived-key', tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1', leaseEpoch: 1, occurredAt: '2026-08-27T00:00:01.000Z' }],
      progress: [{ eventId: 'progress_1', sequence: 1, occurredAt: '2026-08-27T00:00:02.000Z', tenantId: 'tenant_1', jobId: 'job_1', type: 'TASK_PROGRESS', status: 'RUNNING', completedTaskCount: 1, totalTaskCount: 2 }]
    });

    expect(view.entries.map((entry) => entry.source)).toEqual(['HISTORY', 'DELIVERY', 'PROGRESS']);
    expect(JSON.stringify(view)).not.toContain('idempotencyKey');
    expect(JSON.stringify(view)).not.toContain('secret-derived-key');
    expect(() => history.auditView(scope, { control: [{ eventId: 'control_1', type: 'PAUSED', tenantId: 'tenant_2', jobId: 'job_1', status: 'PAUSED', activeDeliveryCount: 0, occurredAt: '2026-08-27T00:00:00.000Z' }] })).toThrowError(expect.objectContaining({ code: 'HISTORY_SCOPE_MISMATCH' }));
    expect(() => history.recordRun(scope, { runId: 'bad id', status: 'RUNNING', recordedAt: 'invalid' })).toThrow(HistoryProjectionError);
  });
});
