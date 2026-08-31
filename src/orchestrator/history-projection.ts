import { createHash } from 'node:crypto';

import type { JobControlAuditEvent } from './control-plane.js';
import type { DeliveryAuditEvent } from './delivery-ledger.js';
import type { OrchestrationAuditEvent } from './state-machine.js';
import type { JobProgressEvent } from './progress-events.js';

export type HistoryScope = {
  tenantId: string;
  jobId: string;
};

export type RunHistoryStatus = 'CREATED' | 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS' | 'FAILED' | 'CANCELLED';
export type AttemptHistoryStatus = 'CREATED' | 'CLAIMED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | 'WORKER_LOST' | 'CANCELLED';

export type RunHistoryRecord = {
  runId: string;
  status: RunHistoryStatus;
  recordedAt: string;
};

export type AttemptHistoryRecord = {
  attemptId: string;
  taskId: string;
  attemptNo: number;
  status: AttemptHistoryStatus;
  recordedAt: string;
  durationMs?: number;
  resultChecksumSha256?: string;
};

export type RunHistorySnapshot = {
  scope: HistoryScope;
  runs: ReadonlyArray<RunHistoryRecord & { attempts: ReadonlyArray<AttemptHistoryRecord> }>;
  runCount: number;
  attemptCount: number;
};

export type ActiveLeaseObservation = {
  taskId: string;
  leaseEpoch: number;
  expiresAt: string;
};

export type ReconciliationSnapshot = {
  plannedTaskIds: ReadonlyArray<string>;
  persistedTaskIds: ReadonlyArray<string>;
  queuedTaskIds: ReadonlyArray<string>;
  dispatchPendingTaskIds: ReadonlyArray<string>;
  activeLeases: ReadonlyArray<ActiveLeaseObservation>;
  unpublishedOutboxTaskIds: ReadonlyArray<string>;
  jobStatus?: RunHistoryStatus;
};

export type ReconciliationFindingCode =
  | 'PLANNED_TASK_WITHOUT_ATTEMPT'
  | 'QUEUE_TASK_WITHOUT_PERSISTED_RECORD'
  | 'DISPATCH_PENDING_TASK_NOT_QUEUED'
  | 'EXPIRED_ACTIVE_LEASE'
  | 'ORPHAN_ACTIVE_LEASE'
  | 'UNPUBLISHED_OUTBOX_TASK'
  | 'TERMINAL_JOB_WITH_ACTIVE_LEASE';

export type ReconciliationFinding = {
  code: ReconciliationFindingCode;
  severity: 'WARNING' | 'ERROR';
  taskId: string;
  leaseEpoch?: number;
};

export type ReconciliationReport = {
  reportId: string;
  scope: HistoryScope;
  observedAt: string;
  dryRun: true;
  repairAllowed: false;
  counts: {
    plannedTaskCount: number;
    persistedTaskCount: number;
    queuedTaskCount: number;
    dispatchPendingTaskCount: number;
    activeLeaseCount: number;
    unpublishedOutboxTaskCount: number;
    historicalRunCount: number;
    historicalAttemptCount: number;
    historicalTaskCount: number;
  };
  findings: ReadonlyArray<ReconciliationFinding>;
};

export type HistoryAuditEvent = {
  eventId: string;
  occurredAt: string;
  tenantId: string;
  jobId: string;
  runId: string;
  type: 'RUN_RECORDED' | 'ATTEMPT_RECORDED';
  taskId?: string;
  attemptId?: string;
  status: RunHistoryStatus | AttemptHistoryStatus;
};

export type SafeAuditSources = {
  lifecycle?: ReadonlyArray<OrchestrationAuditEvent>;
  delivery?: ReadonlyArray<DeliveryAuditEvent>;
  control?: ReadonlyArray<JobControlAuditEvent>;
  progress?: ReadonlyArray<JobProgressEvent>;
};

export type SafeAuditEntry = {
  source: 'HISTORY' | 'LIFECYCLE' | 'DELIVERY' | 'CONTROL' | 'PROGRESS';
  eventId: string;
  occurredAt: string;
  code: string;
  status?: string;
  taskId?: string;
  attemptId?: string;
  leaseEpoch?: number;
  sequence?: number;
};

