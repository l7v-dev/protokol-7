import { createHash } from 'node:crypto';

import type { MessageType } from '../queue/contracts.js';

export type DlqScope = {
  tenantId: string;
  jobId: string;
};

export type DlqFailureClass = 'TRANSIENT' | 'VALIDATION' | 'POLICY' | 'AUTHORIZATION' | 'ANTI_BOT' | 'CANCELLED' | 'UNKNOWN';
export type DlqReviewStatus = 'PENDING_REVIEW' | 'REPLAY_APPROVED' | 'REPLAY_BLOCKED' | 'RECOVERED';
export type RecoveryAction = 'REPLAY_INTENT_CREATED' | 'REPLAY_INTENT_REUSED' | 'REPLAY_BLOCKED' | 'RECOVERY_RECORDED';

export type DlqRecordInput = {
  deadLetterId: string;
  originalMessageId: string;
  messageType: MessageType;
  taskId?: string;
  attemptId?: string;
  failureClass: DlqFailureClass;
  failureCode: string;
  failedAt: string;
};

export type DlqReviewRecord = DlqRecordInput & {
  tenantId: string;
  jobId: string;
  reviewStatus: DlqReviewStatus;
};

export type ReplayApproval = {
  operatorId: string;
  reasonCode: string;
  approvedAt: string;
};

export type ReplayIntent = {
  replayId: string;
  deadLetterId: string;
  originalMessageId: string;
  messageType: MessageType;
  tenantId: string;
  jobId: string;
  taskId?: string;
  attemptId?: string;
  sourceFingerprintSha256: string;
  idempotencyKeySha256: string;
  approvedBy: string;
  approvedAt: string;
  dispatchAllowed: false;
  allowBypass: false;
};

export type RecoveryAuditEvent = {
  eventId: string;
  occurredAt: string;
  tenantId: string;
  jobId: string;
  deadLetterId: string;
  action: RecoveryAction;
  failureClass: DlqFailureClass;
  failureCode: string;
  replayId?: string;
  operatorId?: string;
};

export type RecoveryReceipt = {
  deadLetterId: string;
  replayId: string;
  recoveredAt: string;
};

