import { describe, expect, it } from 'vitest';

import { RetryFallbackAllocationError, RetryFallbackAllocationRegistry } from '../../src/finops/retry-fallback-allocation.js';
import { UsageEventRegistry } from '../../src/finops/usage-events.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_2' };
function usage(category: 'HTTP_REQUEST' | 'BROWSER_MINUTE', id = 'usage_1') {
  return new UsageEventRegistry().record({ scope, usageId: id, idempotencyKey: id, category, unit: category === 'HTTP_REQUEST' ? 'request' : 'minute', quantity: 1, occurredAt: '2026-08-27T00:00:00.000Z' });
}

describe('deterministic retry and fallback cost allocation', () => {
  it('allocates immutable usage to primary, retry and bounded fallback buckets without calculating monetary cost', () => {
    const registry = new RetryFallbackAllocationRegistry();
    const primary = registry.allocate({ allocationId: 'allocation_1', rootAttemptId: 'attempt_1', allocationKind: 'PRIMARY', usageEvent: usage('HTTP_REQUEST', 'usage_primary') });
    const retry = registry.allocate({ allocationId: 'allocation_2', rootAttemptId: 'attempt_1', allocationKind: 'RETRY', usageEvent: usage('HTTP_REQUEST', 'usage_retry') });
    const fallback = registry.allocate({ allocationId: 'allocation_3', rootAttemptId: 'attempt_1', allocationKind: 'FALLBACK_BROWSER', usageEvent: usage('BROWSER_MINUTE', 'usage_fallback') });

    expect([primary.allocationBucket, retry.allocationBucket, fallback.allocationBucket]).toEqual(['PRIMARY_ATTEMPT', 'RETRY_ATTEMPT', 'FALLBACK_ATTEMPT']);
    expect(fallback).toMatchObject({ rootAttemptId: 'attempt_1', allocatedAttemptId: 'attempt_2', category: 'BROWSER_MINUTE', quantity: 1 });
    expect(JSON.stringify(fallback)).not.toContain('costCents');
    expect(JSON.stringify(fallback)).not.toContain('credential');
  });

  it('returns the same allocation for identical input and prevents changed classification for the same usage evidence', () => {
    const registry = new RetryFallbackAllocationRegistry();
    const input = { allocationId: 'allocation_1', rootAttemptId: 'attempt_1', allocationKind: 'RETRY' as const, usageEvent: usage('HTTP_REQUEST') };
    expect(registry.allocate(input)).toEqual(registry.allocate(input));
    expect(() => registry.allocate({ ...input, allocationKind: 'FALLBACK_PROXY' })).toThrow(RetryFallbackAllocationError);
  });

  it('rejects unknown allocation kinds, malformed usage evidence and unsafe identifiers fail-closed', () => {
    const registry = new RetryFallbackAllocationRegistry();
    const event = usage('HTTP_REQUEST');
    expect(() => registry.allocate({ allocationId: 'bad id', rootAttemptId: 'attempt_1', allocationKind: 'PRIMARY', usageEvent: event })).toThrow(RetryFallbackAllocationError);
    expect(() => registry.allocate({ allocationId: 'allocation_1', rootAttemptId: 'attempt_1', allocationKind: 'FALLBACK_BYPASS' as never, usageEvent: event })).toThrow(RetryFallbackAllocationError);
    expect(() => registry.allocate({ allocationId: 'allocation_1', rootAttemptId: 'attempt_1', allocationKind: 'PRIMARY', usageEvent: { ...event, usageFingerprintSha256: 'bad' } })).toThrow(RetryFallbackAllocationError);
  });
});