export type SafeAuditView = {
  scope: HistoryScope;
  entries: ReadonlyArray<SafeAuditEntry>;
};

export class HistoryProjectionError extends Error {
  public constructor(
    public readonly code: 'HISTORY_INVALID' | 'HISTORY_NOT_FOUND' | 'HISTORY_CONFLICT' | 'HISTORY_SCOPE_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'HistoryProjectionError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_ITEMS_PER_REPORT = 100_000;
const MAX_AUDIT_ENTRIES = 10_000;
const TERMINAL_JOB_STATUSES = new Set<RunHistoryStatus>(['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED']);
const RUN_STATUSES = new Set<RunHistoryStatus>(['CREATED', 'QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED']);
const ATTEMPT_STATUSES = new Set<AttemptHistoryStatus>(['CREATED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'WORKER_LOST', 'CANCELLED']);

/**
 * Process-local, append-only reference projection. It neither reads or writes
 * PostgreSQL/Redis/BullMQ state nor repairs discrepancies or exposes raw execution data.
 */
export class RunAttemptHistoryProjection {
  private readonly runsByScope = new Map<string, Map<string, RunHistoryRecord>>();
  private readonly attemptsByRun = new Map<string, AttemptHistoryRecord[]>();
  private readonly auditByScope = new Map<string, HistoryAuditEvent[]>();
  private sequence = 0;

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public recordRun(scope: HistoryScope, run: RunHistoryRecord): RunHistoryRecord {
    validateScope(scope);
    validateRun(run);
    const runs = this.runsByScope.get(scopeKey(scope)) ?? new Map<string, RunHistoryRecord>();
    if (runs.has(run.runId)) throw new HistoryProjectionError('HISTORY_CONFLICT', 'Run history kaydı zaten mevcut.');
    const stored = { ...run };
    runs.set(stored.runId, stored);
    this.runsByScope.set(scopeKey(scope), runs);
    this.recordAudit(scope, stored.runId, 'RUN_RECORDED', stored.status, stored.recordedAt);
    return { ...stored };
  }

  public appendAttempt(scope: HistoryScope, runId: string, attempt: AttemptHistoryRecord): AttemptHistoryRecord {
    validateScope(scope);
    validateId(runId);
    validateAttempt(attempt);
    if (!this.runsByScope.get(scopeKey(scope))?.has(runId)) throw new HistoryProjectionError('HISTORY_NOT_FOUND', 'Run history bulunamadı.');
    const key = runKey(scope, runId);
    const attempts = this.attemptsByRun.get(key) ?? [];
    if (attempts.some((record) => record.attemptId === attempt.attemptId)) throw new HistoryProjectionError('HISTORY_CONFLICT', 'Attempt history kaydı zaten mevcut.');
    const previousTaskAttempts = attempts.filter((record) => record.taskId === attempt.taskId);
    if (attempt.attemptNo !== previousTaskAttempts.length + 1) throw new HistoryProjectionError('HISTORY_CONFLICT', 'Attempt numarası task geçmişiyle ardışık değil.');
    const stored = { ...attempt };
    this.attemptsByRun.set(key, [...attempts, stored]);
    this.recordAudit(scope, runId, 'ATTEMPT_RECORDED', stored.status, stored.recordedAt, stored.taskId, stored.attemptId);
    return { ...stored };
  }

  public snapshot(scope: HistoryScope): RunHistorySnapshot {
    validateScope(scope);
    const runs = this.runsByScope.get(scopeKey(scope));
    if (!runs) throw new HistoryProjectionError('HISTORY_NOT_FOUND', 'Run history scope bulunamadı.');
    const result = [...runs.values()]
      .sort(compareRecorded)
      .map((run) => ({ ...run, attempts: (this.attemptsByRun.get(runKey(scope, run.runId)) ?? []).map((attempt) => ({ ...attempt })) }));
    return {
      scope: { ...scope },
      runs: result,
      runCount: result.length,
      attemptCount: result.reduce((count, run) => count + run.attempts.length, 0)
    };
  }

  public reconcile(scope: HistoryScope, observation: ReconciliationSnapshot): ReconciliationReport {
    validateScope(scope);
    validateReconciliationSnapshot(observation);
    const history = this.snapshot(scope);
    const observedAt = this.now().toISOString();
    const planned = toIdSet(observation.plannedTaskIds);
    const persisted = toIdSet(observation.persistedTaskIds);
    const queued = toIdSet(observation.queuedTaskIds);
    const dispatchPending = toIdSet(observation.dispatchPendingTaskIds);
    const historicalTasks = new Set(history.runs.flatMap((run) => run.attempts.map((attempt) => attempt.taskId)));
    const findings: ReconciliationFinding[] = [];

    for (const taskId of sortedDifference(planned, historicalTasks)) findings.push({ code: 'PLANNED_TASK_WITHOUT_ATTEMPT', severity: 'WARNING', taskId });
    for (const taskId of sortedDifference(queued, persisted)) findings.push({ code: 'QUEUE_TASK_WITHOUT_PERSISTED_RECORD', severity: 'ERROR', taskId });
    for (const taskId of sortedDifference(dispatchPending, queued)) findings.push({ code: 'DISPATCH_PENDING_TASK_NOT_QUEUED', severity: 'WARNING', taskId });
    for (const lease of sortedLeases(observation.activeLeases)) {
      if (!persisted.has(lease.taskId)) findings.push({ code: 'ORPHAN_ACTIVE_LEASE', severity: 'ERROR', taskId: lease.taskId, leaseEpoch: lease.leaseEpoch });
      if (Date.parse(lease.expiresAt) <= Date.parse(observedAt)) findings.push({ code: 'EXPIRED_ACTIVE_LEASE', severity: 'WARNING', taskId: lease.taskId, leaseEpoch: lease.leaseEpoch });
      if (observation.jobStatus !== undefined && TERMINAL_JOB_STATUSES.has(observation.jobStatus)) findings.push({ code: 'TERMINAL_JOB_WITH_ACTIVE_LEASE', severity: 'ERROR', taskId: lease.taskId, leaseEpoch: lease.leaseEpoch });
    }
    for (const taskId of [...toIdSet(observation.unpublishedOutboxTaskIds)].sort()) findings.push({ code: 'UNPUBLISHED_OUTBOX_TASK', severity: 'WARNING', taskId });

    return {
      reportId: `reconcile_${createHash('sha256').update(`${scopeKey(scope)}:${observedAt}:${stableObservation(observation)}`).digest('hex').slice(0, 24)}`,
      scope: { ...scope },
      observedAt,
      dryRun: true,
      repairAllowed: false,
      counts: {
        plannedTaskCount: planned.size,
        persistedTaskCount: persisted.size,
        queuedTaskCount: queued.size,
        dispatchPendingTaskCount: dispatchPending.size,
        activeLeaseCount: observation.activeLeases.length,
        unpublishedOutboxTaskCount: toIdSet(observation.unpublishedOutboxTaskIds).size,
        historicalRunCount: history.runCount,
        historicalAttemptCount: history.attemptCount,
        historicalTaskCount: historicalTasks.size
      },
      findings
    };
  }

  public auditView(scope: HistoryScope, sources: SafeAuditSources = {}): SafeAuditView {
    validateScope(scope);
    const historyEvents = this.auditByScope.get(scopeKey(scope)) ?? [];
    const entries = [
      ...historyEvents.map((event) => historyAuditEntry(scope, event)),
      ...(sources.lifecycle ?? []).map((event) => lifecycleAuditEntry(scope, event)),
      ...(sources.delivery ?? []).map((event) => deliveryAuditEntry(scope, event)),
      ...(sources.control ?? []).map((event) => controlAuditEntry(scope, event)),
      ...(sources.progress ?? []).map((event) => progressAuditEntry(scope, event))
    ];
    if (entries.length > MAX_AUDIT_ENTRIES) throw new HistoryProjectionError('HISTORY_INVALID', 'Audit görünümü sınırı aşıldı.');
    return {
      scope: { ...scope },
      entries: entries.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.source.localeCompare(right.source) || left.eventId.localeCompare(right.eventId)).map((entry) => ({ ...entry }))
    };
  }

  private recordAudit(scope: HistoryScope, runId: string, type: HistoryAuditEvent['type'], status: HistoryAuditEvent['status'], occurredAt: string, taskId?: string, attemptId?: string): void {
    this.sequence += 1;
    const event: HistoryAuditEvent = {
      eventId: `history_${createHash('sha256').update(`${scopeKey(scope)}:${this.sequence}`).digest('hex').slice(0, 24)}`,
      occurredAt,
      tenantId: scope.tenantId,
      jobId: scope.jobId,
      runId,
      type,
      ...(taskId === undefined ? {} : { taskId }),
      ...(attemptId === undefined ? {} : { attemptId }),
      status
    };
    this.auditByScope.set(scopeKey(scope), [...(this.auditByScope.get(scopeKey(scope)) ?? []), event]);
  }
}

function historyAuditEntry(scope: HistoryScope, event: HistoryAuditEvent): SafeAuditEntry {
  validateScopedEvent(scope, event.tenantId, event.jobId, event.eventId, event.occurredAt);
  validateId(event.runId);
  if (event.taskId !== undefined) validateId(event.taskId);
  if (event.attemptId !== undefined) validateId(event.attemptId);
  return { source: 'HISTORY', eventId: event.eventId, occurredAt: event.occurredAt, code: event.type, status: event.status, ...(event.taskId === undefined ? {} : { taskId: event.taskId }), ...(event.attemptId === undefined ? {} : { attemptId: event.attemptId }) };
}

function lifecycleAuditEntry(scope: HistoryScope, event: OrchestrationAuditEvent): SafeAuditEntry {
  validateScopedEvent(scope, event.tenantId, event.jobId, event.eventId, event.occurredAt);
  if (event.taskId !== undefined) validateId(event.taskId);
  return { source: 'LIFECYCLE', eventId: event.eventId, occurredAt: event.occurredAt, code: event.code, status: event.toStatus, ...(event.taskId === undefined ? {} : { taskId: event.taskId }) };
}

function deliveryAuditEntry(scope: HistoryScope, event: DeliveryAuditEvent): SafeAuditEntry {
  validateScopedEvent(scope, event.tenantId, event.jobId, event.deliveryId, event.occurredAt);
  validateId(event.taskId);
  validateId(event.attemptId);
  if (!Number.isInteger(event.leaseEpoch) || event.leaseEpoch < 1) throw new HistoryProjectionError('HISTORY_INVALID', 'Delivery audit epoch geçerli değil.');
  return { source: 'DELIVERY', eventId: event.deliveryId, occurredAt: event.occurredAt, code: event.type, taskId: event.taskId, attemptId: event.attemptId, leaseEpoch: event.leaseEpoch };
}

function controlAuditEntry(scope: HistoryScope, event: JobControlAuditEvent): SafeAuditEntry {
  validateScopedEvent(scope, event.tenantId, event.jobId, event.eventId, event.occurredAt);
  return { source: 'CONTROL', eventId: event.eventId, occurredAt: event.occurredAt, code: event.type, status: event.status };
}

function progressAuditEntry(scope: HistoryScope, event: JobProgressEvent): SafeAuditEntry {
  validateScopedEvent(scope, event.tenantId, event.jobId, event.eventId, event.occurredAt);
  if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new HistoryProjectionError('HISTORY_INVALID', 'Progress audit sequence geçerli değil.');
  return { source: 'PROGRESS', eventId: event.eventId, occurredAt: event.occurredAt, code: event.type, ...(event.status === undefined ? {} : { status: event.status }), sequence: event.sequence };
}

function validateScope(scope: HistoryScope): void {
  validateId(scope.tenantId);
  validateId(scope.jobId);
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw new HistoryProjectionError('HISTORY_INVALID', 'History projection kimliği geçerli değil.');
}

function validateIsoDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new HistoryProjectionError('HISTORY_INVALID', 'History projection zamanı geçerli değil.');
}

function validateRun(run: RunHistoryRecord): void {
  validateId(run.runId);
  validateIsoDate(run.recordedAt);
  if (!RUN_STATUSES.has(run.status)) throw new HistoryProjectionError('HISTORY_INVALID', 'Run history statüsü geçerli değil.');
}

function validateAttempt(attempt: AttemptHistoryRecord): void {
  validateId(attempt.attemptId);
  validateId(attempt.taskId);
  validateIsoDate(attempt.recordedAt);
  if (!Number.isInteger(attempt.attemptNo) || attempt.attemptNo < 1 || attempt.attemptNo > MAX_ITEMS_PER_REPORT || !ATTEMPT_STATUSES.has(attempt.status)
    || attempt.durationMs !== undefined && (!Number.isInteger(attempt.durationMs) || attempt.durationMs < 0)
    || attempt.resultChecksumSha256 !== undefined && !SHA256.test(attempt.resultChecksumSha256)) {
    throw new HistoryProjectionError('HISTORY_INVALID', 'Attempt history kaydı geçerli değil.');
  }
}

function validateReconciliationSnapshot(observation: ReconciliationSnapshot): void {
  const idLists = [observation.plannedTaskIds, observation.persistedTaskIds, observation.queuedTaskIds, observation.dispatchPendingTaskIds, observation.unpublishedOutboxTaskIds];
  for (const ids of idLists) {
    if (ids.length > MAX_ITEMS_PER_REPORT || !ids.every((id) => SAFE_ID.test(id))) throw new HistoryProjectionError('HISTORY_INVALID', 'Reconciliation task listesi geçerli değil.');
  }
  if (observation.activeLeases.length > MAX_ITEMS_PER_REPORT || observation.jobStatus !== undefined && !RUN_STATUSES.has(observation.jobStatus)) {
    throw new HistoryProjectionError('HISTORY_INVALID', 'Reconciliation gözlemi geçerli değil.');
  }
  for (const lease of observation.activeLeases) {
    if (!SAFE_ID.test(lease.taskId) || !Number.isInteger(lease.leaseEpoch) || lease.leaseEpoch < 1 || !Number.isFinite(Date.parse(lease.expiresAt))) {
      throw new HistoryProjectionError('HISTORY_INVALID', 'Active lease gözlemi geçerli değil.');
    }
  }
}

function validateScopedEvent(scope: HistoryScope, tenantId: string, jobId: string, eventId: string, occurredAt: string): void {
  if (scope.tenantId !== tenantId || scope.jobId !== jobId) throw new HistoryProjectionError('HISTORY_SCOPE_MISMATCH', 'Audit event tenant veya job scope ile eşleşmiyor.');
  validateId(eventId);
  validateIsoDate(occurredAt);
}

function scopeKey(scope: HistoryScope): string {
  return `${scope.tenantId}:${scope.jobId}`;
}

function runKey(scope: HistoryScope, runId: string): string {
  return `${scopeKey(scope)}:${runId}`;
}

function compareRecorded(left: RunHistoryRecord, right: RunHistoryRecord): number {
  return left.recordedAt.localeCompare(right.recordedAt) || left.runId.localeCompare(right.runId);
}

function toIdSet(ids: ReadonlyArray<string>): Set<string> {
  return new Set(ids);
}

function sortedDifference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

function sortedLeases(leases: ReadonlyArray<ActiveLeaseObservation>): ActiveLeaseObservation[] {
  return [...leases].sort((left, right) => left.taskId.localeCompare(right.taskId) || left.leaseEpoch - right.leaseEpoch);
}

function stableObservation(observation: ReconciliationSnapshot): string {
  return JSON.stringify({
    plannedTaskIds: [...observation.plannedTaskIds].sort(),
    persistedTaskIds: [...observation.persistedTaskIds].sort(),
    queuedTaskIds: [...observation.queuedTaskIds].sort(),
    dispatchPendingTaskIds: [...observation.dispatchPendingTaskIds].sort(),
    activeLeases: sortedLeases(observation.activeLeases),
    unpublishedOutboxTaskIds: [...observation.unpublishedOutboxTaskIds].sort(),
    ...(observation.jobStatus === undefined ? {} : { jobStatus: observation.jobStatus })
  });
}
