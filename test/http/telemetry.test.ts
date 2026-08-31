import { describe, expect, it } from 'vitest';

import { MetricsRegistry } from '../../src/shared/metrics.js';
import { ReliabilityTelemetryCollector } from '../../src/http/telemetry.js';

describe('ReliabilityTelemetryCollector', () => {
  it('projects safe counters and recent events without raw unknown codes', () => {
    const metrics = new MetricsRegistry();
    const collector = new ReliabilityTelemetryCollector(
      metrics,
      10,
      () => new Date('2026-08-26T00:00:00.000Z')
    );

    collector.record({
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      targetId: 'target_1',
      strategy: 'HTTP',
      accessClass: 'SUCCESS',
      outcome: 'SUCCESS',
      code: 'HTTP_SUCCESS',
      durationMs: 3.4
    });
    collector.record({
      tenantId: 'tenant_1',
      strategy: 'HTTP',
      accessClass: 'SERVER_ERROR',
      outcome: 'FAILURE',
      code: 'authorization=secret-value'
    });
    collector.record({
      tenantId: 'tenant_1',
      strategy: 'HTTP',
      accessClass: 'TIMEOUT',
      outcome: 'RETRY_ALLOWED',
      code: 'HTTP_TIMEOUT',
      retryDelaySource: 'EXPONENTIAL_BACKOFF'
    });

    const snapshot = collector.snapshot();
    expect(snapshot.counters).toMatchObject({
      'reliability_events_total:HTTP:SUCCESS:SUCCESS': 1,
      'reliability_events_total:HTTP:FAILURE:SERVER_ERROR': 1,
      'reliability_events_total:HTTP:RETRY_ALLOWED:TIMEOUT': 1,
      'reliability_failures_total:HTTP:SERVER_ERROR': 1,
      'reliability_retries_total:HTTP:RETRY_ALLOWED': 1
    });
    expect(snapshot.recentEvents[0]).toMatchObject({
      tenantId: 'tenant_1',
      code: 'HTTP_SUCCESS',
      durationMs: 3,
      recordedAt: '2026-08-26T00:00:00.000Z'
    });
    expect(snapshot.recentEvents[1]).not.toHaveProperty('code');
  });

  it('projects escalation and circuit block counters with bounded recent events', () => {
    const metrics = new MetricsRegistry();
    const collector = new ReliabilityTelemetryCollector(metrics, 2);
    collector.record({
      tenantId: 'tenant_1',
      strategy: 'HTTP',
      accessClass: 'SERVER_ERROR',
      outcome: 'STRATEGY_ESCALATION',
      code: 'HTTP_SERVER_ERROR',
      escalationAction: 'ROTATE_PROXY'
    });
    collector.record({
      tenantId: 'tenant_1',
      strategy: 'HTTP',
      accessClass: 'DEPENDENCY_FAILURE',
      outcome: 'CIRCUIT_BLOCKED',
      code: 'RESOURCE_QUARANTINED'
    });
    collector.record({
      tenantId: 'tenant_1',
      strategy: 'HTTP',
      accessClass: 'TIMEOUT',
      outcome: 'ESCALATION_BUDGET_EXHAUSTED',
      code: 'ESCALATION_BUDGET_EXCEEDED',
      escalationAction: 'BUDGET_EXHAUSTED'
    });

    const snapshot = collector.snapshot();
    expect(snapshot.recentEvents).toHaveLength(2);
    expect(snapshot.counters).toMatchObject({
      'reliability_escalations_total:HTTP:ROTATE_PROXY': 1,
      'reliability_escalations_total:HTTP:BUDGET_EXHAUSTED': 1,
      'reliability_circuit_blocks_total:HTTP:DEPENDENCY_FAILURE': 1
    });
  });

  it('rejects invalid event and recent-event configuration', () => {
    const metrics = new MetricsRegistry();
    expect(() => new ReliabilityTelemetryCollector(metrics, 0)).toThrow('maxRecentEvents must be a positive integer.');
    const collector = new ReliabilityTelemetryCollector(metrics);
    expect(() => collector.record({
      tenantId: '',
      strategy: 'HTTP',
      accessClass: 'SUCCESS',
      outcome: 'SUCCESS'
    })).toThrow('Reliability event geçerli değil.');
    expect(() => collector.record({
      tenantId: 'tenant_1',
      strategy: 'HTTP',
      accessClass: 'SUCCESS',
      outcome: 'SUCCESS',
      durationMs: -1
    })).toThrow('Reliability event geçerli değil.');
  });
});
