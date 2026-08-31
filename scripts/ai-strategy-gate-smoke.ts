import assert from 'node:assert/strict';

import { OfflineStrategyEvaluator, OFFLINE_STRATEGY_EVALUATION_VERSION } from '../src/strategy/offline-evaluation.js';

const safePolicy = { analyzerAllowed: true, promptGuarded: true, aiBudgetEnabled: true };
const criteria = { minCandidateMatchBps: 7_500, maxBaselineRegressionBps: 1_000, maxDriftBps: 2_500, requestedCanaryBps: 500 };

async function main(): Promise<void> {
  const evaluator = new OfflineStrategyEvaluator();
  const checks: Record<string, boolean> = {};
  const passResult = evaluator.evaluate({
    contractVersion: OFFLINE_STRATEGY_EVALUATION_VERSION,
    evaluationSetId: 'm10_offline_fixture_baseline',
    candidateStrategyVersionId: 'strategy_candidate_v2',
    baselineStrategyVersionId: 'strategy_baseline_v1',
    criteria,
    cases: [
      { caseId: 'case_http', expectedCandidate: 'HTTP_DIRECT', baselineCandidate: 'HTTP_DIRECT', proposedCandidate: 'HTTP_DIRECT', policy: safePolicy },
      { caseId: 'case_browser', expectedCandidate: 'BROWSER_RENDER', baselineCandidate: 'HTTP_DIRECT', proposedCandidate: 'BROWSER_RENDER', policy: safePolicy },
      { caseId: 'case_rotation', expectedCandidate: 'PROXY_ROTATION', baselineCandidate: 'PROXY_ROTATION', proposedCandidate: 'PROXY_ROTATION', policy: safePolicy },
      { caseId: 'case_terminal', expectedCandidate: 'NONE', baselineCandidate: 'NONE', proposedCandidate: 'NONE', policy: safePolicy }
    ]
  });
  assert.equal(passResult.outcome, 'PASS');
  assert.equal(passResult.candidateMatchBps, 10_000);
  assert.equal(passResult.baselineMatchBps, 7_500);
  checks.deterministicBaselineComparison = true;

  const recommendation = evaluator.recommendRollout(passResult, criteria);
  assert.equal(recommendation.recommendation, 'ELIGIBLE_FOR_MANUAL_CANARY');
  assert.equal(recommendation.maxCanaryBps, 500);
  assert.equal(recommendation.requiresExplicitApproval, true);
  assert.equal(recommendation.allowDeployment, false);
  assert.equal(recommendation.allowWorkerAction, false);
  checks.manualOnlyCanaryRecommendation = true;

  const holdResult = evaluator.evaluate({
    contractVersion: OFFLINE_STRATEGY_EVALUATION_VERSION,
    evaluationSetId: 'm10_offline_fixture_unsafe',
    candidateStrategyVersionId: 'strategy_candidate_v3',
    baselineStrategyVersionId: 'strategy_baseline_v1',
    criteria,
    cases: [
      { caseId: 'case_policy_1', expectedCandidate: 'NONE', baselineCandidate: 'NONE', proposedCandidate: 'BROWSER_RENDER', policy: { ...safePolicy, analyzerAllowed: false } },
      { caseId: 'case_policy_2', expectedCandidate: 'HTTP_DIRECT', baselineCandidate: 'HTTP_DIRECT', proposedCandidate: 'HTTP_DIRECT', policy: safePolicy },
      { caseId: 'case_policy_3', expectedCandidate: 'NONE', baselineCandidate: 'NONE', proposedCandidate: 'NONE', policy: safePolicy },
      { caseId: 'case_policy_4', expectedCandidate: 'HTTP_DIRECT', baselineCandidate: 'HTTP_DIRECT', proposedCandidate: 'HTTP_DIRECT', policy: safePolicy }
    ]
  });
  assert.equal(holdResult.outcome, 'HOLD');
  assert.ok(holdResult.holdReasons.includes('UNSAFE_POLICY_CASE'));
  assert.equal(evaluator.recommendRollout(holdResult, criteria).recommendation, 'HOLD');
  checks.unsafePolicyHoldsRollout = true;

  console.log(JSON.stringify({
    gate: 'P10-T08',
    status: 'PASS',
    checks,
    baselineMatchBps: passResult.baselineMatchBps,
    candidateMatchBps: passResult.candidateMatchBps,
    requestedManualCanaryBps: recommendation.maxCanaryBps,
    note: 'deterministic offline fixture contract smoke; no target/model/provider invocation, deployment, queue, worker, network, DB or provider side effects'
  }, null, 2));
}

await main();