export class DlqRecoveryError extends Error {
  public constructor(
    public readonly code: 'DLQ_INVALID' | 'DLQ_NOT_FOUND' | 'DLQ_CONFLICT' | 'DLQ_SCOPE_MISMATCH' | 'DLQ_REPLAY_BLOCKED',
    message: string
  ) {
    super(message);
    this.name = 'DlqRecoveryError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_DLQ_RECORDS_PER_SCOPE = 10_000;
const REPLAYABLE_FAILURE_CLASSES = new Set<DlqFailureClass>(['TRANSIENT', 'UNKNOWN']);
const FAILURE_CLASSES = new Set<DlqFailureClass>(['TRANSIENT', 'VALIDATION', 'POLICY', 'AUTHORIZATION', 'ANTI_BOT', 'CANCELLED', 'UNKNOWN']);

/**
 * Process-local DLQ reference. It produces review/audit evidence and replay
 * intents only; it never reads a broker, dispatches a message, retries, or bypasses a policy block.
 */
export class DlqRecoveryRegistry {
  private readonly recordsByScope = new Map<string, Map<string, DlqReviewRecord>>();
  private readonly replaysByDeadLetter = new Map<string, ReplayIntent>();
  private readonly auditByScope = new Map<string, RecoveryAuditEvent[]>();
  private sequence = 0;

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public register(scope: DlqScope, input: DlqRecordInput): DlqReviewRecord {
    validateScope(scope);
    validateRecordInput(input);
    const key = scopeKey(scope);
    const records = this.recordsByScope.get(key) ?? new Map<string, DlqReviewRecord>();
    if (records.has(input.deadLetterId)) throw new DlqRecoveryError('DLQ_CONFLICT', 'DLQ kaydı zaten mevcut.');
    if (records.size >= MAX_DLQ_RECORDS_PER_SCOPE) throw new DlqRecoveryError('DLQ_INVALID', 'DLQ kayıt sınırı aşıldı.');
    const reviewStatus: DlqReviewStatus = REPLAYABLE_FAILURE_CLASSES.has(input.failureClass) ? 'PENDING_REVIEW' : 'REPLAY_BLOCKED';
    const record: DlqReviewRecord = { ...input, tenantId: scope.tenantId, jobId: scope.jobId, reviewStatus };
    records.set(record.deadLetterId, record);
    this.recordsByScope.set(key, records);
    if (reviewStatus === 'REPLAY_BLOCKED') this.recordAudit(scope, record, 'REPLAY_BLOCKED');
    return { ...record };
  }

  public review(scope: DlqScope): ReadonlyArray<DlqReviewRecord> {
    validateScope(scope);
    return [...(this.recordsByScope.get(scopeKey(scope))?.values() ?? [])]
      .sort((left, right) => left.failedAt.localeCompare(right.failedAt) || left.deadLetterId.localeCompare(right.deadLetterId))
      .map((record) => ({ ...record }));
  }

  public createReplayIntent(scope: DlqScope, deadLetterId: string, approval: ReplayApproval): ReplayIntent {
    validateScope(scope);
    validateId(deadLetterId);
    validateApproval(approval);
    const record = this.requireRecord(scope, deadLetterId);
    if (!REPLAYABLE_FAILURE_CLASSES.has(record.failureClass) || record.reviewStatus === 'REPLAY_BLOCKED' || record.reviewStatus === 'RECOVERED') {
      throw new DlqRecoveryError('DLQ_REPLAY_BLOCKED', 'DLQ kaydı replay policy tarafından reddedildi.');
    }
    const existing = this.replaysByDeadLetter.get(recordKey(scope, deadLetterId));
    if (existing) {
      this.recordAudit(scope, record, 'REPLAY_INTENT_REUSED', existing.replayId, approval.operatorId);
      return cloneIntent(existing);
    }
    const sourceFingerprintSha256 = sha256(`${record.originalMessageId}:${record.messageType}:${record.taskId ?? ''}:${record.attemptId ?? ''}`);
    const idempotencyKeySha256 = sha256(`${scopeKey(scope)}:${deadLetterId}:${sourceFingerprintSha256}`);
    const intent: ReplayIntent = {
      replayId: `replay_${idempotencyKeySha256.slice(0, 24)}`,
      deadLetterId: record.deadLetterId,
      originalMessageId: record.originalMessageId,
      messageType: record.messageType,
      tenantId: scope.tenantId,
      jobId: scope.jobId,
      ...(record.taskId === undefined ? {} : { taskId: record.taskId }),
      ...(record.attemptId === undefined ? {} : { attemptId: record.attemptId }),
      sourceFingerprintSha256,
      idempotencyKeySha256,
      approvedBy: approval.operatorId,
      approvedAt: approval.approvedAt,
      dispatchAllowed: false,
      allowBypass: false
    };
    this.replaysByDeadLetter.set(recordKey(scope, deadLetterId), intent);
    record.reviewStatus = 'REPLAY_APPROVED';
    this.recordAudit(scope, record, 'REPLAY_INTENT_CREATED', intent.replayId, approval.operatorId);
    return cloneIntent(intent);
  }

  public recordRecovery(scope: DlqScope, deadLetterId: string, replayId: string): RecoveryReceipt {
    validateScope(scope);
    validateId(deadLetterId);
    validateId(replayId);
    const record = this.requireRecord(scope, deadLetterId);
    const intent = this.replaysByDeadLetter.get(recordKey(scope, deadLetterId));
    if (!intent || intent.replayId !== replayId) throw new DlqRecoveryError('DLQ_SCOPE_MISMATCH', 'Replay intent DLQ kaydıyla eşleşmiyor.');
    if (record.reviewStatus === 'RECOVERED') throw new DlqRecoveryError('DLQ_CONFLICT', 'DLQ kaydı zaten recover edildi.');
    record.reviewStatus = 'RECOVERED';
    const recoveredAt = this.now().toISOString();
    this.recordAudit(scope, record, 'RECOVERY_RECORDED', replayId);
    return { deadLetterId, replayId, recoveredAt };
  }

  public auditEvents(scope: DlqScope): ReadonlyArray<RecoveryAuditEvent> {
    validateScope(scope);
    return (this.auditByScope.get(scopeKey(scope)) ?? []).map((event) => ({ ...event }));
  }

  private requireRecord(scope: DlqScope, deadLetterId: string): DlqReviewRecord {
    const record = this.recordsByScope.get(scopeKey(scope))?.get(deadLetterId);
    if (!record) throw new DlqRecoveryError('DLQ_NOT_FOUND', 'DLQ kaydı bulunamadı.');
    return record;
  }

  private recordAudit(scope: DlqScope, record: DlqReviewRecord, action: RecoveryAction, replayId?: string, operatorId?: string): void {
    this.sequence += 1;
    const event: RecoveryAuditEvent = {
      eventId: `dlq_audit_${createHash('sha256').update(`${scopeKey(scope)}:${this.sequence}`).digest('hex').slice(0, 24)}`,
      occurredAt: this.now().toISOString(),
      tenantId: scope.tenantId,
      jobId: scope.jobId,
      deadLetterId: record.deadLetterId,
      action,
      failureClass: record.failureClass,
      failureCode: record.failureCode,
      ...(replayId === undefined ? {} : { replayId }),
      ...(operatorId === undefined ? {} : { operatorId })
    };
    this.auditByScope.set(scopeKey(scope), [...(this.auditByScope.get(scopeKey(scope)) ?? []), event]);
  }
}

function validateScope(scope: DlqScope): void {
  validateId(scope.tenantId);
  validateId(scope.jobId);
}

function validateRecordInput(input: DlqRecordInput): void {
  validateId(input.deadLetterId);
  validateId(input.originalMessageId);
  validateId(input.failureCode);
  validateIsoDate(input.failedAt);
  if (input.taskId !== undefined) validateId(input.taskId);
  if (input.attemptId !== undefined) validateId(input.attemptId);
  if (!FAILURE_CLASSES.has(input.failureClass)) throw new DlqRecoveryError('DLQ_INVALID', 'DLQ failure class geçerli değil.');
}

function validateApproval(approval: ReplayApproval): void {
  validateId(approval.operatorId);
  validateId(approval.reasonCode);
  validateIsoDate(approval.approvedAt);
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw new DlqRecoveryError('DLQ_INVALID', 'DLQ kimliği geçerli değil.');
}

function validateIsoDate(value: string): void {
  if (!Number.isFinite(Date.parse(value))) throw new DlqRecoveryError('DLQ_INVALID', 'DLQ zamanı geçerli değil.');
}

function scopeKey(scope: DlqScope): string {
  return `${scope.tenantId}:${scope.jobId}`;
}

function recordKey(scope: DlqScope, deadLetterId: string): string {
  return `${scopeKey(scope)}:${deadLetterId}`;
}

function cloneIntent(intent: ReplayIntent): ReplayIntent {
  return { ...intent };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
