import { describe, expect, it, vi } from 'vitest';

import { FakeProxyProvider } from '../../src/proxy/fake-provider.js';
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
    providerId: 'provider_fake',
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
    leaseExpiresAt: new Date('2026-08-26T00:04:00.000Z'),
    correlationId: 'correlation_1',
    ...overrides
  };
}

function provider() {
  const now = vi.fn().mockReturnValue(new Date('2026-08-26T00:00:00.000Z'));
  return {
    now,
    instance: new FakeProxyProvider({ capability, now })
  };
}

describe('FakeProxyProvider', () => {
  it('implements capability, health and lease contract without exposing mutable state', async () => {
    const fixture = provider();
    const returnedCapability = await fixture.instance.capabilities();
    returnedCapability.protocols.push('http');
    const returnedHealth = await fixture.instance.health();
    const lease = await fixture.instance.acquire(request());

    expect((await fixture.instance.capabilities()).protocols).toEqual(['https']);
    expect(returnedHealth).toMatchObject({ providerId: 'provider_fake', providerVersion: 'fake-1.0.0', healthy: true });
    expect(lease).toMatchObject({
      providerId: 'provider_fake',
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      status: 'ACTIVE'
    });
    expect(lease.meterReference).toMatch(/^meter:[a-f0-9]{24}$/);
    expect(lease.meterReference).not.toContain('tenant_1');
  });

  it('rejects provider, capability and lease duration mismatches as terminal policy errors', async () => {
    const fixture = provider();

    await expect(fixture.instance.acquire(request({ providerId: 'provider_other' }))).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_REFUSED',
      retryable: false
    });
    await expect(fixture.instance.acquire(request({ protocol: 'http' }))).rejects.toMatchObject({
      code: 'PROXY_CAPABILITY_MISMATCH',
      retryable: false
    });
    await expect(fixture.instance.acquire(request({ leaseExpiresAt: new Date('2026-08-26T00:06:00.000Z') }))).rejects.toMatchObject({
      code: 'PROXY_CAPABILITY_MISMATCH',
      retryable: false
    });
  });

  it('supports release, quarantine and rotation while preserving provider scope', async () => {
    const fixture = provider();
    const lease = await fixture.instance.acquire(request());
    await fixture.instance.quarantine(lease, 'PROVIDER_FAILURE');
    const rotated = await fixture.instance.rotate(lease, request({ attemptId: 'attempt_2' }));

    expect(rotated.leaseId).not.toBe(lease.leaseId);
    expect(rotated.attemptId).toBe('attempt_2');
    await fixture.instance.release(rotated);
    await expect(fixture.instance.release(rotated)).rejects.toMatchObject({
      code: 'PROXY_LEASE_NOT_FOUND',
      retryable: false
    });
    expect(fixture.instance.calls.map((call) => call.operation)).toEqual(['acquire', 'quarantine', 'rotate', 'release', 'release']);
  });

  it('injects bounded retryable failure and then recovers deterministically', async () => {
    const fixture = provider();
    fixture.instance.failNext('acquire', {
      code: 'PROXY_ACQUIRE_TIMEOUT',
      message: 'injected acquire timeout',
      retryable: true
    }, 2);

    await expect(fixture.instance.acquire(request())).rejects.toMatchObject({
      code: 'PROXY_ACQUIRE_TIMEOUT',
      retryable: true
    });
    await expect(fixture.instance.acquire(request())).rejects.toMatchObject({
      code: 'PROXY_ACQUIRE_TIMEOUT',
      retryable: true
    });
    const recovered = await fixture.instance.acquire(request());
    expect(recovered.status).toBe('ACTIVE');
    expect(fixture.instance.calls.filter((call) => call.operation === 'acquire')).toHaveLength(3);
  });

  it('injects provider health failure without persisting raw failure material', async () => {
    const fixture = provider();
    fixture.instance.failNext('health', {
      code: 'PROVIDER_HEALTH_UNAVAILABLE',
      message: 'health probe unavailable',
      retryable: true
    });

    await expect(fixture.instance.health()).rejects.toMatchObject({
      code: 'PROVIDER_HEALTH_UNAVAILABLE',
      retryable: true
    });
    expect(fixture.instance.calls).toEqual([{ operation: 'health' }]);
  });
});
