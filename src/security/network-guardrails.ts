import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

import { assertSafeOutboundUrl } from './egress-policy.js';

export const NETWORK_GUARDRAILS_CONTRACT_VERSION = 'network-guardrails/v1' as const;

export type GuardedDestination = { destinationKind: 'FETCH' | 'WEBHOOK'; destinationFingerprintSha256: string; protocol: 'http:' | 'https:'; port: number; redirectDepth: number; allowNetworkDispatch: false; allowBypass: false };

export class NetworkGuardrailError extends Error {
  public constructor(public readonly code: 'NETWORK_GUARDRAIL_INVALID' | 'NETWORK_GUARDRAIL_DESTINATION_REJECTED' | 'NETWORK_GUARDRAIL_REDIRECT_REJECTED', message: string) {
    super(message);
    this.name = 'NetworkGuardrailError';
  }
}

const MAX_REDIRECT_DEPTH = 5;
const SAFE_HOST = /^[A-Za-z0-9.-]{1,253}$/;
const SENSITIVE_QUERY_KEY = /authorization|cookie|credential|password|secret|token|session|api[_-]?key/i;

/**
 * Validates outbound fetch or webhook destinations without dispatching a
 * request. It wraps the existing private/loopback/link-local guardrail with a
 * closed host allowlist, public-host/IP prohibition, secret-bearing query ban,
 * webhook HTTPS-only transport, default-port restriction and bounded redirect
 * depth. No raw URL or query value is returned.
 */
export function evaluateNetworkDestination(input: { destinationKind: 'FETCH' | 'WEBHOOK'; destinationUrl: string; allowedHosts: ReadonlyArray<string>; redirectDepth: number }): GuardedDestination {
  if (!isKind(input.destinationKind) || !Number.isInteger(input.redirectDepth) || input.redirectDepth < 0 || input.redirectDepth > MAX_REDIRECT_DEPTH || !validHosts(input.allowedHosts)) throw invalid();
  if (input.allowedHosts.length === 0) throw rejected('Destination allowlist zorunludur.');
  let parsed: URL;
  try {
    parsed = new URL(input.destinationUrl);
  } catch {
    throw rejected('Destination URL geçerli değil.');
  }
  if ([...parsed.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key))) throw rejected('Secret-bearing query parametreleri destination URL içinde kullanılamaz.');
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(hostname)) throw rejected('Doğrudan IP destination kabul edilmez.');
  if (input.destinationKind === 'WEBHOOK' && parsed.protocol !== 'https:') throw rejected('Webhook destination yalnızca HTTPS olabilir.');
  let safe: ReturnType<typeof assertSafeOutboundUrl>;
  try {
    safe = assertSafeOutboundUrl(input.destinationUrl, [...input.allowedHosts]);
  } catch {
    throw rejected('Destination egress policy tarafından reddedildi.');
  }
  const defaultPort = safe.protocol === 'https:' ? 443 : 80;
  if (safe.port !== defaultPort) throw rejected('Yalnızca protocol varsayılan portu kullanılabilir.');
  return {
    destinationKind: input.destinationKind,
    destinationFingerprintSha256: createHash('sha256').update(`${safe.protocol}//${safe.hostname}:${safe.port}`).digest('hex'),
    protocol: safe.protocol, port: safe.port, redirectDepth: input.redirectDepth,
    allowNetworkDispatch: false, allowBypass: false
  };
}

export function validateRedirectChain(input: { original: Omit<Parameters<typeof evaluateNetworkDestination>[0], 'redirectDepth'>; redirects: ReadonlyArray<string> }): ReadonlyArray<GuardedDestination> {
  if (input.redirects.length > MAX_REDIRECT_DEPTH) throw new NetworkGuardrailError('NETWORK_GUARDRAIL_REDIRECT_REJECTED', 'Redirect chain maksimum sınırı aşıyor.');
  return input.redirects.map((destinationUrl, index) => evaluateNetworkDestination({ ...input.original, destinationUrl, redirectDepth: index + 1 }));
}

function validHosts(hosts: ReadonlyArray<string>): boolean {
  return hosts.length <= 100 && hosts.every((host) => SAFE_HOST.test(host) && !host.includes('..') && !isIP(host));
}

function isKind(value: string): value is GuardedDestination['destinationKind'] {
  return value === 'FETCH' || value === 'WEBHOOK';
}

function rejected(message: string): NetworkGuardrailError {
  return new NetworkGuardrailError('NETWORK_GUARDRAIL_DESTINATION_REJECTED', message);
}

function invalid(): NetworkGuardrailError {
  return new NetworkGuardrailError('NETWORK_GUARDRAIL_INVALID', 'Network guardrail input geçerli değil.');
}
