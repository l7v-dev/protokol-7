import { describe, expect, it } from 'vitest';

import { AccessCompliancePolicy, isNeverBypassCode } from '../../src/security/compliance-policy.js';

describe('AccessCompliancePolicy', () => {
  const policy = new AccessCompliancePolicy();

  it('allows successful access without fallback or rotation', () => {
    expect(policy.decide({ code: 'HTTP_SUCCESS', accessClass: 'SUCCESS', retryable: false })).toEqual({
      action: 'ALLOW',
      reason: 'SUCCESS',
      retryable: false,
      allowBrowserFallback: false,
      allowProxyRotation: false
    });
  });

  it('allows only bounded retry for transient classes', () => {
    expect(policy.decide({ code: 'HTTP_SERVER_ERROR', accessClass: 'SERVER_ERROR', retryable: true })).toEqual({
      action: 'RETRY_BOUNDED',
      reason: 'TRANSIENT_RETRY',
      retryable: true,
      allowBrowserFallback: false,
      allowProxyRotation: false
    });
    expect(policy.decide({ code: 'HTTP_RATE_LIMITED', accessClass: 'RATE_LIMITED', retryable: false })).toMatchObject({
      action: 'TERMINAL_BLOCK',
      reason: 'CLIENT_ERROR',
      retryable: false
    });
  });

  it('terminally blocks authentication, anti-bot, policy and client barriers', () => {
    for (const accessClass of [
      'AUTHENTICATION_REQUIRED',
      'ANTI_BOT_BARRIER',
      'POLICY_BLOCKED',
      'CLIENT_ERROR'
    ] as const) {
      expect(policy.decide({ code: accessClass, accessClass, retryable: true })).toEqual({
        action: 'TERMINAL_BLOCK',
        reason: accessClass === 'AUTHENTICATION_REQUIRED'
          ? 'AUTHENTICATION_REQUIRED'
          : accessClass === 'ANTI_BOT_BARRIER'
            ? 'ANTI_BOT_BARRIER'
            : accessClass === 'POLICY_BLOCKED'
              ? 'POLICY_BLOCKED'
              : 'CLIENT_ERROR',
        retryable: false,
        allowBrowserFallback: false,
        allowProxyRotation: false
      });
    }
  });

  it('recognizes legacy and new never-bypass codes case-insensitively', () => {
    for (const code of [
      'CAPTCHA',
      'captcha_required',
      'HTTP_AUTH_REQUIRED',
      'HTTP_POLICY_BLOCKED',
      'PRIVATE_TARGET_BLOCKED'
    ]) {
      expect(isNeverBypassCode(code)).toBe(true);
    }
    expect(isNeverBypassCode('HTTP_CONTENT_INSUFFICIENT')).toBe(false);
  });
});
