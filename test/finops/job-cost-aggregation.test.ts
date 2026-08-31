import { describe, expect, it } from 'vitest';

import { aggregateJobCost, JobCostAggregationError } from '../../src/finops/job-cost-aggregation.js';
import { RetryFallbackAllocationRegistry } from '../../src/finops/retry-fallback-allocation.js';
import { UsageEventRegistry } from '../../src/finops/usage-events.js';

const usageScope = { tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_2' };
const scope = { tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1' };
const usageRegistry = new UsageEventRegistry();
const allocationRegistry = new RetryFallbackAllocationRegistry();
function rated(category: 'HTTP_REQUEST' | 'BROWSER_MINUTE', kind: 'PRIMARY' | 'RETRY' | 'FALLBACK_BROWSER', quantity: number, unitPriceMicros: number, id: string) {
  const event = usageRegistry.record({ scope: usageScope, usageId: `usage_${id}`, idempotencyKey: `usage_${id}`, category, unit: category === 'HTTP_REQUEST' ? 'request' : 'minute', quantity, occurredAt: '2026-08-27T00:00:00.000Z' });
  const allocation = allocationRegistry.allocate({ allocationId: `allocation_${id}`, rootAttemptId: 'attempt_1', allocationKind: kind, usageEvent: event });
  return { allocation, rate: { tariffId: 'tariff_1', currency: 'USD' as const, category, unit: event.unit, unitPriceMicros, tariffFingerprintSha256: 'a'.repeat(64) } };
}

describe('deterministic job cost aggregation and cost per record', () => {
  it('aggregates rated primary/retry/fallback evidence into explicit category and bucket totals', () => {
    const result = aggregateJobCost({ scope, publishedRecordCount: 4, ratedUsage: [rated('HTTP_REQUEST', 'PRIMARY', 3, 100, 'primary'), rated('HTTP_REQUEST', 'RETRY', 1, 100, 'retry'), rated('BROWSER_MINUTE', 'FALLBACK_BROWSER', 2, 50, 'fallback')] });

    expect(result).toMatchObject({ currency: 'USD', ratedUsageCount: 3, publishedRecordCount: 4, totalCostMicros: 500, costPerPublishedRecordMicros: 125, byCategoryMicros: { HTTP_REQUEST: 400, BROWSER_MINUTE: 100 }, byAllocationBucketMicros: { PRIMARY_ATTEMPT: 300, RETRY_ATTEMPT: 100, FALLBACK_ATTEMPT: 100 } });
  });

  it('returns a null cost-per-record for zero published records without inferring record content', () => {
    const result = aggregateJobCost({ scope, publishedRecordCount: 0, ratedUsage: [rated('HTTP_REQUEST', 'PRIMARY', 1, 100, 'zero')] });
    expect(result.costPerPublishedRecordMicros).toBeNull();
    expect(JSON.stringify(result)).not.toContain('recordValue');
    expect(JSON.stringify(result)).not.toContain('credential');
  });

  it('rejects currency mismatch, scope mismatch and invalid rate evidence fail-closed', () => {
    const valid = rated('HTTP_REQUEST', 'PRIMARY', 1, 100, 'valid');
    expect(() => aggregateJobCost({ scope, publishedRecordCount: 1, ratedUsage: [valid, { ...rated('HTTP_REQUEST', 'RETRY', 1, 100, 'eur'), rate: { ...rated('HTTP_REQUEST', 'FALLBACK_BROWSER', 1, 100, 'other').rate, currency: 'EUR' } }] })).toThrow(JobCostAggregationError);
    expect(() => aggregateJobCost({ scope: { ...scope, tenantId: 'tenant_2' }, publishedRecordCount: 1, ratedUsage: [valid] })).toThrow(JobCostAggregationError);
    expect(() => aggregateJobCost({ scope, publishedRecordCount: 1, ratedUsage: [{ ...valid, rate: { ...valid.rate, category: 'AI_INPUT_TOKEN' } }] })).toThrow(JobCostAggregationError);
  });
});
