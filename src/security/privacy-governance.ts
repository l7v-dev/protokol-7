export const PRIVACY_GOVERNANCE_CONTRACT_VERSION = 'privacy-governance/v1' as const;

export type PrivacyRemediationId = 'AUDIT_EVIDENCE_REQUIRED' | 'RETENTION_EVIDENCE_REQUIRED' | 'DLP_REVIEW_REQUIRED' | 'ACCESS_REVIEW_REQUIRED';
export type PrivacyGovernanceReport = {
  contractVersion: typeof PRIVACY_GOVERNANCE_CONTRACT_VERSION;
  reviewId: string;
  scope: { tenantId: string; projectId: string };
  reviewedAt: string;
  status: 'REVIEW_READY' | 'REMEDIATION_REQUIRED';
  checks: { auditCoverageReferenceConfirmed: boolean; retentionReferenceConfirmed: boolean; deletionRemainsNonDestructive: boolean; dlpReferenceClear: boolean; accessReviewReferenceConfirmed: boolean };
  remediationIds: ReadonlyArray<PrivacyRemediationId>;
  evidence: { auditEventCount: number; activeLegalHoldCount: number; accessReviewCount: number; outOfScopeDeniedCount: number };
  allowsDestructiveAction: false;
  allowsDataExport: false;
};

export class PrivacyGovernanceError extends Error {
  public constructor(public readonly code: 'PRIVACY_GOVERNANCE_INVALID', message: string) {
    super(message);
    this.name = 'PrivacyGovernanceError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_COUNT = 100_000_000;

/**
 * Pure governance review projection. Input contains only bounded counts and
 * closed reference signals—never audit content, personal data, records,
 * payloads, credentials, DLP findings, access tokens or deletion targets. It
 * cannot scan DLP, inspect access, retain/delete data, export data or write an
 * audit system.
 */
export function reviewPrivacyGovernance(input: { reviewId: string; scope: { tenantId: string; projectId: string }; reviewedAt: string; audit: { eventCount: number; coverage: 'CONFIRMED_REFERENCE' | 'NOT_CONFIRMED' }; retention: { activeLegalHoldCount: number; posture: 'CONFIRMED_REFERENCE' | 'NOT_CONFIRMED'; deletionDisposition: 'NO_DELETION_REVIEW' | 'DELETION_BLOCKED_REFERENCE' | 'DELETION_INTENT_REFERENCE' }; dlp: { posture: 'CLEAR_REFERENCE' | 'REVIEW_REQUIRED_REFERENCE' | 'NOT_CONFIRMED'; inspectedSubjectCount: number }; access: { reviewCount: number; outOfScopeDeniedCount: number; posture: 'CONFIRMED_REFERENCE' | 'NOT_CONFIRMED' } }): PrivacyGovernanceReport {
  validate(input);
  const checks = {
    auditCoverageReferenceConfirmed: input.audit.coverage === 'CONFIRMED_REFERENCE',
    retentionReferenceConfirmed: input.retention.posture === 'CONFIRMED_REFERENCE',
    deletionRemainsNonDestructive: true,
    dlpReferenceClear: input.dlp.posture === 'CLEAR_REFERENCE',
    accessReviewReferenceConfirmed: input.access.posture === 'CONFIRMED_REFERENCE'
  };
  const remediationIds: PrivacyRemediationId[] = [
    ...(checks.auditCoverageReferenceConfirmed ? [] : ['AUDIT_EVIDENCE_REQUIRED' as const]),
    ...(checks.retentionReferenceConfirmed ? [] : ['RETENTION_EVIDENCE_REQUIRED' as const]),
    ...(checks.dlpReferenceClear ? [] : ['DLP_REVIEW_REQUIRED' as const]),
    ...(checks.accessReviewReferenceConfirmed ? [] : ['ACCESS_REVIEW_REQUIRED' as const])
  ];
  return {
    contractVersion: PRIVACY_GOVERNANCE_CONTRACT_VERSION, reviewId: input.reviewId, scope: { ...input.scope }, reviewedAt: input.reviewedAt,
    status: remediationIds.length === 0 ? 'REVIEW_READY' : 'REMEDIATION_REQUIRED', checks, remediationIds,
    evidence: { auditEventCount: input.audit.eventCount, activeLegalHoldCount: input.retention.activeLegalHoldCount, accessReviewCount: input.access.reviewCount, outOfScopeDeniedCount: input.access.outOfScopeDeniedCount },
    allowsDestructiveAction: false, allowsDataExport: false
  };
}

function validate(input: { reviewId: string; scope: { tenantId: string; projectId: string }; reviewedAt: string; audit: { eventCount: number; coverage: string }; retention: { activeLegalHoldCount: number; posture: string; deletionDisposition: string }; dlp: { posture: string; inspectedSubjectCount: number }; access: { reviewCount: number; outOfScopeDeniedCount: number; posture: string } }): void {
  if (!SAFE_ID.test(input.reviewId) || !SAFE_ID.test(input.scope.tenantId) || !SAFE_ID.test(input.scope.projectId) || !Number.isFinite(Date.parse(input.reviewedAt))
    || !count(input.audit.eventCount) || !count(input.retention.activeLegalHoldCount) || !count(input.dlp.inspectedSubjectCount) || !count(input.access.reviewCount) || !count(input.access.outOfScopeDeniedCount)
    || !['CONFIRMED_REFERENCE', 'NOT_CONFIRMED'].includes(input.audit.coverage) || !['CONFIRMED_REFERENCE', 'NOT_CONFIRMED'].includes(input.retention.posture)
    || !['NO_DELETION_REVIEW', 'DELETION_BLOCKED_REFERENCE', 'DELETION_INTENT_REFERENCE'].includes(input.retention.deletionDisposition)
    || !['CLEAR_REFERENCE', 'REVIEW_REQUIRED_REFERENCE', 'NOT_CONFIRMED'].includes(input.dlp.posture) || !['CONFIRMED_REFERENCE', 'NOT_CONFIRMED'].includes(input.access.posture)) throw invalid();
}

function count(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_COUNT;
}

function invalid(): PrivacyGovernanceError {
  return new PrivacyGovernanceError('PRIVACY_GOVERNANCE_INVALID', 'Privacy governance input geçerli değil.');
}
