import { describe, expect, it } from 'vitest';

import { StrategyEscalationError, StrategyEscalationPolicy, type StrategyEscalationInput } from '../../src/http/strategy-escalation.js';

const base: StrategyEscalationInput = {
  tenantId: 'tenant_1',
  jobId: 'job_1',
  taskId: 'task_1',
  currentStrategy: 'HTTP',
  failure: {
    code: 'HTTP_JAVASCRIPT_REQUIRED',
    accessClass: 'DEPENDENCY_FAILURE',
    retryable: true
  },
  allowBrowser: true,
  allowProxyRotation: false,
  fallbackBudgetRemaining: 1,
  escalationBudget: { maxUnits: 1 }
};

describe('StrategyEscalationPolicy', () => {
  it('escalates content insufficiency to browser within both budgets', () => {
    const policy = new StrategyEscalationPolicy();
    expect(policy.decide(base)).toEqual({
      action: 'ESCALATE_BROWSER',
      reason: 'SAFE_BROWSER_FALLBACK',
      consumesBudget: true,
      budgetRemaining: 0,
      compliance: {
        action: 'RETRY_BOUNDED',
        reason: 'TRANSIENT_RETRY',
        retryable: true
      }
    });
  });

  it('recommends bounded proxy rotation only for transient failures', () => {
    const policy = new StrategyEscalationPolicy();
    expect(policy.decide({
      ...base,
      failure: { code: 'HTTP_SERVER_ERROR', accessClass: 'SERVER_ERROR', retryable: true },
      allowBrowser: false,
      allowProxyRotation: true,
      fallbackBudgetRemaining: 0
    })).toMatchObject({
      action: 'ROTATE_PROXY',
      reason: 'TRANSIENT_PROXY_ROTATION',
      consumesBudget: true,
      budgetRemaining: 0
    });
  });

  it('terminally blocks authentication, policy and anti-bot outcomes even when escalation is allowed', () => {
    const policy = new StrategyEscalationPolicy();
    for (const failure of [
      { code: 'HTTP_AUTH_REQUIRED', accessClass: 'AUTHENTICATION_REQUIRED' as const, retryable: false },
      { code: 'HTTP_POLICY_BLOCKED', accessClass: 'POLICY_BLOCKED' as const, retryable: false },
      { code: 'CAPTCHA_REQUIRED', accessClass: 'ANTI_BOT_BARRIER' as const, retryable: false }
    ]) {
      expect(policy.decide({
        ...base,
        failure,
        allowBrowser: true,
        allowProxyRotation: true,
        fallbackBudgetRemaining: 3,
        escalationBudget: { maxUnits: 3 }
      })).toMatchObject({
        action: 'TERMINAL_BLOCK',
        reason: 'COMPLIANCE_TERMINAL',
        consumesBudget: false,
        compliance: { action: 'TERMINAL_BLOCK', retryable: false }
      });
    }
  });

  it('does not escalate a browser strategy again and stops when escalation budget is exhausted', () => {
    const policy = new StrategyEscalationPolicy();
    expect(policy.decide({ ...base, currentStrategy: 'BROWSER' })).toMatchObject({
      action: 'NO_ESCALATION',
      reason: 'CURRENT_STRATEGY_FINAL',
      consumesBudget: false
    });

    const transient: StrategyEscalationInput = {
      ...base,
      failure: { code: 'HTTP_TIMEOUT', accessClass: 'TIMEOUT', retryable: true },
      allowBrowser: false,
      allowProxyRotation: true,
      fallbackBudgetRemaining: 0,
      escalationBudget: { key: 'rotation', maxUnits: 1 }
    };
    expect(policy.decide(transient)).toMatchObject({ action: 'ROTATE_PROXY', budgetRemaining: 0 });
    expect(policy.decide(transient)).toMatchObject({
      action: 'BUDGET_EXHAUSTED',
      reason: 'ESCALATION_BUDGET_EXHAUSTED',
      consumesBudget: false,
      budgetRemaining: 0
    });
  });

  it('does not allow escalation without an eligible strategy and isolates tenant budget keys', () => {
    const policy = new StrategyEscalationPolicy();
    expect(policy.decide({ ...base, allowBrowser: false, allowProxyRotation: false })).toMatchObject({
      action: 'NO_ESCALATION',
      reason: 'NO_ALLOWED_STRATEGY',
      consumesBudget: false
    });
    expect(policy.decide({ ...base, tenantId: 'tenant_2' })).toMatchObject({
      action: 'ESCALATE_BROWSER',
      budgetRemaining: 0
    });
    expect(new StrategyEscalationError('STRATEGY_INPUT_INVALID', 'invalid', false).name).toBe('StrategyEscalationError');
  });
});
