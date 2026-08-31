import { describe, expect, it } from 'vitest';

import { reviewThreatModel, ThreatModelError, type ThreatReviewInput } from '../../src/security/threat-model.js';

const reviews: ReadonlyArray<ThreatReviewInput> = [
  { threatId: 'SSRF_EGRESS', owner: 'SECURITY_LEAD', status: 'OPEN' },
  { threatId: 'TENANT_ISOLATION', owner: 'BACKEND_LEAD', status: 'MITIGATED_VERIFIED' },
  { threatId: 'SECRET_EXPOSURE', owner: 'SECURITY_LEAD', status: 'OPEN' },
  { threatId: 'AUTHORIZATION_BYPASS', owner: 'BACKEND_LEAD', status: 'OPEN' },
  { threatId: 'POLICY_BYPASS', owner: 'COMPLIANCE_LEGAL', status: 'MITIGATED_VERIFIED' },
  { threatId: 'RESOURCE_EXHAUSTION', owner: 'SRE_PLATFORM_LEAD', status: 'OPEN' }
];

describe('bounded security threat model and abuse case review', () => {
  it('records the complete fixed catalog with owner and closure criteria for every high/critical finding', () => {
    const report = reviewThreatModel({ reviewId: 'review_1', reviewedAt: '2026-08-27T00:00:00.000Z', reviews });

    expect(report.findings).toHaveLength(6);
    expect(report.highCriticalAssignmentComplete).toBe(true);
    expect(report.highCriticalClosureCriteriaComplete).toBe(true);
    expect(report.unresolvedHighCriticalThreatIds).toEqual(['SSRF_EGRESS', 'SECRET_EXPOSURE', 'AUTHORIZATION_BYPASS']);
    expect(report.allowsGoLive).toBe(false);
  });

  it('reports a fully mitigated review without granting automatic go-live approval or exposing attack detail', () => {
    const report = reviewThreatModel({ reviewId: 'review_2', reviewedAt: '2026-08-27T00:00:00.000Z', reviews: reviews.map((review) => ({ ...review, status: 'MITIGATED_VERIFIED' })) });
    expect(report.unresolvedHighCriticalThreatIds).toEqual([]);
    expect(report.allowsGoLive).toBe(false);
    expect(JSON.stringify(report)).not.toContain('payload');
    expect(JSON.stringify(report)).not.toContain('credential');
  });

  it('rejects incomplete, duplicate or unrecognized abuse-case reviews fail-closed', () => {
    expect(() => reviewThreatModel({ reviewId: 'review_3', reviewedAt: '2026-08-27T00:00:00.000Z', reviews: reviews.slice(1) })).toThrow(ThreatModelError);
    expect(() => reviewThreatModel({ reviewId: 'review_3', reviewedAt: '2026-08-27T00:00:00.000Z', reviews: [...reviews.slice(0, 5), reviews[0]!] })).toThrow(ThreatModelError);
    expect(() => reviewThreatModel({ reviewId: 'bad id', reviewedAt: 'bad-time', reviews })).toThrow(ThreatModelError);
  });
});
