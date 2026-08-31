import { createHash } from 'node:crypto';

import {
  ProxyProviderError,
  type ProxyAcquireRequest,
  type ProxyCapability,
  type ProxyLease,
  type ProxyProvider,
  type ProxyProviderErrorCode,
  type ProxyProviderHealth,
  type ProxyQuarantineReason
} from './contracts.js';

export type FakeProxyOperation = 'capabilities' | 'health' | 'acquire' | 'release' | 'quarantine' | 'rotate';

export type FakeProxyFailure = {
  code: ProxyProviderErrorCode;
  message: string;
  retryable: boolean;
};

export type FakeProxyProviderOptions = {
  providerId?: string;
  version?: string;
  capability: ProxyCapability;
  health?: ProxyProviderHealth;
  endpointHost?: string;
  endpointPort?: number;
  now?: () => Date;
};

type FailureEntry = FakeProxyFailure & { remaining: number };

export type FakeProxyCall = {
  operation: FakeProxyOperation;
  tenantId?: string;
  jobId?: string;
  taskId?: string;
  attemptId?: string;
  leaseId?: string;
};

/**
 * Deterministic provider double for contract, failure and lease lifecycle tests.
 * It intentionally never accepts or stores credential material.
 */
export class FakeProxyProvider implements ProxyProvider {
  public readonly providerId: string;
  public readonly version: string;
  private readonly capability: ProxyCapability;
  private readonly healthSnapshot: ProxyProviderHealth;
  private readonly endpointHost: string;
  private readonly endpointPort: number;
  private readonly now: () => Date;
  private readonly failures = new Map<FakeProxyOperation, FailureEntry[]>();
  private readonly leases = new Map<string, ProxyLease>();
  private sequence = 0;
  private readonly callLog: FakeProxyCall[] = [];

  public constructor(options: FakeProxyProviderOptions) {
    this.providerId = options.providerId ?? 'provider_fake';
    this.version = options.version ?? 'fake-1.0.0';
    this.capability = cloneCapability(options.capability);
    this.healthSnapshot = options.health ? {
      ...cloneHealth(options.health),
      providerId: this.providerId,
      providerVersion: this.version
    } : {
      providerId: this.providerId,
      providerVersion: this.version,
      healthy: true,
      successRate: 1,
      availableCapacity: 100,
      checkedAt: new Date((options.now ?? (() => new Date()))()),
      safeReason: 'fake_provider_healthy'
    };
    this.endpointHost = options.endpointHost ?? 'proxy.fake.invalid';
    this.endpointPort = options.endpointPort ?? 443;
    this.now = options.now ?? (() => new Date());
  }

  public async capabilities(): Promise<ProxyCapability> {
    this.log({ operation: 'capabilities' });
    this.failIfInjected('capabilities');
    return cloneCapability(this.capability);
  }

  public async health(): Promise<ProxyProviderHealth> {
    this.log({ operation: 'health' });
    this.failIfInjected('health');
    return cloneHealth(this.healthSnapshot);
  }

  public async acquire(request: ProxyAcquireRequest): Promise<ProxyLease> {
    this.log({
      operation: 'acquire',
      tenantId: request.tenantId,
      jobId: request.jobId,
      taskId: request.taskId,
      attemptId: request.attemptId
    });
    this.failIfInjected('acquire');
    this.assertRequest(request);
    const lease = this.createLease(request);
    this.leases.set(lease.leaseId, lease);
    return cloneLease(lease);
  }

  public async release(lease: ProxyLease): Promise<void> {
    this.log({ operation: 'release', tenantId: lease.tenantId, leaseId: lease.leaseId });
    this.failIfInjected('release');
    this.assertOwnedLease(lease);
    this.leases.delete(lease.leaseId);
    return;
  }

  public async quarantine(lease: ProxyLease, reason: ProxyQuarantineReason): Promise<void> {
    this.log({ operation: 'quarantine', tenantId: lease.tenantId, leaseId: lease.leaseId });
    this.failIfInjected('quarantine');
    this.assertOwnedLease(lease);
    const stored = this.leases.get(lease.leaseId);
    if (stored) {
      this.leases.set(lease.leaseId, { ...stored, status: 'QUARANTINED' });
    }
    void reason;
    return;
  }

  public async rotate(lease: ProxyLease, request: ProxyAcquireRequest): Promise<ProxyLease> {
    this.log({
      operation: 'rotate',
      tenantId: lease.tenantId,
      jobId: request.jobId,
      taskId: request.taskId,
      attemptId: request.attemptId,
      leaseId: lease.leaseId
    });
    this.failIfInjected('rotate');
    this.assertOwnedLease(lease);
    this.assertRequest(request);
    const rotated = this.createLease(request);
    this.leases.set(rotated.leaseId, rotated);
    this.leases.delete(lease.leaseId);
    return cloneLease(rotated);
  }

