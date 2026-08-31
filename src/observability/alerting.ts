import { OPERATIONAL_METRICS_CONTRACT_VERSION, type OperationalMetricSnapshot } from './operational-metrics.js';

export const ALERTING_CONTRACT_VERSION = 'alerting/v1' as const;

export type AlertRuleId =
  | 'PLATFORM_FAILURE_RATE_HIGH'
  | 'TARGET_POLICY_BLOCK_RATE_HIGH'
  | 'WORKER_FAILURE_RATE_HIGH'
  | 'EXTRACTION_FAILURE_COUNT_HIGH'
  | 'QUALITY_SCORE_DEGRADED';
export type AlertSeverity = 'WARNING' | 'CRITICAL';
export type OnCallRoute = 'PLATFORM_PRIMARY' | 'SECURITY_POLICY' | 'WORKER_PRIMARY' | 'DATA_QUALITY';
export type RunbookId = 'platform-reliability-v1' | 'target-policy-v1' | 'worker-recovery-v1' | 'extraction-quality-v1';

export type AlertDecision = {
  contractVersion: typeof ALERTING_CONTRACT_VERSION;
  ruleId: AlertRuleId;
  severity: AlertSeverity;
  onCallRoute: OnCallRoute;
  runbookId: RunbookId;
  evaluatedAt: string;
  scope: { tenantId: string; projectId: string };
  triggered: boolean;
  evidence: {
    numerator: number;
    denominator: number;
    observedBasisPoints: number;
    thresholdBasisPoints: number;
    minimumSampleSize: number;
  };
};

export class AlertingError extends Error {
  public constructor(public readonly code: 'ALERTING_INVALID', message: string) {
    super(message);
    this.name = 'AlertingError';
  }
}

type AlertRule = {
  ruleId: AlertRuleId;
  severity: AlertSeverity;
  onCallRoute: OnCallRoute;
  runbookId: RunbookId;
  thresholdBasisPoints: number;
  minimumSampleSize: number;
  evidence: (snapshot: OperationalMetricSnapshot) => { numerator: number; denominator: number };
};

const RULES: ReadonlyArray<AlertRule> = [
  {
    ruleId: 'PLATFORM_FAILURE_RATE_HIGH', severity: 'CRITICAL', onCallRoute: 'PLATFORM_PRIMARY', runbookId: 'platform-reliability-v1', thresholdBasisPoints: 2_000, minimumSampleSize: 10,
    evidence: (snapshot) => ({ numerator: snapshot.counters.platformRequestFailuresTotal, denominator: snapshot.counters.platformRequestsTotal })
  },
  {
    ruleId: 'TARGET_POLICY_BLOCK_RATE_HIGH', severity: 'WARNING', onCallRoute: 'SECURITY_POLICY', runbookId: 'target-policy-v1', thresholdBasisPoints: 5_000, minimumSampleSize: 10,
    evidence: (snapshot) => ({ numerator: snapshot.counters.targetAccessBlockedTotal, denominator: snapshot.counters.targetAccessAllowedTotal + snapshot.counters.targetAccessBlockedTotal })
  },
  {
    ruleId: 'WORKER_FAILURE_RATE_HIGH', severity: 'CRITICAL', onCallRoute: 'WORKER_PRIMARY', runbookId: 'worker-recovery-v1', thresholdBasisPoints: 2_000, minimumSampleSize: 5,
    evidence: (snapshot) => ({ numerator: snapshot.counters.workerTasksFailedTotal, denominator: snapshot.counters.workerTasksSucceededTotal + snapshot.counters.workerTasksFailedTotal + snapshot.counters.workerTasksCancelledTotal })
  },
  {
    ruleId: 'EXTRACTION_FAILURE_COUNT_HIGH', severity: 'WARNING', onCallRoute: 'DATA_QUALITY', runbookId: 'extraction-quality-v1', thresholdBasisPoints: 10_000, minimumSampleSize: 5,
    evidence: (snapshot) => ({ numerator: snapshot.counters.extractionFailuresTotal, denominator: snapshot.counters.extractionFailuresTotal })
  },
  {
    ruleId: 'QUALITY_SCORE_DEGRADED', severity: 'WARNING', onCallRoute: 'DATA_QUALITY', runbookId: 'extraction-quality-v1', thresholdBasisPoints: 7_000, minimumSampleSize: 10,
    evidence: (snapshot) => ({ numerator: snapshot.quality.averageScoreBasisPoints, denominator: snapshot.counters.qualityEvaluationsTotal })
  }
];

/**
 * Pure alert decision evaluator. It reads an already-safe P13-T03 aggregate,
 * emits no notification, persists no event and exposes only closed routing and
 * runbook identifiers rather than contacts, URLs, payloads or escalation actions.
 */
export class AlertRuleEvaluator {
  public evaluate(snapshot: OperationalMetricSnapshot, evaluatedAt: string): ReadonlyArray<AlertDecision> {
    validateSnapshot(snapshot);
    if (!Number.isFinite(Date.parse(evaluatedAt))) throw invalid();
    return RULES.map((rule) => decision(rule, snapshot, evaluatedAt));
  }
}

function decision(rule: AlertRule, snapshot: OperationalMetricSnapshot, evaluatedAt: string): AlertDecision {
  const { numerator, denominator } = rule.evidence(snapshot);
  const observedBasisPoints = rule.ruleId === 'QUALITY_SCORE_DEGRADED'
    ? numerator
    : denominator === 0 ? 0 : Math.floor((numerator * 10_000) / denominator);
  const triggered = rule.ruleId === 'QUALITY_SCORE_DEGRADED'
    ? denominator >= rule.minimumSampleSize && observedBasisPoints <= rule.thresholdBasisPoints
    : denominator >= rule.minimumSampleSize && observedBasisPoints >= rule.thresholdBasisPoints;
  return {
    contractVersion: ALERTING_CONTRACT_VERSION,
    ruleId: rule.ruleId,
    severity: rule.severity,
    onCallRoute: rule.onCallRoute,
    runbookId: rule.runbookId,
    evaluatedAt,
    scope: { ...snapshot.scope },
    triggered,
    evidence: { numerator, denominator, observedBasisPoints, thresholdBasisPoints: rule.thresholdBasisPoints, minimumSampleSize: rule.minimumSampleSize }
  };
}

function validateSnapshot(snapshot: OperationalMetricSnapshot): void {
  if (snapshot.contractVersion !== OPERATIONAL_METRICS_CONTRACT_VERSION
    || !safeId(snapshot.scope.tenantId)
    || !safeId(snapshot.scope.projectId)
    || !Number.isInteger(snapshot.quality.averageScoreBasisPoints)
    || snapshot.quality.averageScoreBasisPoints < 0
    || snapshot.quality.averageScoreBasisPoints > 10_000
    || Object.values(snapshot.counters).some((value) => !Number.isSafeInteger(value) || value < 0)) throw invalid();
}

function safeId(value: string): boolean {
  return /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function invalid(): AlertingError {
  return new AlertingError('ALERTING_INVALID', 'Alert evaluation input geçerli değil.');
}
