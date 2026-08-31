import { describe, expect, it } from 'vitest';

import { OfflineEvaluationError, OfflineStrategyEvaluator, OFFLINE_STRATEGY_EVALUATION_VERSION } from '../../src/strategy/offline-evaluation.js';

const criteria = { minCandidateMatchBps: 7_500, maxBaselineRegressionBps: 1_000, maxDriftBps: 2_500, requestedCanaryBps: 500 };
const safePolicy = { analyzerAllowed: true, promptGuarded: true, aiBudgetEnabled: true };
const input = {
  contractVersion: OFFLINE_STRATEGY_EVALUATION_VERSION,
  evaluationSetId: 'eval_set_1',
  candidateStrategyVersionId: 'strategy_candidate_2',
  baselineStrategyVersionId: 'strategy_baseline_1',
  criteria,
  cases: [
    { caseId: 'case_1', expectedCandidate: 'HTTP_DIRECT' as const, baselineCandidate: 'HTTP_DIRECT' as const, proposedCandidate: 'HTTP_DIRECT' as const, policy: safePolicy },
    { caseId: 'case_2', expectedCandidate: 'BROWSER_RENDER' as const, baselineCandidate: 'HTTP_DIRECT' as const, proposedCandidate: 'BROWSER_RENDER' as const, policy: safePolicy },
    { caseId: 'case_3', expectedCandidate: 'NONE' as const, baselineCandidate: 'NONE' as const, proposedCandidate: 'NONE' as const, policy: safePolicy },
    { caseId: 'case_4', expectedCandidate: 'PROXY_ROTATION' as const, baselineCandidate: 'PROXY_ROTATION' as const, proposedCandidate: 'PROXY_ROTATION' as const, policy: safePolicy }
  ]
};

describe('offline strategy evaluation, drift and controlled rollout contracts', () => {
  it('compares candidate and deterministic baseline and makes only a manual-canary recommendation', () => {
    const evaluator = new OfflineStrategyEvaluator();
    const result = evaluator.evaluate(input);
    const rollout = evaluator.recommendRollout(result, criteria);

    expect(result).toMatchObject({ candidateMatchBps: 10_000, baselineMatchBps: 7_500, baselineRegressionBps: 0, driftBps: 0, unsafeCaseCount: 0, outcome: 'PASS' });
    expect(rollout).toEqual({ candidateStrategyVersionId: 'strategy_candidate_2', recommendation: 'ELIGIBLE_FOR_MANUAL_CANARY', maxCanaryBps: 500, requiresExplicitApproval: true, allowDeployment: false, allowWorkerAction: false, reasonCodes: ['OFFLINE_GATE_PASSED'] });
  });

  it('holds rollout when quality/drift or policy safety criteria are violated', () => {
    const evaluator = new OfflineStrategyEvaluator();
    const unsafe = evaluator.evaluate({ ...input, cases: input.cases.map((evaluationCase, index) => {
      if (index === 0) return { ...evaluationCase, proposedCandidate: 'PROXY_ROTATION' as const };
      if (index === 1) return { ...evaluationCase, proposedCandidate: 'PROXY_ROTATION' as const, policy: { ...safePolicy, promptGuarded: false } };
      return evaluationCase;
    }) });
    const rollout = evaluator.recommendRollout(unsafe, criteria);

    expect(unsafe.outcome).toBe('HOLD');
    expect(unsafe.holdReasons).toEqual(expect.arrayContaining(['CANDIDATE_MATCH_BELOW_MINIMUM', 'DRIFT_LIMIT_EXCEEDED', 'UNSAFE_POLICY_CASE']));
    expect(rollout).toMatchObject({ recommendation: 'HOLD', maxCanaryBps: 0, allowDeployment: false, allowWorkerAction: false });
  });

  it('rejects duplicate cases, identical candidate/baseline ids and malformed criteria fail-closed', () => {
    const evaluator = new OfflineStrategyEvaluator();
    expect(() => evaluator.evaluate({ ...input, candidateStrategyVersionId: input.baselineStrategyVersionId })).toThrow(OfflineEvaluationError);
    expect(() => evaluator.evaluate({ ...input, cases: [input.cases[0]!, input.cases[0]! ] })).toThrowError(expect.objectContaining({ code: 'OFFLINE_EVALUATION_INVALID' }));
    expect(() => evaluator.recommendRollout(evaluator.evaluate(input), { ...criteria, requestedCanaryBps: 10_001 })).toThrow(OfflineEvaluationError);
  });
});
