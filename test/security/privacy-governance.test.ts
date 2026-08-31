import { describe, expect, it } from 'vitest';

import { PrivacyGovernanceError, reviewPrivacyGovernance } from '../../src/security/privacy-governance.js';

const input = {
  reviewId: 'privacy_review_1', scope: { tenantId: 'tenant_1', projectId: 'project_1' }, reviewedAt: '2026-08-27T00:00:00.000Z',
  audit: { eventCount: 10, coverage: 'CONFIRMED_REFERENCE' as const },
  retention: { activeLegalHoldCount: 1, posture: 'CONFIRMED_REFERENCE' as const, deletionDisposition: 'DELETION_BLOCKED_REFERENCE' as const },
  dlp: { posture: 'CLEAR_REFERENCE' as const, inspectedSubjectCount: 7 },
  access: { reviewCount: 5, outOfScopeDeniedCount: 2, posture: 'CONFIRMED_REFERENCE' as const }
};

describe('secret-safe non-destructive audit, privacy and data access governance review', () => {
  it('produces a review-ready report from complete bounded reference evidence without deleting or exporting data', () => {
    const report = reviewPrivacyGovernance(input);
    expect(report.status).toBe('REVIEW_READY');
    expect(report.remediationIds).toEqual([]);
    expect(report.checks).toEqual({ auditCoverageReferenceConfirmed: true, retentionReferenceConfirmed: true, deletionRemainsNonDestructive: true, dlpReferenceClear: true, accessReviewReferenceConfirmed: true });
    expect(report).toMatchObject({ evidence: { auditEventCount: 10, activeLegalHoldCount: 1, accessReviewCount: 5, outOfScopeDeniedCount: 2 }, allowsDestructiveAction: false, allowsDataExport: false });
  });

  it('returns only fixed remediation identifiers for incomplete audit/retention/DLP/access reference signals', () => {
    const report = reviewPrivacyGovernance({ ...input, audit: { ...input.audit, coverage: 'NOT_CONFIRMED' }, retention: { ...input.retention, posture: 'NOT_CONFIRMED' }, dlp: { ...input.dlp, posture: 'REVIEW_REQUIRED_REFERENCE' }, access: { ...input.access, posture: 'NOT_CONFIRMED' } });
    expect(report.status).toBe('REMEDIATION_REQUIRED');
    expect(report.remediationIds).toEqual(['AUDIT_EVIDENCE_REQUIRED', 'RETENTION_EVIDENCE_REQUIRED', 'DLP_REVIEW_REQUIRED', 'ACCESS_REVIEW_REQUIRED']);
    expect(JSON.stringify(report)).not.toContain('token');
    expect(JSON.stringify(report)).not.toContain('payload');
  });

  it('rejects unsafe scope, arbitrary posture, negative count and invalid time fail-closed', () => {
    expect(() => reviewPrivacyGovernance({ ...input, scope: { tenantId: 'bad tenant', projectId: 'project_1' } })).toThrow(PrivacyGovernanceError);
    expect(() => reviewPrivacyGovernance({ ...input, dlp: { ...input.dlp, posture: 'SCANNED' as never } })).toThrow(PrivacyGovernanceError);
    expect(() => reviewPrivacyGovernance({ ...input, access: { ...input.access, reviewCount: -1 } })).toThrow(PrivacyGovernanceError);
    expect(() => reviewPrivacyGovernance({ ...input, reviewedAt: 'bad-time' })).toThrow(PrivacyGovernanceError);
  });
});
