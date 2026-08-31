import { createHash } from 'node:crypto';

import { JOB_COST_AGGREGATION_CONTRACT_VERSION, type JobCostAggregation, type JobCostScope } from './job-cost-aggregation.js';

export const FINANCE_REPORTING_CONTRACT_VERSION = 'finance-reporting/v1' as const;

export type FinancePeriod = { periodId: string; startsAt: string; endsAt: string };
export type FinanceReportScope = Pick<JobCostScope, 'tenantId' | 'projectId'>;
export type FinanceExportProjection = { tenantId: string; projectId: string; jobId: string; currency: 'USD' | 'EUR'; totalCostMicros: number; publishedRecordCount: number; costPerPublishedRecordMicros: number | null };
export type FinancePeriodCloseReport = {
  contractVersion: typeof FINANCE_REPORTING_CONTRACT_VERSION;
  scope: FinanceReportScope;
  period: FinancePeriod;
  currency: 'USD' | 'EUR';
  exportProjection: ReadonlyArray<FinanceExportProjection>;
  reconciliation: { expectedTotalMicros: number; aggregatedTotalMicros: number; varianceMicros: number; status: 'RECONCILED' | 'MISMATCH' };
  close: { status: 'CLOSED' | 'REVIEW_REQUIRED'; allowsPersistence: false; allowsExternalExport: false };
  reportFingerprintSha256: string;
};

export class FinanceReportingError extends Error {
  public constructor(public readonly code: 'FINANCE_REPORTING_INVALID' | 'FINANCE_REPORTING_CURRENCY_MISMATCH' | 'FINANCE_REPORTING_OVERFLOW', message: string) {
    super(message);
    this.name = 'FinanceReportingError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_JOBS_PER_REPORT = 1_000;
const MAX_PERIOD_MS = 31 * 24 * 60 * 60 * 1_000;

/**
 * Pure finance reporting projection. It builds bounded in-memory export rows,
 * exact internal reconciliation and a close decision from caller-supplied job
 * aggregates. It never reads/exports a file, writes a ledger, closes a real
 * accounting period, calls external finance systems, bills or moves money.
 */
export function createFinancePeriodCloseReport(input: { scope: FinanceReportScope; period: FinancePeriod; expectedTotalMicros: number; aggregates: ReadonlyArray<JobCostAggregation> }): FinancePeriodCloseReport {
  validateInput(input);
  const currency = currencyFor(input.aggregates);
  const exportProjection = input.aggregates
    .map((aggregate) => toExportRow(aggregate))
    .sort((left, right) => left.jobId.localeCompare(right.jobId));
  const aggregatedTotalMicros = exportProjection.reduce((total, row) => safeSum(total, row.totalCostMicros), 0);
  const varianceMicros = input.expectedTotalMicros - aggregatedTotalMicros;
  if (!Number.isSafeInteger(varianceMicros)) throw new FinanceReportingError('FINANCE_REPORTING_OVERFLOW', 'Reconciliation variance güvenli integer aralığını aşıyor.');
  const reconciliation = { expectedTotalMicros: input.expectedTotalMicros, aggregatedTotalMicros, varianceMicros, status: varianceMicros === 0 ? 'RECONCILED' as const : 'MISMATCH' as const };
  const core = { scope: { ...input.scope }, period: { ...input.period }, currency, exportProjection, reconciliation, close: { status: reconciliation.status === 'RECONCILED' ? 'CLOSED' as const : 'REVIEW_REQUIRED' as const, allowsPersistence: false as const, allowsExternalExport: false as const } };
  return { contractVersion: FINANCE_REPORTING_CONTRACT_VERSION, ...core, reportFingerprintSha256: createHash('sha256').update(JSON.stringify(core)).digest('hex') };
}

function validateInput(input: { scope: FinanceReportScope; period: FinancePeriod; expectedTotalMicros: number; aggregates: ReadonlyArray<JobCostAggregation> }): void {
  if (!Object.values(input.scope).every((value) => SAFE_ID.test(value)) || !SAFE_ID.test(input.period.periodId)
    || !validPeriod(input.period) || !Number.isSafeInteger(input.expectedTotalMicros) || input.expectedTotalMicros < 0
    || input.aggregates.length < 1 || input.aggregates.length > MAX_JOBS_PER_REPORT) throw invalid();
  const jobs = new Set<string>();
  for (const aggregate of input.aggregates) {
    if (aggregate.contractVersion !== JOB_COST_AGGREGATION_CONTRACT_VERSION || aggregate.scope.tenantId !== input.scope.tenantId || aggregate.scope.projectId !== input.scope.projectId
      || !SAFE_ID.test(aggregate.scope.jobId) || aggregate.currency === null || !['USD', 'EUR'].includes(aggregate.currency)
      || !Number.isSafeInteger(aggregate.totalCostMicros) || aggregate.totalCostMicros < 0 || !Number.isInteger(aggregate.publishedRecordCount) || aggregate.publishedRecordCount < 0
      || jobs.has(aggregate.scope.jobId)) throw invalid();
    jobs.add(aggregate.scope.jobId);
  }
}

function currencyFor(aggregates: ReadonlyArray<JobCostAggregation>): 'USD' | 'EUR' {
  const currency = aggregates[0]?.currency;
  if (currency !== 'USD' && currency !== 'EUR' || aggregates.some((aggregate) => aggregate.currency !== currency)) throw new FinanceReportingError('FINANCE_REPORTING_CURRENCY_MISMATCH', 'Period report tek currency ile oluşturulmalıdır.');
  return currency;
}

function toExportRow(aggregate: JobCostAggregation): FinanceExportProjection {
  if (aggregate.currency === null) throw invalid();
  return { tenantId: aggregate.scope.tenantId, projectId: aggregate.scope.projectId, jobId: aggregate.scope.jobId, currency: aggregate.currency, totalCostMicros: aggregate.totalCostMicros, publishedRecordCount: aggregate.publishedRecordCount, costPerPublishedRecordMicros: aggregate.costPerPublishedRecordMicros };
}

function validPeriod(period: FinancePeriod): boolean {
  const start = Date.parse(period.startsAt);
  const end = Date.parse(period.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start && end - start <= MAX_PERIOD_MS;
}

function safeSum(left: number, right: number): number {
  if (left > Number.MAX_SAFE_INTEGER - right) throw new FinanceReportingError('FINANCE_REPORTING_OVERFLOW', 'Period total güvenli integer aralığını aşıyor.');
  return left + right;
}

function invalid(): FinanceReportingError {
  return new FinanceReportingError('FINANCE_REPORTING_INVALID', 'Finance reporting input geçerli değil.');
}
