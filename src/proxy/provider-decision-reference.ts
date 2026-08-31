export const PROVIDER_DECISION_REFERENCE_CONTRACT_VERSION = 'provider-decision-reference/v1' as const;

export type LocalReferenceStatus = 'LOCAL_REFERENCE_CERTIFIED' | 'LOCAL_REFERENCE_REJECTED';
export type ProviderFailoverIntent = 'KEEP_CURRENT_PROVIDER' | 'MANUAL_FAILOVER_REVIEW_REQUIRED' | 'NO_AUTOMATIC_FAILOVER';
export type ProviderDecisionReasonCode = 'CURRENT_HEALTHY_HIGHEST_SCORE' | 'ALTERNATIVE_HIGHER_SCORE' | 'NO_ELIGIBLE_LOCAL_REFERENCE' | 'CURRENT_PROVIDER_NOT_ELIGIBLE';

export type ProviderDecisionCandidate = {
  providerId: string;
  providerVersion: string;
  localReferenceStatus: LocalReferenceStatus;
  health: {
    healthy: boolean;
    successRate: number;
    latencyMs: number;
    availableCapacity: number;
  };
  estimatedCostCents: number;
  currency: string;
};

export type ProviderDecisionEvaluation = {
  tenantId: string;
  decisionId: string;
  currentProviderId: string;
  candidates: ReadonlyArray<ProviderDecisionCandidate>;
};

export type ProviderDecisionCandidateScore = {
  providerId: string;
  providerVersion: string;
  localReferenceStatus: LocalReferenceStatus;
  eligibleForManualReview: boolean;
  healthScore: number;
  capacityScore: number;
  costScore: number;
  totalScore: number;
};

export type ProviderDecisionReference = {
  contractVersion: typeof PROVIDER_DECISION_REFERENCE_CONTRACT_VERSION;
  tenantId: string;
  decisionId: string;
  currentProviderId: string;
  failoverIntent: ProviderFailoverIntent;
  reasonCode: ProviderDecisionReasonCode;
  selectedProviderId?: string;
  considered: ProviderDecisionCandidateScore[];
  requiresRealProviderCertification: true;
  requiresExplicitActivationApproval: true;
  allowsAutomaticFailover: false;
  allowsProviderActivation: false;
  allowsExternalProviderCall: false;
};

