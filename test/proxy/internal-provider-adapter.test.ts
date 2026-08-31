import { describe, expect, it, vi } from 'vitest';

import {
  INTERNAL_PROVIDER_ADAPTER_CONTRACT_VERSION,
  InternalProviderAdapter,
  InternalProviderAdapterError
} from '../../src/proxy/internal-provider-adapter.js';
import type { ProxyAcquireRequest, ProxyCapability } from '../../src/proxy/contracts.js';

const capability: ProxyCapability = {
  protocols: ['https'],
  proxyClasses: ['residential'],
  countries: ['TR'],
  regions: ['Marmara'],
  supportsStickySession: true,
  supportsRotation: true,
  maxLeaseSeconds: 300,
  metering: { request: true, bytes: true, lease: true }
};

function request(overrides: Partial<ProxyAcquireRequest> = {}): ProxyAcquireRequest {
  return {
    providerId: 'internal_provider',
    tenantId: 'tenant_1',
    projectId: 'project_1',
    targetId: 'target_1',
    jobId: 'job_1',
    taskId: 'task_1',
    attemptId: 'attempt_1',
    protocol: 'https',
    proxyClass: 'residential',
    country: 'TR',
    region: 'Marmara',
    leaseExpiresAt: new Date('2026-08-27T00:04:00.000Z'),
    correlationId: 'correlation_1',
    ...overrides
  };
}

function adapter() {
  const now = vi.fn().mockReturnValue(new Date('2026-08-27T00:00:00.000Z'));
  return new InternalProviderAdapter({ capability, now });
}

describe('InternalProviderAdapter', () => {
  it('implements the provider interface through a deterministic local test double and refuses every external execution path', async () => {
    const instance = adapter();
    const returnedCapability = await instance.capabilities();
    returnedCapability.protocols.push('http');
    const health = await instance.health();
    const lease = await instance.acquire(request());

    expect(instance.executionBoundary).toEqual({
      contractVersion: INTERNAL_PROVIDER_ADAPTER_CONTRACT_VERSION,
      executionMode: 'LOCAL_TEST_DOUBLE',
      allowsExternalProviderCall: false,
      allowsProviderActivation: false,
      allowsCredentialMaterial: false
    });
    expect((await instance.capabilities()).protocols).toEqual(['https']);
    expect(health).toMatchObject({ providerId: 'internal_provider', healthy: true });
    expect(lease).toMatchObject({ providerId: 'internal_provider', tenantId: 'tenant_1', endpointHost: 'internal.provider.invalid', status: 'ACTIVE' });
  });

  it('preserves provider and tenant lease isolation while rejecting cross-tenant or mismatched-provider lifecycle operations', async () => {
    const instance = adapter();
    await expect(instance.acquire(request({ providerId: 'another_provider' }))).rejects.toMatchObject({ code: 'PROVIDER_POLICY_REFUSED', retryable: false });
    const lease = await instance.acquire(request());
    await expect(instance.release({ ...lease, tenantId: 'tenant_2' })).rejects.toMatchObject({ code: 'PROXY_LEASE_NOT_FOUND', retryable: false });
    await instance.quarantine(lease, 'POLICY');
    const rotated = await instance.rotate(lease, request({ attemptId: 'attempt_2' }));
    expect(rotated).toMatchObject({ tenantId: 'tenant_1', attemptId: 'attempt_2', status: 'ACTIVE' });
  });

  it('injects bounded deterministic failure without storing external-provider material in its observable control plane', async () => {
    const instance = adapter();
    instance.failNext('acquire', { code: 'PROXY_ACQUIRE_TIMEOUT', message: 'local timeout', retryable: true });
    await expect(instance.acquire(request())).rejects.toMatchObject({ code: 'PROXY_ACQUIRE_TIMEOUT', retryable: true });
    await instance.acquire(request());
    const observable = JSON.stringify({ boundary: instance.executionBoundary, calls: instance.calls });
    expect(observable).not.toContain('credential');
    expect(observable).not.toContain('token');
    expect(observable).not.toContain('endpoint');
    expect(observable).not.toContain('account');
  });

  it('fails closed when adapter identifiers are not safe bounded IDs', () => {
    expect(() => new InternalProviderAdapter({ capability, providerId: 'internal provider' })).toThrow(InternalProviderAdapterError);
    expect(() => new InternalProviderAdapter({ capability, version: 'version/1' })).toThrow(InternalProviderAdapterError);
  });
});
