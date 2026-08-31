import { describe, expect, it } from 'vitest';

import { ProxyCatalog, type ProxyCatalogEntry, type ProxyRequirement } from '../../src/proxy/catalog.js';
import { ProxyHealthRegistry } from '../../src/proxy/health.js';
import { ProxySelectionError, ProxySelectionPolicy } from '../../src/proxy/selection.js';

function entry(proxyId: string, providerId: string, overrides: Partial<ProxyCatalogEntry> = {}): ProxyCatalogEntry {
  return {
    proxyId,
    providerId,
    providerVersion: '1.0.0',
    endpointHost: `${proxyId}.example.com`,
    endpointPort: 443,
    protocol: 'https',
    proxyClass: 'residential',
    country: 'TR',
    region: 'Marmara',
    status: 'AVAILABLE',
    capability: {
      protocols: ['https'],
      proxyClasses: ['residential'],
      countries: ['TR'],
      regions: ['Marmara'],
      supportsStickySession: true,
      supportsRotation: true,
      metering: { request: true, bytes: true, lease: true }
    },
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
    ...overrides
  };
}

const requirement: ProxyRequirement = {
  tenantId: 'tenant_1',
  targetId: 'target_1',
  protocol: 'https',
  allowedClasses: ['residential'],
  allowedCountries: ['TR'],
  allowedRegions: ['Marmara'],
  requireStickySession: true,
  requireRotation: true
};

describe('ProxySelectionPolicy', () => {
  it('selects healthy and lower-cost candidates deterministically with explainable reasons', () => {
    const catalog = new ProxyCatalog();
    catalog.upsert(entry('proxy_a', 'provider_a'));
    catalog.upsert(entry('proxy_b', 'provider_b'));
    const health = new ProxyHealthRegistry({
      windowSize: 4,
      minSamples: 1,
      minSuccessRate: 0.5,
      minScore: 0.5,
      latencyReferenceMs: 500
    });
    health.record({ providerId: 'provider_a', proxyId: 'proxy_a', success: true, latencyMs: 100, occurredAt: new Date() });
    health.record({ providerId: 'provider_b', proxyId: 'proxy_b', success: true, latencyMs: 2_000, occurredAt: new Date() });
    const policy = new ProxySelectionPolicy(catalog, health, new Map([
      ['provider_a', { currency: 'USD', requestCents: 2, bytesCentsPerGb: 1, leaseCentsPerHour: 1 }],
      ['provider_b', { currency: 'USD', requestCents: 1, bytesCentsPerGb: 1, leaseCentsPerHour: 1 }]
    ]));

    const decision = policy.select({
      requirement,
      estimatedRequests: 2,
      estimatedBytes: 1024,
      estimatedLeaseSeconds: 60
    });
    expect(decision.selected.proxyId).toBe('proxy_a');
    expect(decision.candidate.reasons).toEqual(expect.arrayContaining([
      'geo_TR_Marmara',
      'class_residential'
    ]));
    expect(decision.considered).toHaveLength(2);
  });

  it('excludes quarantine-recommended candidates and uses proxy id as tie-breaker', () => {
    const catalog = new ProxyCatalog();
    catalog.upsert(entry('proxy_b', 'provider_test'));
    catalog.upsert(entry('proxy_a', 'provider_test'));
    catalog.upsert(entry('proxy_bad', 'provider_test'));
    const health = new ProxyHealthRegistry({
      windowSize: 2,
      minSamples: 1,
      minSuccessRate: 0.5,
      minScore: 0.5,
      latencyReferenceMs: 500
    });
    health.record({ providerId: 'provider_test', proxyId: 'proxy_bad', success: false, latencyMs: 2_000, occurredAt: new Date() });
    const policy = new ProxySelectionPolicy(catalog, health, new Map(), {
      healthWeight: 1,
      costWeight: 0,
      excludeQuarantineRecommended: true
    });

    const decision = policy.select({
      requirement,
      estimatedRequests: 1,
      estimatedBytes: 0,
      estimatedLeaseSeconds: 1
    });
    expect(decision.selected.proxyId).toBe('proxy_a');
    expect(decision.considered.map((candidate) => candidate.proxyId)).toEqual(['proxy_a', 'proxy_b']);
  });

  it('fails when every eligible candidate is unhealthy or request estimates are invalid', () => {
    const catalog = new ProxyCatalog();
    catalog.upsert(entry('proxy_bad', 'provider_test'));
    const health = new ProxyHealthRegistry({
      windowSize: 2,
      minSamples: 1,
      minSuccessRate: 0.9,
      minScore: 0.9,
      latencyReferenceMs: 500
    });
    health.record({ providerId: 'provider_test', proxyId: 'proxy_bad', success: false, latencyMs: 2_000, occurredAt: new Date() });
    const policy = new ProxySelectionPolicy(catalog, health, new Map());

    expect(() => policy.select({
      requirement,
      estimatedRequests: 1,
      estimatedBytes: 0,
      estimatedLeaseSeconds: 1
    })).toThrowError(expect.objectContaining({ code: 'NO_HEALTHY_PROXY', retryable: false }));
    expect(() => policy.select({
      requirement,
      estimatedRequests: 0,
      estimatedBytes: 0,
      estimatedLeaseSeconds: 1
    })).toThrowError(expect.objectContaining({ code: 'PROXY_SELECTION_INVALID', retryable: false }));
    expect(new ProxySelectionError('PROXY_SELECTION_INVALID', 'invalid', false).name).toBe('ProxySelectionError');
  });
});
