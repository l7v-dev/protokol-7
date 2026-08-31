import { describe, expect, it } from 'vitest';

import { MultiSourceMeteringError, projectMultiSourceUsage } from '../../src/finops/metering.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };
const base = { meterId: 'meter_1', scope, observedAt: '2026-08-27T00:00:00.000Z', measurements: { httpRequests: 3, browserRuntimeSeconds: 120, proxyRequests: 2, proxyBytes: 1024 ** 3, aiInputTokens: 10, aiOutputTokens: 20, storageGigabyteMonths: 1.5, computeSeconds: 90 } };

describe('secret-safe multi-source usage metering projection', () => {
  it('deterministically projects HTTP, browser, proxy, AI, storage and compute measurements into fixed usage categories', () => {
    const projection = projectMultiSourceUsage(base);

    expect(projection.usageEvents.map((event) => [event.category, event.unit, event.quantity])).toEqual([
      ['HTTP_REQUEST', 'request', 3], ['BROWSER_MINUTE', 'minute', 2], ['PROXY_REQUEST', 'request', 2], ['PROXY_GB', 'GB', 1],
      ['AI_INPUT_TOKEN', 'token', 10], ['AI_OUTPUT_TOKEN', 'token', 20], ['STORAGE_GB_MONTH', 'GB-month', 1.5], ['COMPUTE_SECOND', 'second', 90]
    ]);
    expect(projection.usageEvents.every((event) => event.scope.tenantId === 'tenant_1' && event.occurredAt === base.observedAt)).toBe(true);
  });

  it('omits zero-value sources without adding arbitrary metadata or collecting runtime details', () => {
    const projection = projectMultiSourceUsage({ ...base, measurements: { ...base.measurements, httpRequests: 0, proxyBytes: 0, aiOutputTokens: 0 } });
    const serialized = JSON.stringify(projection);
    expect(projection.usageEvents.map((event) => event.category)).not.toContain('HTTP_REQUEST');
    expect(projection.usageEvents.map((event) => event.category)).not.toContain('PROXY_GB');
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('payload');
  });

  it('rejects malformed scope/time, negative/non-finite values and oversized measurements fail-closed', () => {
    expect(() => projectMultiSourceUsage({ ...base, meterId: 'bad meter' })).toThrow(MultiSourceMeteringError);
    expect(() => projectMultiSourceUsage({ ...base, observedAt: 'bad-time' })).toThrow(MultiSourceMeteringError);
    expect(() => projectMultiSourceUsage({ ...base, measurements: { ...base.measurements, computeSeconds: -1 } })).toThrow(MultiSourceMeteringError);
    expect(() => projectMultiSourceUsage({ ...base, measurements: { ...base.measurements, proxyBytes: Number.POSITIVE_INFINITY } })).toThrow(MultiSourceMeteringError);
    expect(() => projectMultiSourceUsage({ ...base, measurements: { ...base.measurements, httpRequests: 10_000_001 } })).toThrow(MultiSourceMeteringError);
  });
});
