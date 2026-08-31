import { AccessCompliancePolicy, isNeverBypassCode } from '../security/compliance-policy.js';
import type { AccessResultClass } from '../http/reliability.js';
import type { TargetAnalyzerOutput } from './target-analyzer.js';

export const STRATEGY_RULE_CONTRACT_VERSION = 'strategy-rules/v1' as const;

export type StrategyCandidate = 'HTTP_DIRECT' | 'BROWSER_RENDER' | 'PROXY_ROTATION' | 'NONE';
export type StrategyReason =
  | 'ANALYZER_POLICY_BLOCKED'
  | 'JAVASCRIPT_RENDERING_OBSERVED'
  | 'DEFAULT_HTTP'
  | 'SAFE_CONTENT_FALLBACK'
  | 'SAFE_TRANSIENT_PROXY_ROTATION'
  | 'COMPLIANCE_TERMINAL'
  | 'NO_ALLOWED_FALLBACK';

export type StrategyRuleInput = {
  contractVersion: typeof STRATEGY_RULE_CONTRACT_VERSION;
  analysis: TargetAnalyzerOutput;
  policy: {
    allowBrowserRendering: boolean;
    allowProxyRotation: boolean;
    browserFallbackAvailable: boolean;
  };
  failure?: {
    code: string;
    accessClass: AccessResultClass;
    retryable: boolean;
  };
};

export type StrategyRecommendation = {
  contractVersion: typeof STRATEGY_RULE_CONTRACT_VERSION;
  analysisId: string;
  candidate: StrategyCandidate;
  reason: StrategyReason;
  priorityOrder: ReadonlyArray<'BROWSER_RENDER' | 'PROXY_ROTATION'>;
  policy: {
    analyzerAllowed: boolean;
    requiresPolicyApproval: true;
    allowWorkerAction: false;
    allowBypass: false;
  };
};

export class StrategyRuleError extends Error {
  public constructor(public readonly code: 'STRATEGY_RULE_INVALID', message: string) {
    super(message);
    this.name = 'StrategyRuleError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_CONTENT_FAILURE_CODES = new Set(['HTTP_CONTENT_INSUFFICIENT', 'HTTP_JAVASCRIPT_REQUIRED', 'HTTP_EMPTY_CONTENT', 'UNSUPPORTED_CONTENT_TYPE']);
const SAFE_ROTATION_ACCESS_CLASSES = new Set<AccessResultClass>(['RATE_LIMITED', 'TIMEOUT', 'SERVER_ERROR', 'DEPENDENCY_FAILURE']);

/**
 * Pure recommendation rules. They do not mutate budgets, fetch targets, invoke
 * models, rotate proxies, open browsers or dispatch workers; policy approval remains mandatory.
 */
export class DeterministicStrategyRules {
  private readonly compliance = new AccessCompliancePolicy();

  public recommend(input: StrategyRuleInput): StrategyRecommendation {
    validateInput(input);
    const priorityOrder = eligiblePriorityOrder(input.policy);
    const basePolicy = {
      analyzerAllowed: input.analysis.policy.allowed,
      requiresPolicyApproval: true as const,
      allowWorkerAction: false as const,
      allowBypass: false as const
    };
    if (!input.analysis.policy.allowed) return recommendation(input.analysis.analysisId, 'NONE', 'ANALYZER_POLICY_BLOCKED', priorityOrder, basePolicy);
    if (!input.failure) {
      if (input.analysis.capabilities.javascriptRenderingObserved && input.policy.allowBrowserRendering) {
        return recommendation(input.analysis.analysisId, 'BROWSER_RENDER', 'JAVASCRIPT_RENDERING_OBSERVED', priorityOrder, basePolicy);
      }
      return recommendation(input.analysis.analysisId, 'HTTP_DIRECT', 'DEFAULT_HTTP', priorityOrder, basePolicy);
    }
    if (isNeverBypassCode(input.failure.code)) {
      return recommendation(input.analysis.analysisId, 'NONE', 'COMPLIANCE_TERMINAL', priorityOrder, basePolicy);
    }
    if (input.policy.allowBrowserRendering && input.policy.browserFallbackAvailable && SAFE_CONTENT_FAILURE_CODES.has(input.failure.code)) {
      return recommendation(input.analysis.analysisId, 'BROWSER_RENDER', 'SAFE_CONTENT_FALLBACK', priorityOrder, basePolicy);
    }
    const compliance = this.compliance.decide(input.failure);
    if (compliance.action === 'TERMINAL_BLOCK') {
      return recommendation(input.analysis.analysisId, 'NONE', 'COMPLIANCE_TERMINAL', priorityOrder, basePolicy);
    }
    if (input.policy.allowProxyRotation && input.failure.retryable && SAFE_ROTATION_ACCESS_CLASSES.has(input.failure.accessClass)) {
      return recommendation(input.analysis.analysisId, 'PROXY_ROTATION', 'SAFE_TRANSIENT_PROXY_ROTATION', priorityOrder, basePolicy);
    }
    return recommendation(input.analysis.analysisId, 'NONE', 'NO_ALLOWED_FALLBACK', priorityOrder, basePolicy);
  }
}

function recommendation(
  analysisId: string,
  candidate: StrategyCandidate,
  reason: StrategyReason,
  priorityOrder: ReadonlyArray<'BROWSER_RENDER' | 'PROXY_ROTATION'>,
  policy: StrategyRecommendation['policy']
): StrategyRecommendation {
  return { contractVersion: STRATEGY_RULE_CONTRACT_VERSION, analysisId, candidate, reason, priorityOrder, policy };
}

function eligiblePriorityOrder(policy: StrategyRuleInput['policy']): Array<'BROWSER_RENDER' | 'PROXY_ROTATION'> {
  const order: Array<'BROWSER_RENDER' | 'PROXY_ROTATION'> = [];
  if (policy.allowBrowserRendering && policy.browserFallbackAvailable) order.push('BROWSER_RENDER');
  if (policy.allowProxyRotation) order.push('PROXY_ROTATION');
  return order;
}

function validateInput(input: StrategyRuleInput): void {
  if (input.contractVersion !== STRATEGY_RULE_CONTRACT_VERSION
    || input.analysis.contractVersion !== 'target-analyzer/v1'
    || !SAFE_ID.test(input.analysis.analysisId)
    || !input.analysis.scope.tenantId || !input.analysis.scope.projectId || !input.analysis.scope.targetId
    || input.failure !== undefined && (!SAFE_ID.test(input.failure.code) || !['SUCCESS', 'RATE_LIMITED', 'TIMEOUT', 'SERVER_ERROR', 'DEPENDENCY_FAILURE', 'AUTHENTICATION_REQUIRED', 'ANTI_BOT_BARRIER', 'POLICY_BLOCKED', 'CLIENT_ERROR'].includes(input.failure.accessClass))) {
    throw new StrategyRuleError('STRATEGY_RULE_INVALID', 'Strategy rule input contract geçerli değil.');
  }
}
