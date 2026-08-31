import { describe, expect, it } from 'vitest';

import { evaluateNetworkDestination, NetworkGuardrailError, validateRedirectChain } from '../../src/security/network-guardrails.js';

const allowedHosts = ['api.example.com', 'hooks.example.com'];

describe('fail-closed SSRF, egress, redirect and webhook destination guardrails', () => {
  it('returns only a destination fingerprint and no-dispatch flags for an allowlisted public destination', () => {
    const result = evaluateNetworkDestination({ destinationKind: 'FETCH', destinationUrl: 'https://api.example.com/v1/items?cursor=next', allowedHosts, redirectDepth: 0 });
    expect(result).toMatchObject({ destinationKind: 'FETCH', protocol: 'https:', port: 443, redirectDepth: 0, allowNetworkDispatch: false, allowBypass: false });
    expect(result.destinationFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain('api.example.com');
  });

  it('requires HTTPS for webhooks and applies the same allowlist/private/IP/query/port rules to fetch and redirect destinations', () => {
    expect(() => evaluateNetworkDestination({ destinationKind: 'WEBHOOK', destinationUrl: 'http://hooks.example.com/event', allowedHosts, redirectDepth: 0 })).toThrow(NetworkGuardrailError);
    expect(() => evaluateNetworkDestination({ destinationKind: 'FETCH', destinationUrl: 'https://127.0.0.1/a', allowedHosts, redirectDepth: 0 })).toThrow(NetworkGuardrailError);
    expect(() => evaluateNetworkDestination({ destinationKind: 'FETCH', destinationUrl: 'https://api.example.com/a?token=raw-value', allowedHosts, redirectDepth: 0 })).toThrow(NetworkGuardrailError);
    expect(() => evaluateNetworkDestination({ destinationKind: 'FETCH', destinationUrl: 'https://api.example.com:8443/a', allowedHosts, redirectDepth: 0 })).toThrow(NetworkGuardrailError);
    expect(validateRedirectChain({ original: { destinationKind: 'FETCH', allowedHosts }, redirects: ['https://api.example.com/a', 'https://hooks.example.com/b'] })).toHaveLength(2);
  });

  it('rejects empty/unsafe allowlists and redirect chains above the fixed maximum fail-closed', () => {
    expect(() => evaluateNetworkDestination({ destinationKind: 'FETCH', destinationUrl: 'https://api.example.com/a', allowedHosts: [], redirectDepth: 0 })).toThrow(NetworkGuardrailError);
    expect(() => evaluateNetworkDestination({ destinationKind: 'FETCH', destinationUrl: 'https://api.example.com/a', allowedHosts: ['localhost'], redirectDepth: 0 })).toThrow(NetworkGuardrailError);
    expect(() => validateRedirectChain({ original: { destinationKind: 'FETCH', allowedHosts }, redirects: Array.from({ length: 6 }, () => 'https://api.example.com/a') })).toThrow(NetworkGuardrailError);
  });
});
