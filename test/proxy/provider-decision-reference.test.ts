import { describe, expect, it } from 'vitest';

import {
  ProviderDecisionReferenceError,
  evaluateProviderDecisionReference
} from '../../src/proxy/provider-decision-reference.js';
import type { ProviderDecisionCandidate, ProviderDecisionEvaluation } from '../../src/proxy/provider-decision-reference.js';

const candidates: ProviderDecisionCandidate[] = [
  { providerId: 'provider_current', providerVersion: 'reference_1.0.0', localReferenceStatus: 'LOCAL_REFERENCE_CERTIFIED', health: { healthy: true, successRate: 0.99, latencyMs: 150, availableCapacity: 80 }, estimatedCostCents: 25, currency: 'USD' },
  { providerId: 'provider_alternative', providerVersion: 'reference_1.0.0', localReferenceStatus: 'LOCAL_REFERENCE_CERTIFIED', health: { healthy: true, successRate: 0.995, latencyMs: 100, availableCapacity: 100 }, estimatedCostCents: 10, currency: 'USD' }
];

function evaluation(overrides: Partial<ProviderDecisionEvaluation> = {}): ProviderDecisionEvaluation {
  return { tenantId: 'tenant_1', decisionId: 'decision_1', currentProviderId: 'provider_current', candidates, ...overrides };
}

describe('provider decision local reference contract', () => {
  it('ranks equivalent local snapshots deterministically and records alternate selection only as a manual-review intent', () => {
    const first = evaluateProviderDecisionReference(evaluation());
    const second = evaluateProviderDecisionReference(evaluation());
    expect(first).toEqual(second);
    expect(first).toMatchObject({ failoverIntent: 'MANUAL_FAILOVER_REVIEW_REQUIRED', reasonCode: 'ALTERNATIVE_HIGHER_SCORE', selectedProviderId: 'provider_alternative', requiresRealProviderCertification: true, requiresExplicitActivationApproval: true, allowsAutomaticFailover: false, allowsProviderActivation: false, allowsExternalProviderCall: false });
    expect(first.considered.map((candidate) => candidate.providerId)).toEqual(['provider_alternative', 'provider_current']);
  });

  it('keeps the current provider when it has the highest eligible score and still never activates or dispatches it', () => {
    const result = evaluateProviderDecisionReference(evaluation({ candidates: candidates.map((candidate) => candidate.providerId === 'provider_current' ? { ...candidate, estimatedCostCents: 5 } : candidate) }));
    expect(result).toMatchObject({ failoverIntent: 'KEEP_CURRENT_PROVIDER', reasonCode: 'CURRENT_HEALTHY_HIGHEST_SCORE', selectedProviderId: 'provider_current', allowsAutomaticFailover: false, allowsExternalProviderCall: false });
  });

  it('fails closed with no automatic failover when all local reference candidates are ineligible', () => {
    const result = evaluateProviderDecisionReference(evaluation({ candidates: candidates.map((candidate) => ({ ...candidate, localReferenceStatus: 'LOCAL_REFERENCE_REJECTED' })) }));
    expect(result).toMatchObject({ failoverIntent: 'NO_AUTOMATIC_FAILOVER', reasonCode: 'CURRENT_PROVIDER_NOT_ELIGIBLE', allowsProviderActivation: false });
    expect(result.selectedProviderId).toBeUndefined();
    expect(result.considered.every((candidate) => candidate.totalScore === 0)).toBe(true);
  });

  it('rejects unsafe, cross-currency, duplicate or unbounded candidate inputs before a decision is produced', () => {
    expect(() => evaluateProviderDecisionReference(evaluation({ tenantId: 'tenant unsafe' }))).toThrow(ProviderDecisionReferenceError);
    expect(() => evaluateProviderDecisionReference(evaluation({ candidates: [{ ...candidates[0]!, currency: 'USD' }, { ...candidates[1]!, currency: 'EUR' }] }))).toThrow(ProviderDecisionReferenceError);
    expect(() => evaluateProviderDecisionReference(evaluation({ candidates: [{ ...candidates[0]! }, { ...candidates[0]! }] }))).toThrow(ProviderDecisionReferenceError);
    expect(() => evaluateProviderDecisionReference(evaluation({ candidates: Array.from({ length: 13 }, (_, index) => ({ ...candidates[0]!, providerId: `provider_${index}` })) }))).toThrow(ProviderDecisionReferenceError);
  });
});
