import { describe, expect, it } from 'vitest';

import { STRATEGY_VERSION_CONTRACT_VERSION, StrategyFeedbackError, StrategyFeedbackRegistry } from '../../src/strategy/feedback-versioning.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const versionInput = { contractVersion: STRATEGY_VERSION_CONTRACT_VERSION, strategyKey: 'target_strategy', ruleFingerprintSha256: 'a'.repeat(64), createdAt: '2026-08-27T00:00:00.000Z' };

describe('strategy feedback, outcome and immutable versioning contracts', () => {
  it('creates immutable sequential versions and reuses exact version inputs idempotently', () => {
    const registry = new StrategyFeedbackRegistry();
    const first = registry.createVersion(scope, versionInput);
    const duplicate = registry.createVersion(scope, versionInput);
    const second = registry.createVersion(scope, { ...versionInput, ruleFingerprintSha256: 'b'.repeat(64) });

    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({ versionNumber: 1, contractVersion: STRATEGY_VERSION_CONTRACT_VERSION });
    expect(second).toMatchObject({ versionNumber: 2 });
    expect(registry.listVersions(scope, 'target_strategy').map((version) => version.versionId)).toEqual([first.versionId, second.versionId]);
  });

  it('records safe idempotent feedback/outcomes and derives deterministic quality/cost impact summaries', () => {
    const registry = new StrategyFeedbackRegistry();
    const version = registry.createVersion(scope, versionInput);
    const outcome = { outcomeId: 'outcome_1', proposalId: 'proposal_1', versionId: version.versionId, outcome: 'SUCCEEDED' as const, qualityScoreBps: 8_000, costUnits: 3, recordedAt: '2026-08-27T00:01:00.000Z' };
    registry.recordOutcome(scope, outcome);
    registry.recordOutcome(scope, outcome);
    registry.recordOutcome(scope, { ...outcome, outcomeId: 'outcome_2', proposalId: 'proposal_2', outcome: 'FAILED', qualityScoreBps: 4_000, costUnits: 5 });
    registry.recordFeedback(scope, { feedbackId: 'feedback_1', proposalId: 'proposal_1', versionId: version.versionId, verdict: 'ACCEPTED', reasonCode: 'QUALITY_VALIDATED', recordedAt: '2026-08-27T00:02:00.000Z' });

    expect(registry.impact(scope, version.versionId)).toEqual({ scope, versionId: version.versionId, outcomeCount: 2, feedbackCount: 1, succeededCount: 1, failedCount: 1, cancelledCount: 0, policyBlockedCount: 0, averageQualityScoreBps: 6_000, totalCostUnits: 8 });
    expect(JSON.stringify(registry.impact(scope, version.versionId))).not.toContain('prompt');
  });

  it('rejects cross-scope, malformed and conflicting outcome/feedback records fail-closed', () => {
    const registry = new StrategyFeedbackRegistry();
    const version = registry.createVersion(scope, versionInput);
    const outcome = { outcomeId: 'outcome_1', proposalId: 'proposal_1', versionId: version.versionId, outcome: 'SUCCEEDED' as const, qualityScoreBps: 8_000, costUnits: 3, recordedAt: '2026-08-27T00:01:00.000Z' };
    registry.recordOutcome(scope, outcome);

    expect(() => registry.recordOutcome(scope, { ...outcome, costUnits: 4 })).toThrowError(expect.objectContaining({ code: 'STRATEGY_VERSION_CONFLICT' }));
    expect(() => registry.recordFeedback({ tenantId: 'tenant_2', projectId: 'project_1' }, { feedbackId: 'feedback_1', proposalId: 'proposal_1', versionId: version.versionId, verdict: 'ACCEPTED', reasonCode: 'QUALITY_VALIDATED', recordedAt: '2026-08-27T00:02:00.000Z' })).toThrowError(expect.objectContaining({ code: 'STRATEGY_VERSION_SCOPE_MISMATCH' }));
    expect(() => registry.createVersion(scope, { ...versionInput, ruleFingerprintSha256: 'invalid' })).toThrow(StrategyFeedbackError);
  });
});
