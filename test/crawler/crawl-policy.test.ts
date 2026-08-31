import { describe, expect, it } from 'vitest';

import { CrawlPolicyError, evaluateCrawlCandidate, parseRobotsRules } from '../../src/crawler/crawl-policy.js';

const robots = parseRobotsRules({
  userAgent: 'scraping-platform',
  text: `
    User-agent: *
    Disallow: /private
    Allow: /private/public

    User-agent: scraping-platform
    Disallow: /blocked
  `
});

const policy = {
  allowedHosts: ['example.com'],
  deniedHosts: ['denied.example.com'],
  allowedPathPrefixes: ['/catalog', '/private', '/blocked'],
  deniedPathPrefixes: ['/catalog/internal'],
  allowSubdomains: true,
  respectNoFollow: true,
  robotsRules: robots
};

describe('crawler candidate policy', () => {
  it('parses a bounded robots snapshot and applies longest matching path with Allow tie precedence', () => {
    expect(robots.allowPaths).toEqual(['/private/public']);
    expect(robots.disallowPaths).toEqual(['/blocked', '/private']);
    expect(robots.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(evaluateCrawlCandidate({ url: 'https://example.com/private/public/item' }, policy)).toMatchObject({ allowed: true, reason: 'ALLOWED', retryable: false, allowBypass: false });
    expect(evaluateCrawlCandidate({ url: 'https://example.com/private/secret' }, policy)).toMatchObject({ allowed: false, reason: 'ROBOTS_DISALLOWED', retryable: false, allowBypass: false });
  });

  it('fails closed for egress, host/path policy and nofollow restrictions without bypass behavior', () => {
    expect(evaluateCrawlCandidate({ url: 'http://127.0.0.1:8080/private' }, policy).reason).toBe('UNSAFE_TARGET');
    expect(evaluateCrawlCandidate({ url: 'https://other.example.net/catalog' }, policy).reason).toBe('HOST_NOT_ALLOWLISTED');
    expect(evaluateCrawlCandidate({ url: 'https://denied.example.com/catalog' }, policy).reason).toBe('DENYLIST_HOST');
    expect(evaluateCrawlCandidate({ url: 'https://shop.example.com/catalog/internal' }, policy).reason).toBe('DENYLIST_PATH');
    expect(evaluateCrawlCandidate({ url: 'https://shop.example.com/catalog', noFollow: true }, policy).reason).toBe('NOFOLLOW');
  });

  it('rejects empty/unsafe policy rule inputs and bounded robots failures', () => {
    expect(() => evaluateCrawlCandidate({ url: 'https://example.com/catalog' }, { allowedHosts: [] })).toThrow(CrawlPolicyError);
    expect(() => evaluateCrawlCandidate({ url: 'https://example.com/catalog' }, { allowedHosts: ['example.com'], deniedPathPrefixes: ['not-a-path'] })).toThrow(CrawlPolicyError);
    expect(() => parseRobotsRules({ userAgent: 'bot', text: `User-agent: *\nDisallow: ${'x'.repeat(2_000)}` })).toThrow(CrawlPolicyError);
  });
});
