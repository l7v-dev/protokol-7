import { createHash } from 'node:crypto';

import type { StrategyCandidate } from './strategy-rules.js';

export const OFFLINE_STRATEGY_EVALUATION_VERSION = 'offline-strategy-evaluation/v1' as const;

export type OfflineStrategyCase = {
  caseId: string;
  expectedCandidate: StrategyCandidate;
  baselineCandidate: StrategyCandidate;
  proposedCandidate: StrategyCandidate;
  policy: {
    analyzerAllowed: boolean;
    promptGuarded: boolean;
    aiBudgetEnabled: boolean;
  };
};

export type OfflineEvaluationCriteria = {
  minCandidateMatchBps: number;
  maxBaselineRegressionBps: number;
  maxDriftBps: number;
  requestedCanaryBps: number;
};

export type OfflineEvaluationInput = {
  contractVersion: typeof OFFLINE_STRATEGY_EVALUATION_VERSION;
  evaluationSetId: string;
  candidateStrategyVersionId: string;
  baselineStrategyVersionId: string;
  cases: ReadonlyArray<OfflineStrategyCase>;
  criteria: OfflineEvaluationCriteria;
};

export type OfflineEvaluationResult = {
  contractVersion: typeof OFFLINE_STRATEGY_EVALUATION_VERSION;
  evaluationSetId: string;
  candidateStrategyVersionId: string;
  baselineStrategyVersionId: string;
  caseCount: number;
  candidateMatchBps: number;
  baselineMatchBps: number;
  baselineRegressionBps: number;
  driftBps: number;
  driftedCaseCount: number;
  unsafeCaseCount: number;
  outcome: 'PASS' | 'HOLD';
  holdReasons: ReadonlyArray<'CANDIDATE_MATCH_BELOW_MINIMUM' | 'BASELINE_REGRESSION_EXCEEDED' | 'DRIFT_LIMIT_EXCEEDED' | 'UNSAFE_POLICY_CASE'>;
  evaluationFingerprintSha256: string;
};

export type ControlledRolloutRecommendation = {
  candidateStrategyVersionId: string;
  recommendation: 'ELIGIBLE_FOR_MANUAL_CANARY' | 'HOLD';
  maxCanaryBps: number;
  requiresExplicitApproval: true;
  allowDeployment: false;
  allowWorkerAction: false;
  reasonCodes: ReadonlyArray<OfflineEvaluationResult['holdReasons'][number] | 'OFFLINE_GATE_PASSED'>;
};

