import { createHash } from 'node:crypto';

import type { DatasetScope } from './model.js';

export const DATASET_RETENTION_GOVERNANCE_VERSION = 'dataset-retention-governance/v1' as const;

export type DatasetRetentionPolicy = {
  retentionDays: number;
  configuredAt: string;
};

export type DatasetRetentionSubject = {
  datasetVersionId: string;
  retentionStartedAt: string;
};

export type DatasetLegalHold = {
  holdId: string;
  datasetVersionId: string;
  reasonCode: string;
  appliedAt: string;
  releasedAt?: string;
  releaseReasonCode?: string;
};

export type DatasetDeletionReview = {
  deletionId: string;
  datasetVersionId: string;
  reviewedAt: string;
  authorization: {
    tenantId: string;
    projectId: string;
    permissions: ReadonlyArray<'dataset:delete'>;
  };
};

export type DatasetDeletionIntent = {
  contractVersion: typeof DATASET_RETENTION_GOVERNANCE_VERSION;
  deletionId: string;
  datasetVersionId: string;
  status: 'DELETION_INTENT_READY' | 'DELETION_BLOCKED';
  reason: 'RETENTION_ELIGIBLE' | 'RETENTION_NOT_EXPIRED' | 'LEGAL_HOLD_ACTIVE' | 'AUTHORIZATION_REQUIRED';
  legalHoldCount: number;
  retentionExpiresAt: string;
  intentFingerprintSha256: string;
  requiresExplicitApproval: true;
  allowDestructiveAction: false;
  allowBypass: false;
};

