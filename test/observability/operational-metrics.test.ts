import { describe, expect, it } from 'vitest';

import { OperationalMetricsError, OperationalMetricsRegistry } from '../../src/observability/operational-metrics.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const at = '2026-08-27T00:00:00.000Z';

describe('platform, target, worker, extraction and quality operational metrics', () => {
  it('aggregates closed-vocabulary component metrics and quality score deterministically per scope', () => {
    const registry = new OperationalMetricsRegistry();
    registry.record(scope, { category: 'PLATFORM', metric: 'REQUEST', outcome: 'SUCCESS', occurredAt: at });
    registry.record(scope, { category: 'PLATFORM', metric: 'REQUEST', outcome: 'BLOCKED', occurredAt: at });
    registry.record(scope, { category: 'TARGET', metric: 'ACCESS_DECISION', outcome: 'ALLOWED', occurredAt: at });
    registry.record(scope, { category: 'WORKER', metric: 'TASK', outcome: 'SUCCEEDED', occurredAt: at });
    registry.record(scope, { category: 'EXTRACTION', metric: 'RECORDS', outcome: 'PARTIAL', recordCount: 12, occurredAt: at });
    registry.record(scope, { category: 'QUALITY', metric: 'EVALUATION', outcome: 'PARTIAL', scoreBasisPoints: 7500, occurredAt: at });
    registry.record(scope, { category: 'QUALITY', metric: 'EVALUATION', outcome: 'VALID', scoreBasisPoints: 9500, occurredAt: at });

    expect(registry.snapshot(scope)).toMatchObject({ counters: { platformRequestsTotal: 2, platformRequestBlocksTotal: 1, targetAccessAllowedTotal: 1, workerTasksSucceededTotal: 1, extractionRecordsTotal: 12, extractionPartialTotal: 1, qualityEvaluationsTotal: 2, qualityPartialTotal: 1, qualityValidTotal: 1 }, quality: { averageScoreBasisPoints: 8500 } });
  });

  it('isolates numeric aggregates by tenant/project without retaining raw operational payloads', () => {
    const registry = new OperationalMetricsRegistry();
    registry.record(scope, { category: 'WORKER', metric: 'TASK', outcome: 'FAILED', occurredAt: at });
    registry.record({ tenantId: 'tenant_2', projectId: 'project_1' }, { category: 'WORKER', metric: 'TASK', outcome: 'SUCCEEDED', occurredAt: at });

    const left = registry.snapshot(scope);
    const right = registry.snapshot({ tenantId: 'tenant_2', projectId: 'project_1' });
    expect(left.counters.workerTasksFailedTotal).toBe(1);
    expect(left.counters.workerTasksSucceededTotal).toBe(0);
    expect(right.counters.workerTasksSucceededTotal).toBe(1);
    expect(JSON.stringify(left)).not.toContain('payload');
  });

  it('rejects arbitrary metrics, malformed scope/time and out-of-bound numeric values fail-closed', () => {
    const registry = new OperationalMetricsRegistry();
    expect(() => registry.record(scope, { category: 'PLATFORM', metric: 'LATENCY' as never, outcome: 'SUCCESS', occurredAt: at })).toThrow(OperationalMetricsError);
    expect(() => registry.record({ tenantId: 'bad id', projectId: 'project_1' }, { category: 'WORKER', metric: 'TASK', outcome: 'FAILED', occurredAt: at })).toThrow(OperationalMetricsError);
    expect(() => registry.record(scope, { category: 'EXTRACTION', metric: 'RECORDS', outcome: 'SUCCESS', recordCount: 100_001, occurredAt: at })).toThrow(OperationalMetricsError);
    expect(() => registry.record(scope, { category: 'QUALITY', metric: 'EVALUATION', outcome: 'VALID', scoreBasisPoints: 10_001, occurredAt: 'bad-time' })).toThrow(OperationalMetricsError);
  });
});
