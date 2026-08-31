import { createHash } from 'node:crypto';

import { USAGE_EVENT_CONTRACT_VERSION, type UsageEvent, type UsageEventScope } from './usage-events.js';

export const RETRY_FALLBACK_ALLOCATION_CONTRACT_VERSION = 'retry-fallback-allocation/v1' as const;

export type AllocationKind = 'PRIMARY' | 'RETRY' | 'FALLBACK_BROWSER' | 'FALLBACK_PROXY';
export type AllocationBucket = 'PRIMARY_ATTEMPT' | 'RETRY_ATTEMPT' | 'FALLBACK_ATTEMPT';
export type AllocationScope = Pick<UsageEventScope, 'tenantId' | 'projectId' | 'jobId' | 'taskId'>;

export type RetryFallbackAllocationInput = {
  allocationId: string;
  rootAttemptId: string;
  allocationKind: AllocationKind;
  usageEvent: UsageEvent;
};

export type RetryFallbackAllocation = {
  contractVersion: typeof RETRY_FALLBACK_ALLOCATION_CONTRACT_VERSION;
  allocationId: string;
  scope: AllocationScope;
  rootAttemptId: string;
  allocatedAttemptId: string;
  allocationKind: AllocationKind;
  allocationBucket: AllocationBucket;
  category: UsageEvent['category'];
  unit: UsageEvent['unit'];
  quantity: number;
  usageFingerprintSha256: string;
  allocationFingerprintSha256: string;
};

export class RetryFallbackAllocationError extends Error {
  public constructor(public readonly code: 'RETRY_FALLBACK_ALLOCATION_INVALID' | 'RETRY_FALLBACK_ALLOCATION_CONFLICT', message: string) {
    super(message);
    this.name = 'RetryFallbackAllocationError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Process-local allocation projection over an already immutable P14-T01 usage
 * event. It does not calculate monetary cost, select/execute retry/fallback,
 * change retry budgets or policies, persist data, dispatch work or perform any
 * network/provider/billing operation.
 */
export class RetryFallbackAllocationRegistry {
  private readonly allocations = new Map<string, RetryFallbackAllocation>();

  public allocate(input: RetryFallbackAllocationInput): RetryFallbackAllocation {
    validateInput(input);
    const candidate = createAllocation(input);
    const key = `${candidate.scope.tenantId}:${candidate.scope.projectId}:${candidate.scope.jobId}:${candidate.scope.taskId}:${candidate.rootAttemptId}:${candidate.usageFingerprintSha256}`;
    const existing = this.allocations.get(key);
    if (existing !== undefined) {
      if (existing.allocationFingerprintSha256 === candidate.allocationFingerprintSha256) return clone(existing);
      throw new RetryFallbackAllocationError('RETRY_FALLBACK_ALLOCATION_CONFLICT', 'Aynı usage event için allocation farklı içerikle tekrar kullanılamaz.');
    }
    this.allocations.set(key, candidate);
    return clone(candidate);
  }
}

function createAllocation(input: RetryFallbackAllocationInput): RetryFallbackAllocation {
  const scope: AllocationScope = {
    tenantId: input.usageEvent.scope.tenantId, projectId: input.usageEvent.scope.projectId,
    jobId: input.usageEvent.scope.jobId, taskId: input.usageEvent.scope.taskId
  };
  const allocationBucket = bucketFor(input.allocationKind);
  const core = {
    allocationId: input.allocationId, scope, rootAttemptId: input.rootAttemptId, allocatedAttemptId: input.usageEvent.scope.attemptId,
    allocationKind: input.allocationKind, allocationBucket, category: input.usageEvent.category, unit: input.usageEvent.unit,
    quantity: input.usageEvent.quantity, usageFingerprintSha256: input.usageEvent.usageFingerprintSha256
  };
  return {
    contractVersion: RETRY_FALLBACK_ALLOCATION_CONTRACT_VERSION,
    ...core,
    allocationFingerprintSha256: createHash('sha256').update(JSON.stringify(core)).digest('hex')
  };
}

function validateInput(input: RetryFallbackAllocationInput): void {
  if (!SAFE_ID.test(input.allocationId) || !SAFE_ID.test(input.rootAttemptId)
    || !['PRIMARY', 'RETRY', 'FALLBACK_BROWSER', 'FALLBACK_PROXY'].includes(input.allocationKind)
    || input.usageEvent.contractVersion !== USAGE_EVENT_CONTRACT_VERSION
    || !Object.values(input.usageEvent.scope).every((value) => SAFE_ID.test(value))
    || !SAFE_ID.test(input.usageEvent.usageId) || !SAFE_ID.test(input.usageEvent.idempotencyKey)
    || !/^[a-f0-9]{64}$/.test(input.usageEvent.usageFingerprintSha256)
    || !Number.isFinite(input.usageEvent.quantity) || input.usageEvent.quantity < 0 || !Number.isFinite(Date.parse(input.usageEvent.occurredAt))) throw invalid();
}

function bucketFor(kind: AllocationKind): AllocationBucket {
  return kind === 'PRIMARY' ? 'PRIMARY_ATTEMPT' : kind === 'RETRY' ? 'RETRY_ATTEMPT' : 'FALLBACK_ATTEMPT';
}

function clone(allocation: RetryFallbackAllocation): RetryFallbackAllocation {
  return { ...allocation, scope: { ...allocation.scope } };
}

function invalid(): RetryFallbackAllocationError {
  return new RetryFallbackAllocationError('RETRY_FALLBACK_ALLOCATION_INVALID', 'Retry/fallback allocation input geçerli değil.');
}
