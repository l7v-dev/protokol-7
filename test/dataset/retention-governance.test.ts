import { describe, expect, it } from 'vitest';

import { DatasetRetentionGovernanceError, DatasetRetentionGovernanceRegistry } from '../../src/dataset/retention-governance.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const policy = { retentionDays: 30, configuredAt: '2026-01-01T00:00:00.000Z' };
const subject = { datasetVersionId: 'dataset_version_1', retentionStartedAt: '2026-01-01T00:00:00.000Z' };
const review = { deletionId: 'deletion_1', datasetVersionId: 'dataset_version_1', reviewedAt: '2026-02-01T00:00:00.000Z', authorization: { ...scope, permissions: ['dataset:delete'] as const } };

function configured(): DatasetRetentionGovernanceRegistry {
  const registry = new DatasetRetentionGovernanceRegistry();
  registry.configurePolicy(scope, policy);
  registry.registerSubject(scope, subject);
  return registry;
}

describe('dataset retention, deletion and legal hold governance contracts', () => {
  it('returns a non-destructive, explicit-approval deletion intent only after the retention window expires', () => {
    const registry = configured();
    const intent = registry.reviewDeletion(scope, review, new Date('2026-02-01T00:00:00.000Z'));

    expect(intent).toMatchObject({ status: 'DELETION_INTENT_READY', reason: 'RETENTION_ELIGIBLE', legalHoldCount: 0, requiresExplicitApproval: true, allowDestructiveAction: false, allowBypass: false });
    expect(intent.intentFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks deletion while retention is active or an unreleased legal hold exists, then allows only a new review after release', () => {
    const registry = configured();
    expect(registry.reviewDeletion(scope, review, new Date('2026-01-15T00:00:00.000Z')).reason).toBe('RETENTION_NOT_EXPIRED');
    registry.applyLegalHold(scope, { holdId: 'hold_1', datasetVersionId: 'dataset_version_1', reasonCode: 'LEGAL_REVIEW', appliedAt: '2026-01-02T00:00:00.000Z' });
    expect(registry.reviewDeletion(scope, review, new Date('2026-02-01T00:00:00.000Z')).reason).toBe('LEGAL_HOLD_ACTIVE');
    registry.releaseLegalHold(scope, 'dataset_version_1', 'hold_1', '2026-02-01T00:01:00.000Z', 'REVIEW_COMPLETE');
    expect(registry.reviewDeletion(scope, review, new Date('2026-02-02T00:00:00.000Z')).status).toBe('DELETION_INTENT_READY');
  });

  it('rejects scope/authorization mismatch, unknown subjects and conflicting policy or legal-hold changes fail-closed', () => {
    const registry = configured();
    expect(registry.reviewDeletion(scope, { ...review, authorization: { tenantId: 'tenant_2', projectId: 'project_1', permissions: ['dataset:delete'] } }, new Date('2026-02-01T00:00:00.000Z')).reason).toBe('AUTHORIZATION_REQUIRED');
    expect(() => registry.reviewDeletion({ tenantId: 'tenant_2', projectId: 'project_1' }, review, new Date())).toThrowError(expect.objectContaining({ code: 'DATASET_RETENTION_NOT_FOUND' }));
    expect(() => registry.configurePolicy(scope, { ...policy, retentionDays: 60 })).toThrow(DatasetRetentionGovernanceError);
    registry.applyLegalHold(scope, { holdId: 'hold_1', datasetVersionId: 'dataset_version_1', reasonCode: 'LEGAL_REVIEW', appliedAt: '2026-01-02T00:00:00.000Z' });
    expect(() => registry.applyLegalHold(scope, { holdId: 'hold_1', datasetVersionId: 'dataset_version_1', reasonCode: 'DIFFERENT_REASON', appliedAt: '2026-01-02T00:00:00.000Z' })).toThrow(DatasetRetentionGovernanceError);
  });
});