export class OfflineEvaluationError extends Error {
  public constructor(public readonly code: 'OFFLINE_EVALUATION_INVALID', message: string) {
    super(message);
    this.name = 'OfflineEvaluationError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_CASES = 2_000;

/**
 * Pure offline evaluation and rollout recommendation contract. It executes no
 * target/model calls and never deploys, publishes, dispatches, retries or changes policy.
 */
export class OfflineStrategyEvaluator {
  public evaluate(input: OfflineEvaluationInput): OfflineEvaluationResult {
    validateInput(input);
    const candidateMatches = input.cases.filter((evaluationCase) => evaluationCase.proposedCandidate === evaluationCase.expectedCandidate).length;
    const baselineMatches = input.cases.filter((evaluationCase) => evaluationCase.baselineCandidate === evaluationCase.expectedCandidate).length;
    const driftedCaseCount = input.cases.filter((evaluationCase) => evaluationCase.proposedCandidate !== evaluationCase.expectedCandidate).length;
    const unsafeCaseCount = input.cases.filter((evaluationCase) => evaluationCase.proposedCandidate !== 'NONE' && (!evaluationCase.policy.analyzerAllowed || !evaluationCase.policy.promptGuarded || !evaluationCase.policy.aiBudgetEnabled)).length;
    const candidateMatchBps = asBps(candidateMatches, input.cases.length);
    const baselineMatchBps = asBps(baselineMatches, input.cases.length);
    const baselineRegressionBps = Math.max(baselineMatchBps - candidateMatchBps, 0);
    const driftBps = asBps(driftedCaseCount, input.cases.length);
    const holdReasons: OfflineEvaluationResult['holdReasons'][number][] = [];
    if (candidateMatchBps < input.criteria.minCandidateMatchBps) holdReasons.push('CANDIDATE_MATCH_BELOW_MINIMUM');
    if (baselineRegressionBps > input.criteria.maxBaselineRegressionBps) holdReasons.push('BASELINE_REGRESSION_EXCEEDED');
    if (driftBps > input.criteria.maxDriftBps) holdReasons.push('DRIFT_LIMIT_EXCEEDED');
    if (unsafeCaseCount > 0) holdReasons.push('UNSAFE_POLICY_CASE');
    return {
      contractVersion: OFFLINE_STRATEGY_EVALUATION_VERSION,
      evaluationSetId: input.evaluationSetId,
      candidateStrategyVersionId: input.candidateStrategyVersionId,
      baselineStrategyVersionId: input.baselineStrategyVersionId,
      caseCount: input.cases.length,
      candidateMatchBps,
      baselineMatchBps,
      baselineRegressionBps,
      driftBps,
      driftedCaseCount,
      unsafeCaseCount,
      outcome: holdReasons.length === 0 ? 'PASS' : 'HOLD',
      holdReasons,
      evaluationFingerprintSha256: createHash('sha256').update(JSON.stringify(input)).digest('hex')
    };
  }

  public recommendRollout(result: OfflineEvaluationResult, criteria: OfflineEvaluationCriteria): ControlledRolloutRecommendation {
    validateCriteria(criteria);
    if (result.contractVersion !== OFFLINE_STRATEGY_EVALUATION_VERSION || !SAFE_ID.test(result.candidateStrategyVersionId)) throw invalid();
    const pass = result.outcome === 'PASS' && result.holdReasons.length === 0;
    return {
      candidateStrategyVersionId: result.candidateStrategyVersionId,
      recommendation: pass ? 'ELIGIBLE_FOR_MANUAL_CANARY' : 'HOLD',
      maxCanaryBps: pass ? criteria.requestedCanaryBps : 0,
      requiresExplicitApproval: true,
      allowDeployment: false,
      allowWorkerAction: false,
      reasonCodes: pass ? ['OFFLINE_GATE_PASSED'] : [...result.holdReasons]
    };
  }
}

function validateInput(input: OfflineEvaluationInput): void {
  if (input.contractVersion !== OFFLINE_STRATEGY_EVALUATION_VERSION || !SAFE_ID.test(input.evaluationSetId)
    || !SAFE_ID.test(input.candidateStrategyVersionId) || !SAFE_ID.test(input.baselineStrategyVersionId)
    || input.candidateStrategyVersionId === input.baselineStrategyVersionId
    || input.cases.length < 1 || input.cases.length > MAX_CASES || new Set(input.cases.map((evaluationCase) => evaluationCase.caseId)).size !== input.cases.length) throw invalid();
  validateCriteria(input.criteria);
  for (const evaluationCase of input.cases) {
    if (!SAFE_ID.test(evaluationCase.caseId) || !isCandidate(evaluationCase.expectedCandidate) || !isCandidate(evaluationCase.baselineCandidate) || !isCandidate(evaluationCase.proposedCandidate)) throw invalid();
  }
}

function validateCriteria(criteria: OfflineEvaluationCriteria): void {
  if (![criteria.minCandidateMatchBps, criteria.maxBaselineRegressionBps, criteria.maxDriftBps, criteria.requestedCanaryBps].every((value) => Number.isInteger(value) && value >= 0 && value <= 10_000)) throw invalid();
}

function isCandidate(value: string): value is StrategyCandidate {
  return ['HTTP_DIRECT', 'BROWSER_RENDER', 'PROXY_ROTATION', 'NONE'].includes(value);
}

function asBps(numerator: number, denominator: number): number {
  return Math.round((numerator * 10_000) / denominator);
}

function invalid(): OfflineEvaluationError {
  return new OfflineEvaluationError('OFFLINE_EVALUATION_INVALID', 'Offline strategy evaluation input geçerli değil.');
}
