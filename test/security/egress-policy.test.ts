import { describe, expect, it } from 'vitest';

import { assertSafeOutboundUrl, isPrivateHostname } from '../../src/security/egress-policy.js';


describe('egress policy', () => {
  it.each(['http://example.com/path', 'https://example.com/path'])('allows %s', (url) => {
    expect(assertSafeOutboundUrl(url, ['example.com'])).toMatchObject({
      hostname: 'example.com'
    });
  });

  it.each([
    ['ftp://example.com/file', 'TARGET_PROTOCOL_NOT_ALLOWED'],
    ['file:///etc/passwd', 'TARGET_PROTOCOL_NOT_ALLOWED'],
    ['https://user:password@example.com', 'TARGET_CREDENTIALS_IN_URL']
  ])('rejects unsafe URL %s with %s', (url, code) => {
    expect(() => assertSafeOutboundUrl(url)).toThrowError(expect.objectContaining({ code }));
  });

  it.each([
    ['localhost', 'LOCAL_HOSTNAME'],
    ['app.localhost', 'LOCAL_HOSTNAME'],
    ['127.0.0.1', 'PRIVATE_IPV4'],
    ['10.0.0.1', 'PRIVATE_IPV4'],
    ['172.16.0.1', 'PRIVATE_IPV4'],
    ['172.31.255.255', 'PRIVATE_IPV4'],
    ['192.168.1.1', 'PRIVATE_IPV4'],
    ['169.254.169.254', 'LINK_LOCAL_IPV4'],
    ['0.0.0.0', 'UNSPECIFIED_IPV4'],
    ['::1', 'LOOPBACK_IPV6'],
    ['::ffff:127.0.0.1', 'MAPPED_LOOPBACK_IPV6'],
    ['fc00::1', 'UNIQUE_LOCAL_IPV6'],
    ['fd12:3456::1', 'UNIQUE_LOCAL_IPV6'],
    ['fe80::1', 'LINK_LOCAL_IPV6'],
    ['metadata.google.internal', 'CLOUD_METADATA']
  ])('blocks private or metadata hostname %s (%s)', (hostname) => {
    expect(isPrivateHostname(hostname)).toBe(true);
    const url = hostname.includes(':') ? `http://[${hostname}]/` : `http://${hostname}/`;
    expect(() => assertSafeOutboundUrl(url)).toThrowError(
      expect.objectContaining({ code: 'PRIVATE_TARGET_BLOCKED' })
    );
  });

  it('blocks a host that is outside the configured allowlist', () => {
    expect(() => assertSafeOutboundUrl('https://example.org', ['example.com'])).toThrowError(
      expect.objectContaining({ code: 'TARGET_HOST_NOT_ALLOWED' })
    );
  });

  it('normalizes an allowlisted public URL without changing its security class', () => {
    expect(assertSafeOutboundUrl('https://Example.com:443/path', ['example.com'])).toEqual({
      url: 'https://example.com/path',
      protocol: 'https:',
      hostname: 'example.com',
      port: 443
    });
  });
});
