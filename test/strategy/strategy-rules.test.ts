import { describe, expect, it } from 'vitest';

import { DeterministicStrategyRules, STRATEGY_RULE_CONTRACT_VERSION, StrategyRuleError } from '../../src/strategy/strategy-rules.js';
import { TARGET_ANALYZER_CONTRACT_VERSION, TargetAnalyzer } from '../../src/strategy/target-analyzer.js';

const analysis = (signals: ReadonlyArray<'HTML_DOCUMENT' | 'JAVASCRIPT_RENDERING_OBSERVED'> = ['HTML_DOCUMENT']) => new TargetAnalyzer(() => new Date('2026-08-27T00:00:00.000Z')).analyze({
  contractVersion: TARGET_ANALYZER_CONTRACT_VERSION,
  scope: { tenantId: 'tenant_1', projectId: 'project_1', targetId: 'target_1' },
  target: { seedUrl: 'https://example.com', allowedHosts: ['example.com'], allowedPorts: [443], status: 'ACTIVE' },
  observedSignals: signals
});

const policy = { allowBrowserRendering: true, allowProxyRotation: true, browserFallbackAvailable: true };

describe('deterministic strategy rule and fallback priority contracts', () => {
  it('returns the same non-actionable primary recommendation for equal analyzer inputs', () => {
    const input = { contractVersion: STRATEGY_RULE_CONTRACT_VERSION, analysis: analysis(['HTML_DOCUMENT', 'JAVASCRIPT_RENDERING_OBSERVED']), policy } as const;
    const rules = new DeterministicStrategyRules();

    expect(rules.recommend(input)).toEqual(rules.recommend(input));
    expect(rules.recommend(input)).toMatchObject({ candidate: 'BROWSER_RENDER', reason: 'JAVASCRIPT_RENDERING_OBSERVED', priorityOrder: ['BROWSER_RENDER', 'PROXY_ROTATION'], policy: { requiresPolicyApproval: true, allowWorkerAction: false, allowBypass: false } });
  });

  it('uses browser content fallback before proxy rotation and rotates only on safe transient failures', () => {
    const rules = new DeterministicStrategyRules();
    const contentFallback = rules.recommend({ contractVersion: STRATEGY_RULE_CONTRACT_VERSION, analysis: analysis(), policy, failure: { code: 'HTTP_JAVASCRIPT_REQUIRED', accessClass: 'CLIENT_ERROR', retryable: false } });
    const transientRotation = rules.recommend({ contractVersion: STRATEGY_RULE_CONTRACT_VERSION, analysis: analysis(), policy: { ...policy, allowBrowserRendering: false }, failure: { code: 'HTTP_SERVER_ERROR', accessClass: 'SERVER_ERROR', retryable: true } });

    expect(contentFallback).toMatchObject({ candidate: 'BROWSER_RENDER', reason: 'SAFE_CONTENT_FALLBACK' });
    expect(transientRotation).toMatchObject({ candidate: 'PROXY_ROTATION', reason: 'SAFE_TRANSIENT_PROXY_ROTATION' });
  });

  it('returns terminal no-fallback decisions for analyzer/policy/anti-bot blocks and rejects forged inputs', () => {
    const rules = new DeterministicStrategyRules();
    const blockedAnalysis = analysis();
    const terminal = rules.recommend({ contractVersion: STRATEGY_RULE_CONTRACT_VERSION, analysis: blockedAnalysis, policy, failure: { code: 'CAPTCHA_REQUIRED', accessClass: 'ANTI_BOT_BARRIER', retryable: true } });
    const inactive = new TargetAnalyzer().analyze({
      contractVersion: TARGET_ANALYZER_CONTRACT_VERSION,
      scope: { tenantId: 'tenant_1', projectId: 'project_1', targetId: 'target_1' },
      target: { seedUrl: 'https://example.com', allowedHosts: ['example.com'], allowedPorts: [443], status: 'PAUSED' },
      observedSignals: []
    });

    expect(terminal).toMatchObject({ candidate: 'NONE', reason: 'COMPLIANCE_TERMINAL', policy: { allowBypass: false } });
    expect(rules.recommend({ contractVersion: STRATEGY_RULE_CONTRACT_VERSION, analysis: inactive, policy })).toMatchObject({ candidate: 'NONE', reason: 'ANALYZER_POLICY_BLOCKED' });
    expect(() => rules.recommend({ contractVersion: 'strategy-rules/v0', analysis: blockedAnalysis, policy })).toThrow(StrategyRuleError);
  });
});
