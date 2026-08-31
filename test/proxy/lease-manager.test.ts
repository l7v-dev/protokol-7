import { describe, expect, it, vi } from 'vitest';

import {
  ProxyLeaseManager
} from '../../src/proxy/lease-manager.js';
import type {
  ProxyAcquireRequest,
  ProxyCapability,
  ProxyLease,
  ProxyProvider
} from '../../src/proxy/contracts.js';

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
    providerId: 'provider_test',
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
    stickyKey: 'session-a',
    leaseExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
    correlationId: 'correlation_1',
    ...overrides
  };
}

function providerFactory(now: () => Date = () => new Date('2026-08-26T00:00:00.000Z')) {
  let sequence = 0;
  const acquire = vi.fn().mockImplementation(async (input: ProxyAcquireRequest): Promise<ProxyLease> => ({
    leaseId: `lease_${++sequence}`,
    proxyId: `proxy_${sequence}`,
    providerId: 'provider_test',
    providerVersion: '1.0.0',
    tenantId: input.tenantId,
    projectId: input.projectId,
    targetId: input.targetId,
    jobId: input.jobId,
    taskId: input.taskId,
    attemptId: input.attemptId,
    protocol: input.protocol,
    proxyClass: input.proxyClass,
    country: input.country,
    region: input.region,
    endpointHost: 'proxy.example.com',
    endpointPort: 443,
    issuedAt: now(),
    expiresAt: input.leaseExpiresAt,
    status: 'ACTIVE',
    meterReference: `meter_${sequence}`
  }));
  const release = vi.fn().mockResolvedValue(undefined);
  const quarantine = vi.fn().mockResolvedValue(undefined);
  const rotate = vi.fn().mockImplementation(async (lease: ProxyLease, input: ProxyAcquireRequest): Promise<ProxyLease> => ({
    ...lease,
    leaseId: `${lease.leaseId}_rotated`,
    proxyId: `${lease.proxyId}_rotated`,
    attemptId: input.attemptId,
    issuedAt: now(),
    expiresAt: input.leaseExpiresAt,
    status: 'ACTIVE'
  }));
  const provider: ProxyProvider = {
    providerId: 'provider_test',
    version: '1.0.0',
    capabilities: vi.fn().mockResolvedValue(capability),
    health: vi.fn(),
    acquire,
    release,
    quarantine,
    rotate
  };
  return { provider, acquire, release, quarantine, rotate };
}

describe('ProxyLeaseManager', () => {
  it('reuses an active sticky lease inside the same tenant/target/job scope', async () => {
    const fixture = providerFactory();
    const manager = new ProxyLeaseManager(new Map([['provider_test', fixture.provider]]));

    const first = await manager.acquire(request());
    const second = await manager.acquire(request());

    expect(second.leaseId).toBe(first.leaseId);
    expect(fixture.acquire).toHaveBeenCalledOnce();
    expect(manager.audit.map((event) => event.type)).toEqual(['ACQUIRED']);
  });

  it('prevents cross-tenant release and makes release idempotent', async () => {
    const fixture = providerFactory();
    const manager = new ProxyLeaseManager(new Map([['provider_test', fixture.provider]]));
    const lease = await manager.acquire(request());

    await expect(manager.release('tenant_2', lease.leaseId)).rejects.toMatchObject({
      code: 'PROXY_LEASE_NOT_FOUND',
      retryable: false
    });
    await manager.release('tenant_1', lease.leaseId);
    await manager.release('tenant_1', lease.leaseId);
    expect(fixture.release).toHaveBeenCalledOnce();
    expect(manager.get('tenant_1', lease.leaseId)?.status).toBe('RELEASED');
  });

  it('expires active leases and removes sticky binding', async () => {
    const now = vi.fn().mockReturnValue(new Date('2026-08-26T00:00:00.000Z'));
    const fixture = providerFactory(now);
    const manager = new ProxyLeaseManager(new Map([['provider_test', fixture.provider]]), now);
    const lease = await manager.acquire(request({ leaseExpiresAt: new Date('2026-08-27T00:00:00.000Z') }));

    expect(manager.expire(new Date('2026-08-28T00:00:00.000Z'))).toBe(1);
    expect(manager.get('tenant_1', lease.leaseId)?.status).toBe('EXPIRED');
    const next = await manager.acquire(request({ leaseExpiresAt: new Date('2026-08-27T00:00:00.000Z') }));
    expect(next.leaseId).not.toBe(lease.leaseId);
    expect(fixture.acquire).toHaveBeenCalledTimes(2);
  });

  it('quarantines a lease and rotates within the same attempt scope', async () => {
    const fixture = providerFactory();
    const manager = new ProxyLeaseManager(new Map([['provider_test', fixture.provider]]));
    const lease = await manager.acquire(request());

    await manager.quarantine('tenant_1', lease.leaseId, 'PROVIDER_FAILURE');
    expect(manager.get('tenant_1', lease.leaseId)?.status).toBe('QUARANTINED');
    expect(fixture.quarantine).toHaveBeenCalledWith(expect.objectContaining({ leaseId: lease.leaseId }), 'PROVIDER_FAILURE');

    const rotated = await manager.rotate('tenant_1', lease.leaseId, request({ stickyKey: 'session-b' }));
    expect(rotated.leaseId).toContain('_rotated');
    expect(fixture.rotate).toHaveBeenCalledOnce();
  });

  it('rejects provider lease scope mismatches and unsupported rotation', async () => {
    const fixture = providerFactory();
    const badProvider: ProxyProvider = {
      ...fixture.provider,
      acquire: vi.fn().mockResolvedValue({
        ...(await fixture.provider.acquire(request())),
        tenantId: 'tenant_other'
      })
    };
    const manager = new ProxyLeaseManager(new Map([['provider_test', badProvider]]));
    await expect(manager.acquire(request())).rejects.toMatchObject({
      code: 'PROVIDER_POLICY_REFUSED',
      retryable: false
    });

    const noRotation = providerFactory();
    const providerWithoutRotation: ProxyProvider = { ...noRotation.provider, rotate: undefined };
    const managerWithoutRotation = new ProxyLeaseManager(new Map([['provider_test', providerWithoutRotation]]));
    const lease = await managerWithoutRotation.acquire(request());
    await expect(managerWithoutRotation.rotate('tenant_1', lease.leaseId, request())).rejects.toMatchObject({
      code: 'PROXY_ROTATION_UNSUPPORTED',
      retryable: false
    });
  });
});
