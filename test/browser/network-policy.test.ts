import { describe, expect, it } from 'vitest';

import {
  BrowserNetworkPolicy,
  type BrowserNetworkPolicyOptions
} from '../../src/browser/network-policy.js';

function options(overrides: Partial<BrowserNetworkPolicyOptions> = {}): BrowserNetworkPolicyOptions {
  return {
    allowedHosts: ['example.com'],
    allowedPorts: [443],
    allowedResourceTypes: ['document', 'script', 'stylesheet', 'image', 'font', 'xhr', 'fetch', 'media', 'other'],
    allowedContentTypes: ['text/html', 'application/javascript', 'application/json'],
    maxResponseBytes: 1_024,
    maxRedirects: 2,
    allowRedirects: true,
    ...overrides
  };
}

describe('BrowserNetworkPolicy', () => {
  it('allows an allowlisted HTTPS navigation and resource type', () => {
    const policy = new BrowserNetworkPolicy(options());

    expect(policy.checkRequest({
      url: 'https://example.com/products',
      resourceType: 'document',
      isNavigation: true
    })).toMatchObject({
      resourceType: 'document',
      url: { hostname: 'example.com', port: 443 }
    });
  });

  it('rejects private, non-allowlisted, wrong-port and disallowed resource targets', () => {
    const policy = new BrowserNetworkPolicy(options({
      allowedHosts: ['example.com', '127.0.0.1'],
      allowedPorts: [80, 443],
      allowedResourceTypes: ['document']
    }));

    expect(() => policy.checkRequest({ url: 'http://127.0.0.1/internal', resourceType: 'document' })).toThrowError(
      expect.objectContaining({ code: 'BROWSER_RESOURCE_PRIVATE_BLOCKED', retryable: false })
    );
    expect(() => policy.checkRequest({ url: 'https://other.example/path', resourceType: 'document' })).toThrowError(
      expect.objectContaining({ code: 'BROWSER_RESOURCE_HOST_NOT_ALLOWED', retryable: false })
    );
    expect(() => policy.checkRequest({ url: 'https://example.com:8443/path', resourceType: 'document' })).toThrowError(
      expect.objectContaining({ code: 'BROWSER_RESOURCE_PORT_NOT_ALLOWED', retryable: false })
    );
    expect(() => policy.checkRequest({ url: 'https://example.com/app.js', resourceType: 'script' })).toThrowError(
      expect.objectContaining({ code: 'BROWSER_RESOURCE_TYPE_NOT_ALLOWED', retryable: false })
    );
  });

  it('enforces content type and response byte limits', () => {
    const policy = new BrowserNetworkPolicy(options({ maxResponseBytes: 100 }));

    expect(() => policy.checkResponse({
      url: 'https://example.com/data',
      status: 200,
      contentType: 'application/xml',
      bodyBytes: 10
    })).toThrowError(expect.objectContaining({ code: 'BROWSER_RESPONSE_CONTENT_TYPE_NOT_ALLOWED' }));
    expect(() => policy.checkResponse({
      url: 'https://example.com/data',
      status: 200,
      contentType: 'application/json',
      bodyBytes: 101
    })).toThrowError(expect.objectContaining({ code: 'BROWSER_RESPONSE_TOO_LARGE', retryable: false }));
  });

  it('revalidates redirects and enforces redirect count', () => {
    const policy = new BrowserNetworkPolicy(options({ maxRedirects: 1 }));

    expect(policy.checkRedirect({ url: 'https://example.com/next', resourceType: 'document' }).url.hostname).toBe('example.com');
    expect(policy.redirects).toBe(1);
    expect(() => policy.checkRedirect({ url: 'https://example.com/final', resourceType: 'document' })).toThrowError(
      expect.objectContaining({ code: 'BROWSER_REDIRECT_LIMIT_EXCEEDED', retryable: false })
    );
    policy.resetRedirects();
    expect(policy.redirects).toBe(0);
  });

  it('rejects redirects when policy is disabled', () => {
    const policy = new BrowserNetworkPolicy(options({ allowRedirects: false }));

    expect(() => policy.checkRedirect({ url: 'https://example.com/next', resourceType: 'document' })).toThrowError(
      expect.objectContaining({ code: 'BROWSER_REDIRECT_NOT_ALLOWED', retryable: false })
    );
  });
});
