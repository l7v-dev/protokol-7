import { isNeverBypassCode } from '../security/compliance-policy.js';

export type ExecutionStrategy = 'HTTP' | 'BROWSER' | 'STRATEGY_EXHAUSTED';

export type StrategyDecision = {
  strategy: ExecutionStrategy;
  reason:
    | 'DEFAULT_HTTP'
    | 'EXPLICIT_BROWSER'
    | 'HTTP_CONTENT_INSUFFICIENT'
    | 'HTTP_BROWSER_FALLBACK_NOT_ALLOWED'
    | 'HTTP_FAILURE_NOT_SAFE_FOR_FALLBACK'
    | 'BROWSER_FALLBACK_BUDGET_EXHAUSTED';
  consumesFallbackBudget: boolean;
};

export type InitialStrategyInput = {
  requestedStrategy?: unknown;
  allowBrowser: boolean;
};

export type FallbackInput = {
  allowBrowser: boolean;
  httpErrorCode: string;
  fallbackBudgetRemaining: number;
};

const SAFE_BROWSER_FALLBACK_ERRORS = new Set([
  'HTTP_CONTENT_INSUFFICIENT',
  'HTTP_JAVASCRIPT_REQUIRED',
  'HTTP_EMPTY_CONTENT',
  'UNSUPPORTED_CONTENT_TYPE'
]);

export class BrowserFallbackPolicy {
  public chooseInitial(input: InitialStrategyInput): StrategyDecision {
    if (input.requestedStrategy === 'BROWSER' && input.allowBrowser) {
      return {
        strategy: 'BROWSER',
        reason: 'EXPLICIT_BROWSER',
        consumesFallbackBudget: false
      };
    }
    return {
      strategy: 'HTTP',
      reason: 'DEFAULT_HTTP',
      consumesFallbackBudget: false
    };
  }

  public decide(input: FallbackInput): StrategyDecision {
    if (!input.allowBrowser) {
      return {
        strategy: 'STRATEGY_EXHAUSTED',
        reason: 'HTTP_BROWSER_FALLBACK_NOT_ALLOWED',
        consumesFallbackBudget: false
      };
    }
    if (isNeverBypassCode(input.httpErrorCode)) {
      return {
        strategy: 'STRATEGY_EXHAUSTED',
        reason: 'HTTP_FAILURE_NOT_SAFE_FOR_FALLBACK',
        consumesFallbackBudget: false
      };
    }
    if (!SAFE_BROWSER_FALLBACK_ERRORS.has(input.httpErrorCode)) {
      return {
        strategy: 'STRATEGY_EXHAUSTED',
        reason: 'HTTP_FAILURE_NOT_SAFE_FOR_FALLBACK',
        consumesFallbackBudget: false
      };
    }
    if (input.fallbackBudgetRemaining < 1) {
      return {
        strategy: 'STRATEGY_EXHAUSTED',
        reason: 'BROWSER_FALLBACK_BUDGET_EXHAUSTED',
        consumesFallbackBudget: false
      };
    }
    return {
      strategy: 'BROWSER',
      reason: 'HTTP_CONTENT_INSUFFICIENT',
      consumesFallbackBudget: true
    };
  }
}
