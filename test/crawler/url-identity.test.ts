import { describe, expect, it } from 'vitest';

import { canonicalizeCrawlUrl, UrlIdentityError } from '../../src/crawler/url-identity.js';

describe('canonicalizeCrawlUrl', () => {
  it('normalizes safe web-standard URL equivalences deterministically', () => {
    const first = canonicalizeCrawlUrl('HTTPS://Example.COM:443/catalog?b=2&a=1#section');
    const second = canonicalizeCrawlUrl('https://example.com/catalog?a=1&b=2');

    expect(first.canonicalUrl).toBe('https://example.com/catalog?a=1&b=2');
    expect(second).toEqual(first);
    expect(first.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('removes only explicitly configured query parameters and preserves all other semantics', () => {
    const result = canonicalizeCrawlUrl('https://example.com/search?q=shoes&utm_source=newsletter&sort=price', {
      ignoredQueryParamNames: ['utm_source']
    });

    expect(result.canonicalUrl).toBe('https://example.com/search?q=shoes&sort=price');
    expect(canonicalizeCrawlUrl('https://example.com/search?q=shoes&utm_source=newsletter&sort=price').canonicalUrl)
      .toContain('utm_source=newsletter');
  });

  it('rejects unsafe targets and invalid ignore parameter configuration without network access', () => {
    expect(() => canonicalizeCrawlUrl('http://127.0.0.1:8080/private')).toThrow(UrlIdentityError);
    expect(() => canonicalizeCrawlUrl('https://user:password@example.com/private')).toThrow(UrlIdentityError);
    expect(() => canonicalizeCrawlUrl('https://example.com', { ignoredQueryParamNames: ['bad key'] })).toThrow(UrlIdentityError);
  });
});