export class DatasetRetentionGovernanceError extends Error {
  public constructor(
    public readonly code: 'DATASET_RETENTION_INVALID' | 'DATASET_RETENTION_SCOPE_MISMATCH' | 'DATASET_RETENTION_CONFLICT' | 'DATASET_RETENTION_NOT_FOUND',
    message: string
  ) {
    super(message);
    this.name = 'DatasetRetentionGovernanceError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_RETENTION_DAYS = 36_500;

/**
 * Process-local governance evaluator. It creates no destructive command and
 * never deletes database rows, object storage, or audit/lineage information.
 */
export class DatasetRetentionGovernanceRegistry {
  private readonly policies = new Map<string, DatasetRetentionPolicy>();
  private readonly subjects = new Map<string, DatasetRetentionSubject>();
  private readonly holds = new Map<string, DatasetLegalHold[]>();

  public configurePolicy(scope: DatasetScope, policy: DatasetRetentionPolicy): DatasetRetentionPolicy {
    validateScope(scope);
    validatePolicy(policy);
    const key = scopeKey(scope);
    const existing = this.policies.get(key);
    if (existing) {
      if (samePolicy(existing, policy)) return { ...existing };
      throw new DatasetRetentionGovernanceError('DATASET_RETENTION_CONFLICT', 'Retention policy farklı içerikle tekrar yapılandırılamaz.');
    }
    this.policies.set(key, { ...policy });
    return { ...policy };
  }

  public registerSubject(scope: DatasetScope, subject: DatasetRetentionSubject): DatasetRetentionSubject {
    validateScope(scope);
    validateSubject(subject);
    this.requirePolicy(scope);
    const key = subjectKey(scope, subject.datasetVersionId);
    const existing = this.subjects.get(key);
    if (existing) {
      if (existing.retentionStartedAt === subject.retentionStartedAt) return { ...existing };
      throw new DatasetRetentionGovernanceError('DATASET_RETENTION_CONFLICT', 'Dataset retention başlangıcı farklı içerikle tekrar kullanılamaz.');
    }
    this.subjects.set(key, { ...subject });
    return { ...subject };
  }

  public applyLegalHold(scope: DatasetScope, hold: Omit<DatasetLegalHold, 'releasedAt' | 'releaseReasonCode'>): DatasetLegalHold {
    validateScope(scope);
    validateLegalHold(hold);
    this.requireSubject(scope, hold.datasetVersionId);
    const key = subjectKey(scope, hold.datasetVersionId);
    const stored = this.holds.get(key) ?? [];
    const existing = stored.find((candidate) => candidate.holdId === hold.holdId);
    if (existing) {
      if (existing.reasonCode === hold.reasonCode && existing.appliedAt === hold.appliedAt) return cloneHold(existing);
      throw new DatasetRetentionGovernanceError('DATASET_RETENTION_CONFLICT', 'Legal hold kimliği farklı içerikle tekrar kullanılamaz.');
    }
    const next: DatasetLegalHold = { ...hold };
    this.holds.set(key, [...stored, next]);
    return cloneHold(next);
  }

  public releaseLegalHold(scope: DatasetScope, datasetVersionId: string, holdId: string, releasedAt: string, releaseReasonCode: string): DatasetLegalHold {
    validateScope(scope);
    validateId(datasetVersionId);
    validateId(holdId);
    validateId(releaseReasonCode);
    if (!isTime(releasedAt)) throw invalid();
    this.requireSubject(scope, datasetVersionId);
    const key = subjectKey(scope, datasetVersionId);
    const stored = this.holds.get(key) ?? [];
    const index = stored.findIndex((hold) => hold.holdId === holdId);
    if (index < 0) throw new DatasetRetentionGovernanceError('DATASET_RETENTION_NOT_FOUND', 'Legal hold bulunamadı.');
    const current = stored[index]!;
    if (current.releasedAt !== undefined) {
      if (current.releasedAt === releasedAt && current.releaseReasonCode === releaseReasonCode) return cloneHold(current);
      throw new DatasetRetentionGovernanceError('DATASET_RETENTION_CONFLICT', 'Legal hold farklı içerikle tekrar release edilemez.');
    }
    const released: DatasetLegalHold = { ...current, releasedAt, releaseReasonCode };
    const next = [...stored];
    next[index] = released;
    this.holds.set(key, next);
    return cloneHold(released);
  }

  public reviewDeletion(scope: DatasetScope, review: DatasetDeletionReview, now: Date = new Date()): DatasetDeletionIntent {
    validateScope(scope);
    validateReview(review);
    const policy = this.requirePolicy(scope);
    const subject = this.requireSubject(scope, review.datasetVersionId);
    const retentionExpiresAt = new Date(Date.parse(subject.retentionStartedAt) + policy.retentionDays * 86_400_000).toISOString();
    const activeHolds = (this.holds.get(subjectKey(scope, review.datasetVersionId)) ?? []).filter((hold) => hold.releasedAt === undefined);
    const authorized = review.authorization.tenantId === scope.tenantId && review.authorization.projectId === scope.projectId && review.authorization.permissions.includes('dataset:delete');
    const reason = !authorized ? 'AUTHORIZATION_REQUIRED'
      : activeHolds.length > 0 ? 'LEGAL_HOLD_ACTIVE'
        : now.getTime() < Date.parse(retentionExpiresAt) ? 'RETENTION_NOT_EXPIRED'
          : 'RETENTION_ELIGIBLE';
    return {
      contractVersion: DATASET_RETENTION_GOVERNANCE_VERSION,
      deletionId: review.deletionId,
      datasetVersionId: review.datasetVersionId,
      status: reason === 'RETENTION_ELIGIBLE' ? 'DELETION_INTENT_READY' : 'DELETION_BLOCKED',
      reason,
      legalHoldCount: activeHolds.length,
      retentionExpiresAt,
      intentFingerprintSha256: createHash('sha256').update(JSON.stringify({ scope, deletionId: review.deletionId, datasetVersionId: review.datasetVersionId, reviewedAt: review.reviewedAt, reason, activeHoldIds: activeHolds.map((hold) => hold.holdId).sort() })).digest('hex'),
      requiresExplicitApproval: true,
      allowDestructiveAction: false,
      allowBypass: false
    };
  }

  private requirePolicy(scope: DatasetScope): DatasetRetentionPolicy {
    const policy = this.policies.get(scopeKey(scope));
    if (!policy) throw new DatasetRetentionGovernanceError('DATASET_RETENTION_NOT_FOUND', 'Retention policy bulunamadı.');
    return policy;
  }

  private requireSubject(scope: DatasetScope, datasetVersionId: string): DatasetRetentionSubject {
    const subject = this.subjects.get(subjectKey(scope, datasetVersionId));
    if (subject) return subject;
    if ([...this.subjects.values()].some((candidate) => candidate.datasetVersionId === datasetVersionId)) throw new DatasetRetentionGovernanceError('DATASET_RETENTION_SCOPE_MISMATCH', 'Dataset version tenant veya project scope ile eşleşmiyor.');
    throw new DatasetRetentionGovernanceError('DATASET_RETENTION_NOT_FOUND', 'Dataset retention subject bulunamadı.');
  }
}

function validatePolicy(policy: DatasetRetentionPolicy): void {
  if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 1 || policy.retentionDays > MAX_RETENTION_DAYS || !isTime(policy.configuredAt)) throw invalid();
}

function validateSubject(subject: DatasetRetentionSubject): void {
  if (!SAFE_ID.test(subject.datasetVersionId) || !isTime(subject.retentionStartedAt)) throw invalid();
}

function validateLegalHold(hold: Omit<DatasetLegalHold, 'releasedAt' | 'releaseReasonCode'>): void {
  if (![hold.holdId, hold.datasetVersionId, hold.reasonCode].every((value) => SAFE_ID.test(value)) || !isTime(hold.appliedAt)) throw invalid();
}

function validateReview(review: DatasetDeletionReview): void {
  if (!SAFE_ID.test(review.deletionId) || !SAFE_ID.test(review.datasetVersionId) || !isTime(review.reviewedAt)
    || !SAFE_ID.test(review.authorization.tenantId) || !SAFE_ID.test(review.authorization.projectId)
    || review.authorization.permissions.length !== 1 || review.authorization.permissions[0] !== 'dataset:delete') throw invalid();
}

function validateScope(scope: DatasetScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.projectId)) throw invalid();
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw invalid();
}

function isTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function scopeKey(scope: DatasetScope): string {
  return `${scope.tenantId}:${scope.projectId}`;
}

function subjectKey(scope: DatasetScope, datasetVersionId: string): string {
  return `${scopeKey(scope)}:${datasetVersionId}`;
}

function samePolicy(left: DatasetRetentionPolicy, right: DatasetRetentionPolicy): boolean {
  return left.retentionDays === right.retentionDays && left.configuredAt === right.configuredAt;
}

function cloneHold(hold: DatasetLegalHold): DatasetLegalHold {
  return { ...hold };
}

function invalid(): DatasetRetentionGovernanceError {
  return new DatasetRetentionGovernanceError('DATASET_RETENTION_INVALID', 'Dataset retention governance input geçerli değil.');
}
