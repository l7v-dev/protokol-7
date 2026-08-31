import { describe, expect, it } from 'vitest';

import { assertSafeOutboundUrl, isPrivateHostname } from '../../src/security/egress-policy.js';
import { redactSecrets } from '../../src/security/redaction.js';


describe('security controls', () => {
  it('redacts secret-like fields recursively', () => {
    const sanitized = redactSecrets({
      authorization: 'Bearer raw-token',
      nested: {
        password: 'raw-password',
        cookie: 'raw-cookie',
        publicValue: 'keep'
      },
      items: [{ token: 'raw-token-2' }]
    });

    expect(sanitized).toEqual({
      authorization: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        cookie: '[REDACTED]',
        publicValue: 'keep'
      },
      items: [{ token: '[REDACTED]' }]
    });
  });

  it('recognizes private, loopback and metadata hostnames', () => {
    expect(isPrivateHostname('127.0.0.1')).toBe(true);
    expect(isPrivateHostname('10.0.0.1')).toBe(true);
    expect(isPrivateHostname('192.168.1.10')).toBe(true);
    expect(isPrivateHostname('metadata.google.internal')).toBe(true);
    expect(isPrivateHostname('example.com')).toBe(false);
  });

  it('rejects unsafe outbound URLs before network access', () => {
    expect(() => assertSafeOutboundUrl('http://127.0.0.1:8080/admin')).toThrow('Private');
    expect(() => assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).toThrow('Private');
    expect(() => assertSafeOutboundUrl('https://user:password@example.com')).toThrow('kullanıcı');
    expect(() => assertSafeOutboundUrl('https://example.org', ['example.com'])).toThrow('allowlist');
  });

  it('returns normalized safe public URL metadata', () => {
    expect(assertSafeOutboundUrl('https://Example.com/path', ['example.com'])).toMatchObject({
      protocol: 'https:',
      hostname: 'example.com',
      port: 443
    });
  });
});