export class ProviderDecisionReferenceError extends Error {
  public constructor(public readonly code: 'PROVIDER_DECISION_REFERENCE_INVALID', message: string) {
    super(message);
    this.name = 'ProviderDecisionReferenceError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_CANDIDATES = 12;
const SCORE_WEIGHTS = { health: 0.65, capacity: 0.15, cost: 0.2 } as const;

/**
 * Side-effect-free local comparison reference. It only ranks supplied bounded
 * snapshots and records a non-dispatching failover intent; it never invokes a
 * provider, activates an adapter, dispatches traffic or retries a request.
 */
export function evaluateProviderDecisionReference(input: ProviderDecisionEvaluation): ProviderDecisionReference {
  validate(input);
  const eligible = input.candidates.filter((candidate) => candidate.health.healthy && candidate.localReferenceStatus === 'LOCAL_REFERENCE_CERTIFIED');
  const maxCost = Math.max(...eligible.map((candidate) => candidate.estimatedCostCents), 1);
  const considered = input.candidates
    .map((candidate) => score(candidate, maxCost))
    .sort((left, right) => right.totalScore - left.totalScore || left.providerId.localeCompare(right.providerId));
  const selected = considered.find((candidate) => candidate.eligibleForManualReview);
  const current = considered.find((candidate) => candidate.providerId === input.currentProviderId);

  if (!selected) {
    return result(input, considered, 'NO_AUTOMATIC_FAILOVER', current?.eligibleForManualReview ? 'NO_ELIGIBLE_LOCAL_REFERENCE' : 'CURRENT_PROVIDER_NOT_ELIGIBLE');
  }
  if (selected.providerId === input.currentProviderId) {
    return result(input, considered, 'KEEP_CURRENT_PROVIDER', 'CURRENT_HEALTHY_HIGHEST_SCORE', selected.providerId);
  }
  return result(input, considered, 'MANUAL_FAILOVER_REVIEW_REQUIRED', 'ALTERNATIVE_HIGHER_SCORE', selected.providerId);
}

function result(input: ProviderDecisionEvaluation, considered: ProviderDecisionCandidateScore[], failoverIntent: ProviderFailoverIntent, reasonCode: ProviderDecisionReasonCode, selectedProviderId?: string): ProviderDecisionReference {
  return {
    contractVersion: PROVIDER_DECISION_REFERENCE_CONTRACT_VERSION,
    tenantId: input.tenantId,
    decisionId: input.decisionId,
    currentProviderId: input.currentProviderId,
    failoverIntent,
    reasonCode,
    ...(selectedProviderId ? { selectedProviderId } : {}),
    considered: considered.map((candidate) => ({ ...candidate })),
    requiresRealProviderCertification: true,
    requiresExplicitActivationApproval: true,
    allowsAutomaticFailover: false,
    allowsProviderActivation: false,
    allowsExternalProviderCall: false
  };
}

function score(candidate: ProviderDecisionCandidate, maxCost: number): ProviderDecisionCandidateScore {
  const eligibleForManualReview = candidate.health.healthy && candidate.localReferenceStatus === 'LOCAL_REFERENCE_CERTIFIED';
  const healthScore = eligibleForManualReview
    ? round((candidate.health.successRate * 0.75) + (Math.min(1, 1_000 / Math.max(candidate.health.latencyMs, 1)) * 0.25))
    : 0;
  const capacityScore = eligibleForManualReview ? round(Math.min(1, candidate.health.availableCapacity / 100)) : 0;
  const costScore = eligibleForManualReview ? round(1 - (candidate.estimatedCostCents / maxCost)) : 0;
  const totalScore = eligibleForManualReview
    ? round((healthScore * SCORE_WEIGHTS.health) + (capacityScore * SCORE_WEIGHTS.capacity) + (costScore * SCORE_WEIGHTS.cost))
    : 0;
  return { providerId: candidate.providerId, providerVersion: candidate.providerVersion, localReferenceStatus: candidate.localReferenceStatus, eligibleForManualReview, healthScore, capacityScore, costScore, totalScore };
}

function validate(input: ProviderDecisionEvaluation): void {
  if (!SAFE_ID.test(input.tenantId) || !SAFE_ID.test(input.decisionId) || !SAFE_ID.test(input.currentProviderId)
    || input.candidates.length < 1 || input.candidates.length > MAX_CANDIDATES) {
    throw invalid();
  }
  const currency = input.candidates[0]?.currency;
  if (!currency || !SAFE_ID.test(currency) || new Set(input.candidates.map((candidate) => candidate.providerId)).size !== input.candidates.length
    || !input.candidates.some((candidate) => candidate.providerId === input.currentProviderId)
    || input.candidates.some((candidate) => !SAFE_ID.test(candidate.providerId)
      || !SAFE_ID.test(candidate.providerVersion)
      || candidate.currency !== currency
      || !Number.isFinite(candidate.health.successRate) || candidate.health.successRate < 0 || candidate.health.successRate > 1
      || !Number.isFinite(candidate.health.latencyMs) || candidate.health.latencyMs < 0
      || !Number.isFinite(candidate.health.availableCapacity) || candidate.health.availableCapacity < 0
      || !Number.isFinite(candidate.estimatedCostCents) || candidate.estimatedCostCents < 0)) {
    throw invalid();
  }
}

function invalid(): ProviderDecisionReferenceError {
  return new ProviderDecisionReferenceError('PROVIDER_DECISION_REFERENCE_INVALID', 'Provider decision reference input geçerli değil.');
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
