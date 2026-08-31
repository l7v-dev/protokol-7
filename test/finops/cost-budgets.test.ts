import { describe, expect, it } from 'vitest';

import { CostBudgetError, evaluateCostBudget } from '../../src/finops/cost-budgets.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1' };
const base = { scope, currency: 'USD' as const, caps: { tenantCapMicros: 1000, projectCapMicros: 1000, jobCapMicros: 1000 }, spend: { tenantSpentMicros: 790, projectSpentMicros: 800, jobSpentMicros: 1000 }, evaluatedAt: '2026-08-27T00:00:00.000Z' };

describe('bounded tenant, project and job cost budgets', () => {
  it('creates deterministic allow, warning and block decisions with non-dispatching alert references', () => {
    const decision = evaluateCostBudget(base);

    expect(decision.decisions.map((item) => [item.scopeKind, item.status, item.utilizationBasisPoints, item.alert.severity, item.allowNewCostlyWork])).toEqual([
      ['TENANT', 'ALLOW', 7900, null, true], ['PROJECT', 'WARNING', 8000, 'WARNING', true], ['JOB', 'BLOCKED', 10000, 'CRITICAL', false]
    ]);
    expect(decision.decisions[1]?.alert).toEqual({ triggered: true, severity: 'WARNING', onCallRoute: 'FINOPS_REVIEW', runbookId: 'cost-budget-v1' });
    expect(decision).toMatchObject({ allowNotificationDispatch: false, allowAutomaticStop: false });
  });

  it('treats a zero cap as blocked without inferring or dispatching any operational action', () => {
    const decision = evaluateCostBudget({ ...base, caps: { tenantCapMicros: 0, projectCapMicros: 0, jobCapMicros: 0 }, spend: { tenantSpentMicros: 0, projectSpentMicros: 0, jobSpentMicros: 0 } });
    expect(decision.decisions.every((item) => item.status === 'BLOCKED' && item.allowNewCostlyWork === false)).toBe(true);
    expect(JSON.stringify(decision)).not.toContain('payment');
    expect(JSON.stringify(decision)).not.toContain('credential');
  });

  it('rejects malformed scope/time, unknown currency and invalid micro-cost values fail-closed', () => {
    expect(() => evaluateCostBudget({ ...base, scope: { ...scope, tenantId: 'bad tenant' } })).toThrow(CostBudgetError);
    expect(() => evaluateCostBudget({ ...base, currency: 'TRY' as never })).toThrow(CostBudgetError);
    expect(() => evaluateCostBudget({ ...base, spend: { ...base.spend, jobSpentMicros: -1 } })).toThrow(CostBudgetError);
    expect(() => evaluateCostBudget({ ...base, caps: { ...base.caps, tenantCapMicros: Number.MAX_SAFE_INTEGER + 1 } })).toThrow(CostBudgetError);
    expect(() => evaluateCostBudget({ ...base, evaluatedAt: 'bad-time' })).toThrow(CostBudgetError);
  });
});
