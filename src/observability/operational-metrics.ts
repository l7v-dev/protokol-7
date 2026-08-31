export const OPERATIONAL_METRICS_CONTRACT_VERSION = 'operational-metrics/v1' as const;

export type OperationalMetricScope = {
  tenantId: string;
  projectId: string;
};

export type OperationalMetricEvent =
  | { category: 'PLATFORM'; metric: 'REQUEST'; outcome: 'SUCCESS' | 'FAILURE' | 'BLOCKED'; occurredAt: string }
  | { category: 'TARGET'; metric: 'ACCESS_DECISION'; outcome: 'ALLOWED' | 'BLOCKED'; occurredAt: string }
  | { category: 'WORKER'; metric: 'TASK'; outcome: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'; occurredAt: string }
  | { category: 'EXTRACTION'; metric: 'RECORDS'; recordCount: number; outcome: 'SUCCESS' | 'PARTIAL' | 'FAILURE'; occurredAt: string }
  | { category: 'QUALITY'; metric: 'EVALUATION'; scoreBasisPoints: number; outcome: 'VALID' | 'PARTIAL' | 'INVALID'; occurredAt: string };

export type OperationalMetricSnapshot = {
  contractVersion: typeof OPERATIONAL_METRICS_CONTRACT_VERSION;
  scope: OperationalMetricScope;
  counters: {
    platformRequestsTotal: number;
    platformRequestFailuresTotal: number;
    platformRequestBlocksTotal: number;
    targetAccessAllowedTotal: number;
    targetAccessBlockedTotal: number;
    workerTasksStartedTotal: number;
    workerTasksSucceededTotal: number;
    workerTasksFailedTotal: number;
    workerTasksCancelledTotal: number;
    extractionRecordsTotal: number;
    extractionPartialTotal: number;
    extractionFailuresTotal: number;
    qualityEvaluationsTotal: number;
    qualityValidTotal: number;
    qualityPartialTotal: number;
    qualityInvalidTotal: number;
  };
  quality: {
    averageScoreBasisPoints: number;
  };
};

export class OperationalMetricsError extends Error {
  public constructor(public readonly code: 'OPERATIONAL_METRICS_INVALID' | 'OPERATIONAL_METRICS_OVERFLOW', message: string) {
    super(message);
    this.name = 'OperationalMetricsError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_RECORDS_PER_EVENT = 100_000;
const MAX_COUNTER = Number.MAX_SAFE_INTEGER - MAX_RECORDS_PER_EVENT;

type StoredMetrics = OperationalMetricSnapshot['counters'] & { qualityScoreTotalBasisPoints: number };

/**
 * Process-local metrics reference. It aggregates only closed-vocabulary
 * numeric outcomes per tenant/project and never accepts arbitrary labels or
 * raw request, target, record, worker, credential, payload, or error content.
 */
export class OperationalMetricsRegistry {
  private readonly metricsByScope = new Map<string, StoredMetrics>();

  public record(scope: OperationalMetricScope, event: OperationalMetricEvent): void {
    validateScope(scope);
    validateEvent(event);
    const metrics = this.metricsByScope.get(scopeKey(scope)) ?? emptyMetrics();
    apply(metrics, event);
    this.metricsByScope.set(scopeKey(scope), metrics);
  }

  public snapshot(scope: OperationalMetricScope): OperationalMetricSnapshot {
    validateScope(scope);
    const metrics = this.metricsByScope.get(scopeKey(scope)) ?? emptyMetrics();
    const { qualityScoreTotalBasisPoints, ...counters } = metrics;
    return {
      contractVersion: OPERATIONAL_METRICS_CONTRACT_VERSION,
      scope: { ...scope },
      counters: { ...counters },
      quality: {
        averageScoreBasisPoints: counters.qualityEvaluationsTotal === 0 ? 0 : Math.round(qualityScoreTotalBasisPoints / counters.qualityEvaluationsTotal)
      }
    };
  }
}

function apply(metrics: StoredMetrics, event: OperationalMetricEvent): void {
  if (event.category === 'PLATFORM') {
    increment(metrics, 'platformRequestsTotal');
    if (event.outcome === 'FAILURE') increment(metrics, 'platformRequestFailuresTotal');
    if (event.outcome === 'BLOCKED') increment(metrics, 'platformRequestBlocksTotal');
    return;
  }
  if (event.category === 'TARGET') {
    increment(metrics, event.outcome === 'ALLOWED' ? 'targetAccessAllowedTotal' : 'targetAccessBlockedTotal');
    return;
  }
  if (event.category === 'WORKER') {
    const key = event.outcome === 'STARTED' ? 'workerTasksStartedTotal'
      : event.outcome === 'SUCCEEDED' ? 'workerTasksSucceededTotal'
        : event.outcome === 'FAILED' ? 'workerTasksFailedTotal' : 'workerTasksCancelledTotal';
    increment(metrics, key);
    return;
  }
  if (event.category === 'EXTRACTION') {
    increment(metrics, 'extractionRecordsTotal', event.recordCount);
    if (event.outcome === 'PARTIAL') increment(metrics, 'extractionPartialTotal');
    if (event.outcome === 'FAILURE') increment(metrics, 'extractionFailuresTotal');
    return;
  }
  increment(metrics, 'qualityEvaluationsTotal');
  metrics.qualityScoreTotalBasisPoints = sum(metrics.qualityScoreTotalBasisPoints, event.scoreBasisPoints);
  if (event.outcome === 'VALID') increment(metrics, 'qualityValidTotal');
  if (event.outcome === 'PARTIAL') increment(metrics, 'qualityPartialTotal');
  if (event.outcome === 'INVALID') increment(metrics, 'qualityInvalidTotal');
}

function increment(metrics: StoredMetrics, key: keyof OperationalMetricSnapshot['counters'], amount = 1): void {
  metrics[key] = sum(metrics[key], amount);
}

function sum(left: number, right: number): number {
  if (left > MAX_COUNTER - right) throw new OperationalMetricsError('OPERATIONAL_METRICS_OVERFLOW', 'Operational metric sayacı güvenli limiti aşıyor.');
  return left + right;
}

function validateScope(scope: OperationalMetricScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.projectId)) throw invalid();
}

function validateEvent(event: OperationalMetricEvent): void {
  if (!Number.isFinite(Date.parse(event.occurredAt))) throw invalid();
  if (event.category === 'PLATFORM' && (event.metric !== 'REQUEST' || !['SUCCESS', 'FAILURE', 'BLOCKED'].includes(event.outcome))) throw invalid();
  if (event.category === 'TARGET' && (event.metric !== 'ACCESS_DECISION' || !['ALLOWED', 'BLOCKED'].includes(event.outcome))) throw invalid();
  if (event.category === 'WORKER' && (event.metric !== 'TASK' || !['STARTED', 'SUCCEEDED', 'FAILED', 'CANCELLED'].includes(event.outcome))) throw invalid();
  if (event.category === 'EXTRACTION' && (event.metric !== 'RECORDS' || !['SUCCESS', 'PARTIAL', 'FAILURE'].includes(event.outcome) || !Number.isInteger(event.recordCount) || event.recordCount < 0 || event.recordCount > MAX_RECORDS_PER_EVENT)) throw invalid();
  if (event.category === 'QUALITY' && (event.metric !== 'EVALUATION' || !['VALID', 'PARTIAL', 'INVALID'].includes(event.outcome) || !Number.isInteger(event.scoreBasisPoints) || event.scoreBasisPoints < 0 || event.scoreBasisPoints > 10_000)) throw invalid();
}

function scopeKey(scope: OperationalMetricScope): string {
  return `${scope.tenantId}:${scope.projectId}`;
}

function emptyMetrics(): StoredMetrics {
  return {
    platformRequestsTotal: 0, platformRequestFailuresTotal: 0, platformRequestBlocksTotal: 0,
    targetAccessAllowedTotal: 0, targetAccessBlockedTotal: 0,
    workerTasksStartedTotal: 0, workerTasksSucceededTotal: 0, workerTasksFailedTotal: 0, workerTasksCancelledTotal: 0,
    extractionRecordsTotal: 0, extractionPartialTotal: 0, extractionFailuresTotal: 0,
    qualityEvaluationsTotal: 0, qualityValidTotal: 0, qualityPartialTotal: 0, qualityInvalidTotal: 0,
    qualityScoreTotalBasisPoints: 0
  };
}

function invalid(): OperationalMetricsError {
  return new OperationalMetricsError('OPERATIONAL_METRICS_INVALID', 'Operational metric event geçerli değil.');
}
