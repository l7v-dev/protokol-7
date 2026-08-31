import type { AllocationBucket, RetryFallbackAllocation } from './retry-fallback-allocation.js';
import type { CostCategory, UsageUnit } from './usage-events.js';

export const JOB_COST_AGGREGATION_CONTRACT_VERSION = 'job-cost-aggregation/v1' as const;

export type JobCostScope = { tenantId: string; projectId: string; jobId: string };
export type ResolvedRateQuote = {
  tariffId: string;
  currency: 'USD' | 'EUR';
  category: CostCategory;
  unit: UsageUnit;
  unitPriceMicros: number;
  tariffFingerprintSha256: string;
};
export type RatedUsageAllocation = { allocation: RetryFallbackAllocation; rate: ResolvedRateQuote };
export type JobCostAggregationInput = { scope: JobCostScope; publishedRecordCount: number; ratedUsage: ReadonlyArray<RatedUsageAllocation> };

export type JobCostAggregation = {
  contractVersion: typeof JOB_COST_AGGREGATION_CONTRACT_VERSION;
  scope: JobCostScope;
  currency: 'USD' | 'EUR' | null;
  ratedUsageCount: number;
  publishedRecordCount: number;
  totalCostMicros: number;
  costPerPublishedRecordMicros: number | null;
  byCategoryMicros: Readonly<Record<CostCategory, number>>;
  byAllocationBucketMicros: Readonly<Record<AllocationBucket, number>>;
};

export class JobCostAggregationError extends Error {
  public constructor(public readonly code: 'JOB_COST_AGGREGATION_INVALID' | 'JOB_COST_AGGREGATION_CURRENCY_MISMATCH' | 'JOB_COST_AGGREGATION_OVERFLOW', message: string) {
    super(message);
    this.name = 'JobCostAggregationError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const CATEGORIES: ReadonlyArray<CostCategory> = ['HTTP_REQUEST', 'BROWSER_MINUTE', 'PROXY_REQUEST', 'PROXY_GB', 'AI_INPUT_TOKEN', 'AI_OUTPUT_TOKEN', 'STORAGE_GB_MONTH', 'COMPUTE_SECOND', 'RETRY_ATTEMPT'];
const MAX_RECORDS = 100_000_000;

/**
 * Pure FinOps aggregate over caller-supplied immutable allocation evidence and
 * resolved tariff quotes. It does not load prices, fetch usage, persist totals,
 * create invoices, charge/payment, enforce budgets, make financial decisions or
 * expose provider, target, URL, payload, credential or raw record data.
 */
export function aggregateJobCost(input: JobCostAggregationInput): JobCostAggregation {
  validateScope(input.scope);
  if (!Number.isInteger(input.publishedRecordCount) || input.publishedRecordCount < 0 || input.publishedRecordCount > MAX_RECORDS) throw invalid();
  const byCategoryMicros = emptyCategories();
  const byAllocationBucketMicros: Record<AllocationBucket, number> = { PRIMARY_ATTEMPT: 0, RETRY_ATTEMPT: 0, FALLBACK_ATTEMPT: 0 };
  let currency: 'USD' | 'EUR' | null = null;
  let totalCostMicros = 0;
  for (const rated of input.ratedUsage) {
    validateRatedUsage(input.scope, rated);
    if (currency !== null && currency !== rated.rate.currency) throw new JobCostAggregationError('JOB_COST_AGGREGATION_CURRENCY_MISMATCH', 'Job cost aggregate tek currency ile hesaplanmalıdır.');
    currency = rated.rate.currency;
    const costMicros = amountMicros(rated.allocation.quantity, rated.rate.unitPriceMicros);
    totalCostMicros = safeSum(totalCostMicros, costMicros);
    byCategoryMicros[rated.allocation.category] = safeSum(byCategoryMicros[rated.allocation.category], costMicros);
    byAllocationBucketMicros[rated.allocation.allocationBucket] = safeSum(byAllocationBucketMicros[rated.allocation.allocationBucket], costMicros);
  }
  return {
    contractVersion: JOB_COST_AGGREGATION_CONTRACT_VERSION, scope: { ...input.scope }, currency, ratedUsageCount: input.ratedUsage.length,
    publishedRecordCount: input.publishedRecordCount, totalCostMicros,
    costPerPublishedRecordMicros: input.publishedRecordCount === 0 ? null : round(totalCostMicros / input.publishedRecordCount),
    byCategoryMicros, byAllocationBucketMicros
  };
}

function validateRatedUsage(scope: JobCostScope, rated: RatedUsageAllocation): void {
  const { allocation, rate } = rated;
  if (allocation.contractVersion !== 'retry-fallback-allocation/v1'
    || allocation.scope.tenantId !== scope.tenantId || allocation.scope.projectId !== scope.projectId || allocation.scope.jobId !== scope.jobId
    || !SAFE_ID.test(allocation.allocationId) || !SAFE_ID.test(allocation.rootAttemptId) || !SAFE_ID.test(allocation.allocatedAttemptId)
    || !CATEGORIES.includes(allocation.category) || allocation.unit !== rate.unit || allocation.category !== rate.category
    || !SAFE_ID.test(rate.tariffId) || !['USD', 'EUR'].includes(rate.currency) || !Number.isSafeInteger(rate.unitPriceMicros) || rate.unitPriceMicros < 0
    || !/^[a-f0-9]{64}$/.test(rate.tariffFingerprintSha256) || !Number.isFinite(allocation.quantity) || allocation.quantity < 0) throw invalid();
}

function validateScope(scope: JobCostScope): void {
  if (!Object.values(scope).every((value) => SAFE_ID.test(value))) throw invalid();
}

function amountMicros(quantity: number, unitPriceMicros: number): number {
  const value = Math.round(quantity * unitPriceMicros);
  if (!Number.isSafeInteger(value) || value < 0) throw new JobCostAggregationError('JOB_COST_AGGREGATION_OVERFLOW', 'Job cost amount güvenli integer aralığını aşıyor.');
  return value;
}

function safeSum(left: number, right: number): number {
  if (left > Number.MAX_SAFE_INTEGER - right) throw new JobCostAggregationError('JOB_COST_AGGREGATION_OVERFLOW', 'Job cost toplamı güvenli integer aralığını aşıyor.');
  return left + right;
}

function emptyCategories(): Record<CostCategory, number> {
  return { HTTP_REQUEST: 0, BROWSER_MINUTE: 0, PROXY_REQUEST: 0, PROXY_GB: 0, AI_INPUT_TOKEN: 0, AI_OUTPUT_TOKEN: 0, STORAGE_GB_MONTH: 0, COMPUTE_SECOND: 0, RETRY_ATTEMPT: 0 };
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function invalid(): JobCostAggregationError {
  return new JobCostAggregationError('JOB_COST_AGGREGATION_INVALID', 'Job cost aggregation input geçerli değil.');
}
