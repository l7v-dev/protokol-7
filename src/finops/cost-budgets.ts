export const COST_BUDGET_CONTRACT_VERSION = 'cost-budget/v1' as const;

export type CostBudgetScope = { tenantId: string; projectId: string; jobId: string };
export type CostBudgetCaps = { tenantCapMicros: number; projectCapMicros: number; jobCapMicros: number };
export type CostBudgetSpend = { tenantSpentMicros: number; projectSpentMicros: number; jobSpentMicros: number };
export type BudgetScopeKind = 'TENANT' | 'PROJECT' | 'JOB';
export type CostBudgetStatus = 'ALLOW' | 'WARNING' | 'BLOCKED';

export type CostBudgetDecision = {
  contractVersion: typeof COST_BUDGET_CONTRACT_VERSION;
  scope: CostBudgetScope;
  evaluatedAt: string;
  currency: 'USD' | 'EUR';
  decisions: ReadonlyArray<{
    scopeKind: BudgetScopeKind;
    status: CostBudgetStatus;
    spentMicros: number;
    capMicros: number;
    utilizationBasisPoints: number;
    alert: { triggered: boolean; severity: 'WARNING' | 'CRITICAL' | null; onCallRoute: 'FINOPS_REVIEW' | null; runbookId: 'cost-budget-v1' | null };
    allowNewCostlyWork: boolean;
  }>;
  allowNotificationDispatch: false;
  allowAutomaticStop: false;
};

export class CostBudgetError extends Error {
  public constructor(public readonly code: 'COST_BUDGET_INVALID', message: string) {
    super(message);
    this.name = 'CostBudgetError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const WARNING_BASIS_POINTS = 8_000;

/**
 * Pure, non-dispatching cost budget evaluator. It does not persist budgets,
 * alter worker/retry behavior, send alerts, stop jobs, execute a payment or
 * disclose tariffs, provider details, usage events, records or secrets.
 */
export function evaluateCostBudget(input: { scope: CostBudgetScope; currency: 'USD' | 'EUR'; caps: CostBudgetCaps; spend: CostBudgetSpend; evaluatedAt: string }): CostBudgetDecision {
  validate(input);
  const decisions = [
    decision('TENANT', input.spend.tenantSpentMicros, input.caps.tenantCapMicros),
    decision('PROJECT', input.spend.projectSpentMicros, input.caps.projectCapMicros),
    decision('JOB', input.spend.jobSpentMicros, input.caps.jobCapMicros)
  ];
  return { contractVersion: COST_BUDGET_CONTRACT_VERSION, scope: { ...input.scope }, evaluatedAt: input.evaluatedAt, currency: input.currency, decisions, allowNotificationDispatch: false, allowAutomaticStop: false };
}

function decision(scopeKind: BudgetScopeKind, spentMicros: number, capMicros: number): CostBudgetDecision['decisions'][number] {
  const utilizationBasisPoints = capMicros === 0 ? (spentMicros === 0 ? 10_000 : 10_000) : Math.min(10_000, Math.floor((spentMicros * 10_000) / capMicros));
  const status: CostBudgetStatus = spentMicros >= capMicros ? 'BLOCKED' : utilizationBasisPoints >= WARNING_BASIS_POINTS ? 'WARNING' : 'ALLOW';
  const severity = status === 'BLOCKED' ? 'CRITICAL' : status === 'WARNING' ? 'WARNING' : null;
  return {
    scopeKind, status, spentMicros, capMicros, utilizationBasisPoints,
    alert: { triggered: severity !== null, severity, onCallRoute: severity === null ? null : 'FINOPS_REVIEW', runbookId: severity === null ? null : 'cost-budget-v1' },
    allowNewCostlyWork: status !== 'BLOCKED'
  };
}

function validate(input: { scope: CostBudgetScope; currency: string; caps: CostBudgetCaps; spend: CostBudgetSpend; evaluatedAt: string }): void {
  if (!Object.values(input.scope).every((value) => SAFE_ID.test(value)) || !['USD', 'EUR'].includes(input.currency) || !Number.isFinite(Date.parse(input.evaluatedAt))
    || ![...Object.values(input.caps), ...Object.values(input.spend)].every((value) => Number.isSafeInteger(value) && value >= 0)) throw invalid();
}

function invalid(): CostBudgetError {
  return new CostBudgetError('COST_BUDGET_INVALID', 'Cost budget input geçerli değil.');
}
