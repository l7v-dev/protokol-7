import { describe, expect, it } from 'vitest';

import { createFinancePeriodCloseReport, FinanceReportingError } from '../../src/finops/finance-reporting.js';
import type { JobCostAggregation } from '../../src/finops/job-cost-aggregation.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const period = { periodId: '2026-08', startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' };
function aggregate(jobId: string, totalCostMicros: number, currency: 'USD' | 'EUR' = 'USD'): JobCostAggregation {
  return {
    contractVersion: 'job-cost-aggregation/v1', scope: { ...scope, jobId }, currency, ratedUsageCount: 1, publishedRecordCount: 2, totalCostMicros, costPerPublishedRecordMicros: totalCostMicros / 2,
    byCategoryMicros: { HTTP_REQUEST: totalCostMicros, BROWSER_MINUTE: 0, PROXY_REQUEST: 0, PROXY_GB: 0, AI_INPUT_TOKEN: 0, AI_OUTPUT_TOKEN: 0, STORAGE_GB_MONTH: 0, COMPUTE_SECOND: 0, RETRY_ATTEMPT: 0 },
    byAllocationBucketMicros: { PRIMARY_ATTEMPT: totalCostMicros, RETRY_ATTEMPT: 0, FALLBACK_ATTEMPT: 0 }
  };
}

describe('secret-safe finance export, reconciliation and period close report', () => {
  it('creates deterministic sorted internal export rows, exact reconciliation and a non-persisting closed decision', () => {
    const report = createFinancePeriodCloseReport({ scope, period, expectedTotalMicros: 300, aggregates: [aggregate('job_2', 200), aggregate('job_1', 100)] });

    expect(report.exportProjection.map((row) => row.jobId)).toEqual(['job_1', 'job_2']);
    expect(report.reconciliation).toEqual({ expectedTotalMicros: 300, aggregatedTotalMicros: 300, varianceMicros: 0, status: 'RECONCILED' });
    expect(report.close).toEqual({ status: 'CLOSED', allowsPersistence: false, allowsExternalExport: false });
    expect(report.reportFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns an explicit mismatch/review decision without exporting or closing an external accounting period', () => {
    const report = createFinancePeriodCloseReport({ scope, period, expectedTotalMicros: 350, aggregates: [aggregate('job_1', 100)] });
    expect(report.reconciliation).toMatchObject({ aggregatedTotalMicros: 100, varianceMicros: 250, status: 'MISMATCH' });
    expect(report.close).toEqual({ status: 'REVIEW_REQUIRED', allowsPersistence: false, allowsExternalExport: false });
    expect(JSON.stringify(report)).not.toContain('payment');
    expect(JSON.stringify(report)).not.toContain('credential');
  });

  it('rejects invalid periods, duplicate jobs, scope mismatch and mixed currency fail-closed', () => {
    expect(() => createFinancePeriodCloseReport({ scope, period: { ...period, endsAt: period.startsAt }, expectedTotalMicros: 1, aggregates: [aggregate('job_1', 1)] })).toThrow(FinanceReportingError);
    expect(() => createFinancePeriodCloseReport({ scope, period, expectedTotalMicros: 2, aggregates: [aggregate('job_1', 1), aggregate('job_1', 1)] })).toThrow(FinanceReportingError);
    expect(() => createFinancePeriodCloseReport({ scope, period, expectedTotalMicros: 1, aggregates: [aggregate('job_1', 1, 'USD'), aggregate('job_2', 1, 'EUR')] })).toThrow(FinanceReportingError);
    expect(() => createFinancePeriodCloseReport({ scope, period, expectedTotalMicros: 1, aggregates: [{ ...aggregate('job_1', 1), scope: { tenantId: 'tenant_2', projectId: 'project_1', jobId: 'job_1' } }] })).toThrow(FinanceReportingError);
  });
});
