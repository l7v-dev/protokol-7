import { describe, expect, it } from 'vitest';

import { ProxyHealthError, ProxyHealthRegistry } from '../../src/proxy/health.js';

function sample(overrides: Partial<Parameters<ProxyHealthRegistry['record']>[0]> = {}) {
  return {
    providerId: 'provider_test',
    proxyId: 'proxy_1',
    success: true,
    latencyMs: 100,
    occurredAt: new Date('2026-08-26T00:00:00.000Z'),
    ...overrides
  };
}

describe('ProxyHealthRegistry', () => {
  it('computes provider and proxy success/latency scores from bounded windows', () => {
    const registry = new ProxyHealthRegistry({
      windowSize: 4,
      minSamples: 2,
      minSuccessRate: 0.75,
      minScore: 0.7,
      latencyReferenceMs: 500
    });
    registry.record(sample({ proxyId: undefined, success: true, latencyMs: 100 }));
    registry.record(sample({ proxyId: undefined, success: true, latencyMs: 200 }));
    registry.record(sample({ proxyId: undefined, success: true, latencyMs: 300 }));
    registry.record(sample({ proxyId: undefined, success: false, latencyMs: 700, failureClass: 'PROVIDER_TRANSPORT_FAILED' }));

    const provider = registry.providerScore('provider_test');
    expect(provider).toMatchObject({
      scope: 'provider',
      sampleCount: 4,
      successCount: 3,
      failureCount: 1,
      successRate: 0.75,
      healthy: true,
      quarantineRecommended: false
    });
    expect(provider.averageLatencyMs).toBe(325);
    expect(provider.score).toBeGreaterThan(0.7);

    registry.record(sample({ success: true, latencyMs: 50 }));
    const proxy = registry.proxyScore('provider_test', 'proxy_1');
    expect(proxy).toMatchObject({
      scope: 'proxy',
      proxyId: 'proxy_1',
      sampleCount: 1,
      successRate: 1,
      healthy: false,
      quarantineRecommended: false
    });
  });

  it('recommends quarantine after unhealthy bounded sample window', () => {
    const registry = new ProxyHealthRegistry({
      windowSize: 3,
      minSamples: 2,
      minSuccessRate: 0.8,
      minScore: 0.7,
      latencyReferenceMs: 500
    });
    registry.record(sample({ proxyId: 'proxy_bad', success: false, latencyMs: 2_000 }));
    registry.record(sample({ proxyId: 'proxy_bad', success: false, latencyMs: 2_000 }));

    expect(registry.proxyScore('provider_test', 'proxy_bad')).toMatchObject({
      healthy: false,
      quarantineRecommended: true,
      successRate: 0,
      failureCount: 2
    });
  });

  it('keeps window size bounded, exposes last sample time and clears a scope', () => {
    const registry = new ProxyHealthRegistry({
      windowSize: 2,
      minSamples: 1,
      minSuccessRate: 0.5,
      minScore: 0,
      latencyReferenceMs: 500
    });
    registry.record(sample({ proxyId: 'proxy_window', success: false, occurredAt: new Date('2026-08-26T00:00:00.000Z') }));
    registry.record(sample({ proxyId: 'proxy_window', success: false, occurredAt: new Date('2026-08-26T00:01:00.000Z') }));
    registry.record(sample({ proxyId: 'proxy_window', success: true, occurredAt: new Date('2026-08-26T00:02:00.000Z') }));

    const score = registry.proxyScore('provider_test', 'proxy_window');
    expect(score.sampleCount).toBe(2);
    expect(score.successCount).toBe(1);
    expect(score.lastSampleAt).toEqual(new Date('2026-08-26T00:02:00.000Z'));
    registry.clear('provider_test', 'proxy_window');
    expect(registry.proxyScore('provider_test', 'proxy_window').sampleCount).toBe(0);
  });

  it('rejects invalid samples and invalid configuration', () => {
    expect(() => new ProxyHealthRegistry({
      windowSize: 0,
      minSamples: 1,
      minSuccessRate: 0.5,
      minScore: 0.5,
      latencyReferenceMs: 500
    })).toThrow();

    const registry = new ProxyHealthRegistry({
      windowSize: 2,
      minSamples: 1,
      minSuccessRate: 0.5,
      minScore: 0.5,
      latencyReferenceMs: 500
    });
    expect(() => registry.record(sample({ latencyMs: -1 }))).toThrowError(
      expect.objectContaining({ code: 'PROXY_HEALTH_SAMPLE_INVALID', retryable: false })
    );
    expect(new ProxyHealthError('PROXY_HEALTH_NOT_FOUND', 'not found', false).name).toBe('ProxyHealthError');
  });
});
