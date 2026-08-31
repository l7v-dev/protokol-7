import { describe, expect, it } from 'vitest';

import { AlertingError, AlertRuleEvaluator } from '../../src/observability/alerting.js';
import { OPERATIONAL_METRICS_CONTRACT_VERSION, type OperationalMetricSnapshot } from '../../src/observability/operational-metrics.js';

const at = '2026-08-27T00:00:00.000Z';

function snapshot(overrides: Partial<OperationalMetricSnapshot['counters']> = {}, quality = { averageScoreBasisPoints: 10_000 }): OperationalMetricSnapshot {
  return {
    contractVersion: OPERATIONAL_METRICS_CONTRACT_VERSION,
    scope: { tenantId: 'tenant_1', projectId: 'project_1' },
    counters: {
      platformRequestsTotal: 0, platformRequestFailuresTotal: 0, platformRequestBlocksTotal: 0,
      targetAccessAllowedTotal: 0, targetAccessBlockedTotal: 0,
      workerTasksStartedTotal: 0, workerTasksSucceededTotal: 0, workerTasksFailedTotal: 0, workerTasksCancelledTotal: 0,
      extractionRecordsTotal: 0, extractionPartialTotal: 0, extractionFailuresTotal: 0,
      qualityEvaluationsTotal: 0, qualityValidTotal: 0, qualityPartialTotal: 0, qualityInvalidTotal: 0,
      ...overrides
    },
    quality
  };
}

describe('bounded non-dispatching alert rules', () => {
  it('creates deterministic threshold decisions with closed severity, on-call route and runbook identifiers', () => {
    const decisions = new AlertRuleEvaluator().evaluate(snapshot({ platformRequestsTotal: 20, platformRequestFailuresTotal: 5, targetAccessAllowedTotal: 5, targetAccessBlockedTotal: 5, workerTasksSucceededTotal: 4, workerTasksFailedTotal: 1, extractionFailuresTotal: 5, qualityEvaluationsTotal: 10 }, { averageScoreBasisPoints: 6900 }), at);

    expect(decisions.filter((decision) => decision.triggered).map((decision) => [decision.ruleId, decision.severity, decision.onCallRoute, decision.runbookId])).toEqual([
      ['PLATFORM_FAILURE_RATE_HIGH', 'CRITICAL', 'PLATFORM_PRIMARY', 'platform-reliability-v1'],
      ['TARGET_POLICY_BLOCK_RATE_HIGH', 'WARNING', 'SECURITY_POLICY', 'target-policy-v1'],
      ['WORKER_FAILURE_RATE_HIGH', 'CRITICAL', 'WORKER_PRIMARY', 'worker-recovery-v1'],
      ['EXTRACTION_FAILURE_COUNT_HIGH', 'WARNING', 'DATA_QUALITY', 'extraction-quality-v1'],
      ['QUALITY_SCORE_DEGRADED', 'WARNING', 'DATA_QUALITY', 'extraction-quality-v1']
    ]);
    expect(decisions[0]?.evidence).toEqual({ numerator: 5, denominator: 20, observedBasisPoints: 2500, thresholdBasisPoints: 2000, minimumSampleSize: 10 });
  });

  it('suppresses low-sample and under-threshold decisions to reduce deterministic alert noise', () => {
    const decisions = new AlertRuleEvaluator().evaluate(snapshot({ platformRequestsTotal: 9, platformRequestFailuresTotal: 9, targetAccessAllowedTotal: 9, targetAccessBlockedTotal: 0, workerTasksSucceededTotal: 5, workerTasksFailedTotal: 0, extractionFailuresTotal: 4, qualityEvaluationsTotal: 9 }, { averageScoreBasisPoints: 0 }), at);

    expect(decisions.every((decision) => !decision.triggered)).toBe(true);
  });

  it('rejects malformed metrics snapshots and evaluation times fail-closed without accepting arbitrary routes or contacts', () => {
    const evaluator = new AlertRuleEvaluator();
    expect(() => evaluator.evaluate({ ...snapshot(), contractVersion: 'other/v1' as never }, at)).toThrow(AlertingError);
    expect(() => evaluator.evaluate({ ...snapshot(), scope: { tenantId: 'bad tenant', projectId: 'project_1' } }, at)).toThrow(AlertingError);
    expect(() => evaluator.evaluate(snapshot({ platformRequestsTotal: -1 }), at)).toThrow(AlertingError);
    expect(() => evaluator.evaluate(snapshot(), 'bad-time')).toThrow(AlertingError);
  });
});