  public failNext(operation: FakeProxyOperation, failure: FakeProxyFailure, count = 1): void {
    if (!Number.isInteger(count) || count < 1) {
      throw new Error('Failure injection count pozitif integer olmalıdır.');
    }
    const queue = this.failures.get(operation) ?? [];
    queue.push({ ...failure, remaining: count });
    this.failures.set(operation, queue);
  }

  public get calls(): FakeProxyCall[] {
    return this.callLog.map((call) => ({ ...call }));
  }

  private createLease(request: ProxyAcquireRequest): ProxyLease {
    const sequence = ++this.sequence;
    const now = this.now();
    return {
      leaseId: `lease_fake_${sequence}`,
      proxyId: `proxy_fake_${sequence}`,
      providerId: this.providerId,
      providerVersion: this.version,
      tenantId: request.tenantId,
      projectId: request.projectId,
      targetId: request.targetId,
      jobId: request.jobId,
      taskId: request.taskId,
      attemptId: request.attemptId,
      protocol: request.protocol,
      proxyClass: request.proxyClass,
      ...(request.country ? { country: request.country } : {}),
      ...(request.region ? { region: request.region } : {}),
      endpointHost: this.endpointHost,
      endpointPort: this.endpointPort,
      issuedAt: now,
      expiresAt: new Date(request.leaseExpiresAt),
      status: 'ACTIVE',
      meterReference: `meter:${hash(`${this.providerId}:${request.tenantId}:${request.attemptId}:${sequence}`)}`
    };
  }

  private assertRequest(request: ProxyAcquireRequest): void {
    if (request.providerId !== this.providerId
      || !this.capability.protocols.includes(request.protocol)
      || !this.capability.proxyClasses.includes(request.proxyClass)
      || (request.country !== undefined && !this.capability.countries.includes(request.country))
      || (request.region !== undefined && !this.capability.regions.includes(request.region))
      || request.leaseExpiresAt.getTime() <= this.now().getTime()) {
      throw new ProxyProviderError(
        request.providerId !== this.providerId ? 'PROVIDER_POLICY_REFUSED' : 'PROXY_CAPABILITY_MISMATCH',
        'Fake provider request capability veya scope policy ile eşleşmiyor.',
        false
      );
    }
    if (this.capability.maxLeaseSeconds !== undefined
      && request.leaseExpiresAt.getTime() - this.now().getTime() > this.capability.maxLeaseSeconds * 1_000) {
      throw new ProxyProviderError('PROXY_CAPABILITY_MISMATCH', 'Fake provider lease süresi capability sınırını aşıyor.', false);
    }
  }

  private assertOwnedLease(lease: ProxyLease): void {
    const stored = this.leases.get(lease.leaseId);
    if (!stored || stored.providerId !== this.providerId || stored.tenantId !== lease.tenantId) {
      throw new ProxyProviderError('PROXY_LEASE_NOT_FOUND', 'Fake provider lease bulunamadı.', false);
    }
  }

  private failIfInjected(operation: FakeProxyOperation): void {
    const queue = this.failures.get(operation);
    const failure = queue?.find((candidate) => candidate.remaining > 0);
    if (!failure) return;
    failure.remaining -= 1;
    if (failure.remaining === 0) {
      this.failures.set(operation, queue?.filter((candidate) => candidate.remaining > 0) ?? []);
    }
    throw new ProxyProviderError(failure.code, failure.message, failure.retryable);
  }

  private log(call: FakeProxyCall): void {
    this.callLog.push(call);
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function cloneCapability(capability: ProxyCapability): ProxyCapability {
  return {
    ...capability,
    protocols: [...capability.protocols],
    proxyClasses: [...capability.proxyClasses],
    countries: [...capability.countries],
    regions: [...capability.regions],
    metering: { ...capability.metering }
  };
}

function cloneHealth(health: ProxyProviderHealth): ProxyProviderHealth {
  return {
    ...health,
    ...(health.checkedAt !== undefined ? { checkedAt: new Date(health.checkedAt) } : {})
  };
}

function cloneLease(lease: ProxyLease): ProxyLease {
  return {
    ...lease,
    ...(lease.issuedAt !== undefined ? { issuedAt: new Date(lease.issuedAt) } : {}),
    expiresAt: new Date(lease.expiresAt)
  };
}
