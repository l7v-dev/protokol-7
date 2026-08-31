export const THREAT_MODEL_CONTRACT_VERSION = 'threat-model/v1' as const;

export type ThreatId = 'SSRF_EGRESS' | 'TENANT_ISOLATION' | 'SECRET_EXPOSURE' | 'AUTHORIZATION_BYPASS' | 'POLICY_BYPASS' | 'RESOURCE_EXHAUSTION';
export type ThreatSeverity = 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type SecurityOwnerRole = 'SECURITY_LEAD' | 'BACKEND_LEAD' | 'SRE_PLATFORM_LEAD' | 'COMPLIANCE_LEGAL';
export type ThreatReviewStatus = 'OPEN' | 'MITIGATED_VERIFIED' | 'RISK_ACCEPTANCE_PENDING';
export type ThreatReviewInput = { threatId: ThreatId; owner: SecurityOwnerRole; status: ThreatReviewStatus };
export type ThreatReviewReport = {
  contractVersion: typeof THREAT_MODEL_CONTRACT_VERSION;
  reviewId: string;
  reviewedAt: string;
  findings: ReadonlyArray<{ threatId: ThreatId; severity: ThreatSeverity; owner: SecurityOwnerRole; status: ThreatReviewStatus; closureCriterion: string; controlFamily: 'NETWORK' | 'ISOLATION' | 'SECRETS' | 'IAM' | 'COMPLIANCE' | 'RESILIENCE' }>;
  highCriticalAssignmentComplete: boolean;
  highCriticalClosureCriteriaComplete: boolean;
  unresolvedHighCriticalThreatIds: ReadonlyArray<ThreatId>;
  allowsGoLive: false;
};

export class ThreatModelError extends Error {
  public constructor(public readonly code: 'THREAT_MODEL_INVALID' | 'THREAT_MODEL_INCOMPLETE', message: string) {
    super(message);
    this.name = 'ThreatModelError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const CATALOG: Readonly<Record<ThreatId, Omit<ThreatReviewReport['findings'][number], 'threatId' | 'owner' | 'status'>>> = {
  SSRF_EGRESS: { severity: 'CRITICAL', controlFamily: 'NETWORK', closureCriterion: 'Private/metadata egress ve redirect validation testleri kontrollü olarak geçer.' },
  TENANT_ISOLATION: { severity: 'CRITICAL', controlFamily: 'ISOLATION', closureCriterion: 'Cross-tenant access ve artifact isolation negatif testleri geçer.' },
  SECRET_EXPOSURE: { severity: 'CRITICAL', controlFamily: 'SECRETS', closureCriterion: 'Secret redaction, storage ve trace/log exposure testleri geçer.' },
  AUTHORIZATION_BYPASS: { severity: 'HIGH', controlFamily: 'IAM', closureCriterion: 'Role/scope/revocation negatif enforcement testleri geçer.' },
  POLICY_BYPASS: { severity: 'HIGH', controlFamily: 'COMPLIANCE', closureCriterion: 'Policy/anti-bot/CAPTCHA bypass ve automatic bypass retry yolları reddedilir.' },
  RESOURCE_EXHAUSTION: { severity: 'MEDIUM', controlFamily: 'RESILIENCE', closureCriterion: 'Worker/browser kaynak limitleri ve bounded retry testleri geçer.' }
};

/**
 * Bounded review record only. No exploit instructions, attack payloads, target
 * details, credentials, private endpoints or raw evidence are accepted or
 * emitted. The report cannot approve production go-live or mutate controls.
 */
export function reviewThreatModel(input: { reviewId: string; reviewedAt: string; reviews: ReadonlyArray<ThreatReviewInput> }): ThreatReviewReport {
  if (!SAFE_ID.test(input.reviewId) || !Number.isFinite(Date.parse(input.reviewedAt))) throw invalid();
  const seen = new Set<ThreatId>();
  const findings = input.reviews.map((review) => {
    if (!isThreatId(review.threatId) || !isOwner(review.owner) || !isStatus(review.status) || seen.has(review.threatId)) throw invalid();
    seen.add(review.threatId);
    return { threatId: review.threatId, owner: review.owner, status: review.status, ...CATALOG[review.threatId] };
  });
  if (findings.length !== Object.keys(CATALOG).length) throw new ThreatModelError('THREAT_MODEL_INCOMPLETE', 'Kapalı threat catalog eksiksiz review edilmelidir.');
  const highCritical = findings.filter((finding) => finding.severity === 'HIGH' || finding.severity === 'CRITICAL');
  return {
    contractVersion: THREAT_MODEL_CONTRACT_VERSION, reviewId: input.reviewId, reviewedAt: input.reviewedAt, findings,
    highCriticalAssignmentComplete: highCritical.every((finding) => finding.owner !== undefined),
    highCriticalClosureCriteriaComplete: highCritical.every((finding) => finding.closureCriterion.length > 0),
    unresolvedHighCriticalThreatIds: highCritical.filter((finding) => finding.status !== 'MITIGATED_VERIFIED').map((finding) => finding.threatId),
    allowsGoLive: false
  };
}

function isThreatId(value: string): value is ThreatId {
  return Object.hasOwn(CATALOG, value);
}

function isOwner(value: string): value is SecurityOwnerRole {
  return ['SECURITY_LEAD', 'BACKEND_LEAD', 'SRE_PLATFORM_LEAD', 'COMPLIANCE_LEGAL'].includes(value);
}

function isStatus(value: string): value is ThreatReviewStatus {
  return ['OPEN', 'MITIGATED_VERIFIED', 'RISK_ACCEPTANCE_PENDING'].includes(value);
}

function invalid(): ThreatModelError {
  return new ThreatModelError('THREAT_MODEL_INVALID', 'Threat model review input geçerli değil.');
}
