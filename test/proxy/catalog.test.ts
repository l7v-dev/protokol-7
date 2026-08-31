import { describe, expect, it } from 'vitest';

import {
  ProxyCatalog,
  type ProxyCatalogEntry,
  type ProxyRequirement
} from '../../src/proxy/catalog.js';

function entry(overrides: Partial<ProxyCatalogEntry> = {}): ProxyCatalogEntry {
  return {
    proxyId: 'proxy_1',
    providerId: 'provider_test',
    providerVersion: '1.0.0',
    endpointHost: 'proxy.example.com',
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
      maxLeaseSeconds: 300,
      metering: { request: true, bytes: true, lease: true }
    },
    updatedAt: new Date('2026-08-26T00:00:00.000Z'),
    ...overrides
  };
}

function requirement(overrides: Partial<ProxyRequirement> = {}): ProxyRequirement {
  return {
    tenantId: 'tenant_1',
    targetId: 'target_1',
    protocol: 'https',
    allowedClasses: ['residential'],
    allowedCountries: ['TR'],
    allowedRegions: ['Marmara'],
    requireStickySession: true,
    requireRotation: true,
    ...overrides
  };
}

describe('ProxyCatalog', () => {
  it('selects deterministic eligible proxy entries without exposing mutable state', () => {
    const catalog = new ProxyCatalog();
    catalog.upsert(entry({ proxyId: 'proxy_b' }));
    catalog.upsert(entry({ proxyId: 'proxy_a' }));

    const selected = catalog.select(requirement());
    expect(selected.proxyId).toBe('proxy_a');
    selected.capability.protocols.push('http');
    expect(catalog.get('proxy_a')?.capability.protocols).toEqual(['https']);
    expect(catalog.size).toBe(2);
  });

  it('filters protocol, class, geo, sticky, rotation and status requirements', () => {
    const catalog = new ProxyCatalog();
    catalog.upsert(entry({ proxyId: 'residential_tr' }));
    catalog.upsert(entry({
      proxyId: 'datacenter_de',
      proxyClass: 'datacenter',
      country: 'DE',
      region: 'Berlin',
      capability: {
        ...entry().capability,
        proxyClasses: ['datacenter'],
        countries: ['DE'],
        regions: ['Berlin'],
        supportsStickySession: false,
        supportsRotation: false
      }
    }));
    catalog.upsert(entry({ proxyId: 'quarantined', status: 'QUARANTINED' }));

    expect(catalog.listEligible(requirement()).map((candidate) => candidate.proxyId)).toEqual(['residential_tr']);
    expect(catalog.listEligible(requirement({ requireStickySession: false, requireRotation: false, allowedCountries: ['DE'], allowedRegions: ['Berlin'], allowedClasses: ['datacenter'] })).map((candidate) => candidate.proxyId)).toEqual(['datacenter_de']);
    expect(catalog.listEligible(requirement({ requireStickySession: false, requireRotation: false, allowedCountries: ['TR'], allowedRegions: ['Marmara'], allowedClasses: ['residential'] })).map((candidate) => candidate.proxyId)).toEqual(['residential_tr']);
  });

  it('returns no eligible proxy for incompatible requirements and protects invalid entries', () => {
    const catalog = new ProxyCatalog();
    catalog.upsert(entry());
    expect(() => catalog.select(requirement({ protocol: 'http' }))).toThrowError(
      expect.objectContaining({ code: 'NO_ELIGIBLE_PROXY', retryable: false })
    );
    expect(() => catalog.upsert(entry({ endpointHost: 'user:secret@proxy.example.com' }))).toThrowError(
      expect.objectContaining({ code: 'PROXY_ENTRY_INVALID', retryable: false })
    );
    expect(() => catalog.upsert(entry({ endpointPort: 70_000 }))).toThrowError(
      expect.objectContaining({ code: 'PROXY_ENTRY_INVALID', retryable: false })
    );
    expect(() => catalog.setStatus('missing', 'DISABLED')).toThrowError(
      expect.objectContaining({ code: 'PROXY_ENTRY_NOT_FOUND', retryable: false })
    );
  });

  it('supports catalog status changes while retaining policy metadata', () => {
    const catalog = new ProxyCatalog();
    catalog.upsert(entry());
    expect(catalog.setStatus('proxy_1', 'QUARANTINED').status).toBe('QUARANTINED');
    expect(catalog.listEligible(requirement())).toHaveLength(0);
    expect(catalog.setStatus('proxy_1', 'AVAILABLE').status).toBe('AVAILABLE');
    expect(catalog.select(requirement()).country).toBe('TR');
  });
});
