import type { AccessResultClass } from '../http/reliability.js';

export type ComplianceAction = 'ALLOW' | 'RETRY_BOUNDED' | 'TERMINAL_BLOCK';

export type ComplianceDecision = {
  action: ComplianceAction;
  reason: 'SUCCESS' | 'TRANSIENT_RETRY' | 'AUTHENTICATION_REQUIRED' | 'ANTI_BOT_BARRIER' | 'POLICY_BLOCKED' | 'CLIENT_ERROR';
  retryable: boolean;
  allowBrowserFallback: boolean;
  allowProxyRotation: boolean;
};

export type ComplianceInput = {
  code: string;
  accessClass: AccessResultClass;
  retryable: boolean;
};

const NEVER_BYPASS_CODES = new Set([
  'HTTP_401_UNAUTHORIZED',
  'HTTP_AUTH_REQUIRED',
  'HTTP_PROXY_AUTH_REQUIRED',
  'HTTP_403_FORBIDDEN',
  'HTTP_CLIENT_ERROR',
  'HTTP_POLICY_BLOCKED',
  'HTTP_RATE_LIMITED',
  'PRIVATE_TARGET_BLOCKED',
  'POLICY_VIOLATION',
  'CREDENTIAL_ERROR',
  'CAPTCHA',
  'CAPTCHA_REQUIRED',
  'ANTI_BOT',
  'HTTP_ANTI_BOT_BARRIER'
]);

/**
 * Compliance decision boundary. It produces a bounded action recommendation;
 * it never performs a browser/proxy bypass or changes a target policy.
 */
export class AccessCompliancePolicy {
  public decide(input: ComplianceInput): ComplianceDecision {
    if (input.accessClass === 'SUCCESS') {
      return {
        action: 'ALLOW',
        reason: 'SUCCESS',
        retryable: false,
        allowBrowserFallback: false,
        allowProxyRotation: false
      };
    }
    if (input.accessClass === 'AUTHENTICATION_REQUIRED') {
      return terminal('AUTHENTICATION_REQUIRED');
    }
    if (input.accessClass === 'ANTI_BOT_BARRIER') {
      return terminal('ANTI_BOT_BARRIER');
    }
    if (input.accessClass === 'POLICY_BLOCKED') {
      return terminal('POLICY_BLOCKED');
    }
    if (input.accessClass === 'CLIENT_ERROR') {
      return terminal('CLIENT_ERROR');
    }
    if (input.retryable) {
      return {
        action: 'RETRY_BOUNDED',
        reason: 'TRANSIENT_RETRY',
        retryable: true,
        allowBrowserFallback: false,
        allowProxyRotation: false
      };
    }
    return terminal('CLIENT_ERROR');
  }
}

export function isNeverBypassCode(code: string): boolean {
  return NEVER_BYPASS_CODES.has(code.trim().toUpperCase());
}

function terminal(reason: Exclude<ComplianceDecision['reason'], 'SUCCESS' | 'TRANSIENT_RETRY'>): ComplianceDecision {
  return {
    action: 'TERMINAL_BLOCK',
    reason,
    retryable: false,
    allowBrowserFallback: false,
    allowProxyRotation: false
  };
}
