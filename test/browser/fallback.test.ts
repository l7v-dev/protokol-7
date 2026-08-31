import { describe, expect, it } from 'vitest';

import { BrowserFallbackPolicy } from '../../src/browser/fallback.js';

describe('BrowserFallbackPolicy', () => {
  it('defaults to HTTP and accepts explicit browser only when allowed', () => {
    const policy = new BrowserFallbackPolicy();

    expect(policy.chooseInitial({ allowBrowser: false })).toMatchObject({
      strategy: 'HTTP',
      reason: 'DEFAULT_HTTP'
    });
    expect(policy.chooseInitial({ requestedStrategy: 'BROWSER', allowBrowser: true })).toMatchObject({
      strategy: 'BROWSER',
      reason: 'EXPLICIT_BROWSER',
      consumesFallbackBudget: false
    });
    expect(policy.chooseInitial({ requestedStrategy: 'BROWSER', allowBrowser: false }).strategy).toBe('HTTP');
  });

  it('escalates only safe content insufficiency failures to browser', () => {
    const policy = new BrowserFallbackPolicy();

    expect(policy.decide({
      allowBrowser: true,
      httpErrorCode: 'HTTP_JAVASCRIPT_REQUIRED',
      fallbackBudgetRemaining: 1
    })).toMatchObject({
      strategy: 'BROWSER',
      reason: 'HTTP_CONTENT_INSUFFICIENT',
      consumesFallbackBudget: true
    });
    expect(policy.decide({
      allowBrowser: true,
      httpErrorCode: 'UNSUPPORTED_CONTENT_TYPE',
      fallbackBudgetRemaining: 1
    }).strategy).toBe('BROWSER');
  });

  it('never uses browser as an authentication, policy or rate-limit bypass', () => {
    const policy = new BrowserFallbackPolicy();
    for (const httpErrorCode of [
      'HTTP_CLIENT_ERROR',
      'HTTP_401_UNAUTHORIZED',
      'HTTP_AUTH_REQUIRED',
      'HTTP_403_FORBIDDEN',
      'HTTP_POLICY_BLOCKED',
      'HTTP_RATE_LIMITED',
      'PRIVATE_TARGET_BLOCKED',
      'POLICY_VIOLATION',
      'CREDENTIAL_ERROR',
      'CAPTCHA',
      'CAPTCHA_REQUIRED'
    ]) {
      expect(policy.decide({
        allowBrowser: true,
        httpErrorCode,
        fallbackBudgetRemaining: 1
      })).toMatchObject({
        strategy: 'STRATEGY_EXHAUSTED',
        reason: 'HTTP_FAILURE_NOT_SAFE_FOR_FALLBACK',
        consumesFallbackBudget: false
      });
    }
  });

  it('stops fallback when browser is disabled or fallback budget is exhausted', () => {
    const policy = new BrowserFallbackPolicy();

    expect(policy.decide({
      allowBrowser: false,
      httpErrorCode: 'HTTP_CONTENT_INSUFFICIENT',
      fallbackBudgetRemaining: 1
    })).toMatchObject({
      strategy: 'STRATEGY_EXHAUSTED',
      reason: 'HTTP_BROWSER_FALLBACK_NOT_ALLOWED'
    });
    expect(policy.decide({
      allowBrowser: true,
      httpErrorCode: 'HTTP_CONTENT_INSUFFICIENT',
      fallbackBudgetRemaining: 0
    })).toMatchObject({
      strategy: 'STRATEGY_EXHAUSTED',
      reason: 'BROWSER_FALLBACK_BUDGET_EXHAUSTED'
    });
    expect(policy.decide({
      allowBrowser: true,
      httpErrorCode: 'HTTP_SERVER_ERROR',
      fallbackBudgetRemaining: 1
    }).strategy).toBe('STRATEGY_EXHAUSTED');
  });
});
