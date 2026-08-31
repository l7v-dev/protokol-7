import { AccessCompliancePolicy, type ComplianceDecision } from '../security/compliance-policy.js';
import { BrowserFallbackPolicy } from '../browser/fallback.js';
import type { AccessResultClass } from './reliability.js';
import { ScopedBudgetRegistry, type BudgetScope } from './budget.js';

export type StrategyMode = 'HTTP' | 'BROWSER';
export type StrategyEscalationAction = 'NO_ESCALATION' | 'ESCALATE_BROWSER' | 'ROTATE_PROXY' | 'TERMINAL_BLOCK' | 'BUDGET_EXHAUSTED';

export type StrategyEscalationInput = {
  tenantId: string;
  jobId: string;
  taskId?: string;
  currentStrategy: StrategyMode;
  failure: {
    code: string;
    accessClass: AccessResultClass;
    retryable: boolean;
  };
  allowBrowser: boolean;
  allowProxyRotation: boolean;
  fallbackBudgetRemaining: number;
  escalationBudget: Omit<BudgetScope, 'kind' | 'tenantId' | 'jobId' | 'taskId'>;
};

export type StrategyEscalationDecision = {
  action: StrategyEscalationAction;
  reason:
    | 'CURRENT_STRATEGY_FINAL'
    | 'NO_ALLOWED_STRATEGY'
    | 'COMPLIANCE_TERMINAL'
    | 'SAFE_BROWSER_FALLBACK'
    | 'TRANSIENT_PROXY_ROTATION'
    | 'ESCALATION_BUDGET_EXHAUSTED';
  consumesBudget: boolean;
  budgetRemaining?: number;
  compliance: Pick<ComplianceDecision, 'action' | 'reason' | 'retryable'>;
};

export class StrategyEscalationError extends Error {
  public constructor(
    public readonly code: 'STRATEGY_INPUT_INVALID',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'StrategyEscalationError';
  }
}

/**
 * Returns a bounded recommendation only. It never performs browser fallback,
 * provider rotation or target-policy mutation itself.
 */
export class StrategyEscalationPolicy {
  public constructor(
    private readonly budgets: ScopedBudgetRegistry = new ScopedBudgetRegistry(),
    private readonly compliance = new AccessCompliancePolicy(),
    private readonly browserFallback = new BrowserFallbackPolicy()
  ) {}

  public decide(input: StrategyEscalationInput): StrategyEscalationDecision {
    validateInput(input);
    const compliance = this.compliance.decide(input.failure);
    const complianceSummary = {
      action: compliance.action,
      reason: compliance.reason,
      retryable: compliance.retryable
    } satisfies StrategyEscalationDecision['compliance'];

    if (compliance.action === 'TERMINAL_BLOCK') {
      return {
        action: 'TERMINAL_BLOCK',
        reason: 'COMPLIANCE_TERMINAL',
        consumesBudget: false,
        compliance: complianceSummary
      };
    }
    if (input.currentStrategy === 'BROWSER') {
      return {
        action: 'NO_ESCALATION',
        reason: 'CURRENT_STRATEGY_FINAL',
        consumesBudget: false,
        compliance: complianceSummary
      };
    }

    const browserDecision = this.browserFallback.decide({
      allowBrowser: input.allowBrowser,
      httpErrorCode: input.failure.code,
      fallbackBudgetRemaining: input.fallbackBudgetRemaining
    });
    if (browserDecision.strategy === 'BROWSER') {
      return this.consumeEscalation(input, 'ESCALATE_BROWSER', 'SAFE_BROWSER_FALLBACK', complianceSummary);
    }

    if (input.allowProxyRotation && isSafeRotationClass(input.failure.accessClass) && input.failure.retryable) {
      return this.consumeEscalation(input, 'ROTATE_PROXY', 'TRANSIENT_PROXY_ROTATION', complianceSummary);
    }

    return {
      action: 'NO_ESCALATION',
      reason: 'NO_ALLOWED_STRATEGY',
      consumesBudget: false,
      compliance: complianceSummary
    };
  }

  private consumeEscalation(
    input: StrategyEscalationInput,
    action: 'ESCALATE_BROWSER' | 'ROTATE_PROXY',
    reason: 'SAFE_BROWSER_FALLBACK' | 'TRANSIENT_PROXY_ROTATION',
    compliance: StrategyEscalationDecision['compliance']
  ): StrategyEscalationDecision {
    const budget = this.budgets.consume({
      tenantId: input.tenantId,
      jobId: input.jobId,
      ...(input.taskId ? { taskId: input.taskId } : {}),
      ...input.escalationBudget,
      kind: 'ESCALATION'
    });
    if (!budget.allowed) {
      return {
        action: 'BUDGET_EXHAUSTED',
        reason: 'ESCALATION_BUDGET_EXHAUSTED',
        consumesBudget: false,
        budgetRemaining: budget.remaining,
        compliance
      };
    }
    return {
      action,
      reason,
      consumesBudget: true,
      budgetRemaining: budget.remaining,
      compliance
    };
  }
}

function isSafeRotationClass(accessClass: AccessResultClass): boolean {
  return accessClass === 'RATE_LIMITED'
    || accessClass === 'TIMEOUT'
    || accessClass === 'SERVER_ERROR'
    || accessClass === 'DEPENDENCY_FAILURE';
}

function validateInput(input: StrategyEscalationInput): void {
  if (!input.tenantId || !input.jobId
    || (input.taskId !== undefined && !input.taskId)
    || (input.currentStrategy !== 'HTTP' && input.currentStrategy !== 'BROWSER')
    || !input.failure.code || !input.failure.accessClass
    || !Number.isInteger(input.fallbackBudgetRemaining) || input.fallbackBudgetRemaining < 0
    || !Number.isInteger(input.escalationBudget.maxUnits) || input.escalationBudget.maxUnits < 0) {
    throw new StrategyEscalationError('STRATEGY_INPUT_INVALID', 'Strategy escalation input geçerli değil.', false);
  }
}
