import { createHash } from 'node:crypto';

import {
  assertProxyLeaseActive,
  ProxyProviderError,
  type ProxyAcquireRequest,
  type ProxyLease,
  type ProxyProvider,
  type ProxyQuarantineReason
} from './contracts.js';

export type LeaseAuditEvent = {
  type: 'ACQUIRED' | 'RELEASED' | 'EXPIRED' | 'QUARANTINED' | 'ROTATED';
  leaseId: string;
  providerId: string;
  tenantId: string;
  attemptId: string;
  reason?: string;
  occurredAt: Date;
};

export class ProxyLeaseManager {
  private readonly leases = new Map<string, ProxyLease>();
  private readonly stickyBindings = new Map<string, string>();
  private readonly auditEvents: LeaseAuditEvent[] = [];

  public constructor(
    private readonly providers: Map<string, ProxyProvider>,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async acquire(request: ProxyAcquireRequest): Promise<ProxyLease> {
    const provider = this.providers.get(request.providerId ?? '');
    if (!provider) {
      throw new ProxyProviderError(
        'NO_ELIGIBLE_PROXY',
        'Proxy provider bulunamadı.',
        false
      );
    }

    if (request.stickyKey) {
      const stickyLeaseId = this.stickyBindings.get(this.stickyKey(request));
      if (stickyLeaseId) {
        const stickyLease = this.leases.get(stickyLeaseId);
        if (stickyLease) {
          try {
            assertProxyLeaseActive(stickyLease, this.now());
            return cloneLease(stickyLease);
          } catch {
            this.stickyBindings.delete(this.stickyKey(request));
          }
        }
      }
    }

    const lease = await provider.acquire(request);
    if (!this.sameScope(lease, request) || lease.providerId !== provider.providerId) {
      throw new ProxyProviderError(
        'PROVIDER_POLICY_REFUSED',
        'Provider lease request scope ile eşleşmiyor.',
        false
      );
    }
    assertProxyLeaseActive(lease, this.now());
    const stored = cloneLease(lease);
    this.leases.set(stored.leaseId, stored);
    if (request.stickyKey) {
      this.stickyBindings.set(this.stickyKey(request), stored.leaseId);
    }
    this.auditEvents.push(event('ACQUIRED', stored));
    return cloneLease(stored);
  }

  public async release(tenantId: string, leaseId: string): Promise<void> {
    const lease = this.requireLease(tenantId, leaseId);
    if (lease.status === 'RELEASED') {
      return;
    }
    const provider = this.requireProvider(lease.providerId);
    await provider.release(cloneLease(lease));
    lease.status = 'RELEASED';
    this.removeStickyBinding(lease);
    this.auditEvents.push(event('RELEASED', lease));
  }

  public async quarantine(
    tenantId: string,
    leaseId: string,
    reason: ProxyQuarantineReason
  ): Promise<void> {
    const lease = this.requireLease(tenantId, leaseId);
    if (lease.status === 'QUARANTINED') {
      return;
    }
    const provider = this.requireProvider(lease.providerId);
    await provider.quarantine(cloneLease(lease), reason);
    lease.status = 'QUARANTINED';
    this.removeStickyBinding(lease);
    this.auditEvents.push({ ...event('QUARANTINED', lease), reason });
  }

  public async rotate(
    tenantId: string,
    leaseId: string,
    request: ProxyAcquireRequest
  ): Promise<ProxyLease> {
    const lease = this.requireLease(tenantId, leaseId);
    if (lease.tenantId !== request.tenantId || lease.attemptId !== request.attemptId) {
      throw new ProxyProviderError(
        'PROXY_STICKY_SCOPE_MISMATCH',
        'Proxy rotation request lease scope ile eşleşmiyor.',
        false
      );
    }
    const provider = this.requireProvider(lease.providerId);
    if (!provider.rotate) {
      throw new ProxyProviderError(
        'PROXY_ROTATION_UNSUPPORTED',
        'Provider proxy rotation desteklemiyor.',
        false
      );
    }
    const rotated = await provider.rotate(cloneLease(lease), request);
    assertProxyLeaseActive(rotated, this.now());
    if (!this.sameScope(rotated, request) || rotated.providerId !== lease.providerId) {
      throw new ProxyProviderError(
        'PROVIDER_POLICY_REFUSED',
        'Rotated lease request scope ile eşleşmiyor.',
        false
      );
    }
    lease.status = 'RELEASED';
    this.removeStickyBinding(lease);
    const stored = cloneLease(rotated);
    this.leases.set(stored.leaseId, stored);
    if (request.stickyKey) {
      this.stickyBindings.set(this.stickyKey(request), stored.leaseId);
    }
    this.auditEvents.push(event('ROTATED', stored));
    return cloneLease(stored);
  }

  public expire(now = this.now()): number {
    let expired = 0;
    for (const lease of this.leases.values()) {
      if (lease.status === 'ACTIVE' && lease.expiresAt.getTime() <= now.getTime()) {
        lease.status = 'EXPIRED';
        this.removeStickyBinding(lease);
        this.auditEvents.push(event('EXPIRED', lease));
        expired += 1;
      }
    }
    return expired;
  }

  public get(tenantId: string, leaseId: string): ProxyLease | undefined {
    const lease = this.leases.get(leaseId);
    return lease && lease.tenantId === tenantId ? cloneLease(lease) : undefined;
  }

  public get audit(): LeaseAuditEvent[] {
    return this.auditEvents.map((item) => ({ ...item, occurredAt: new Date(item.occurredAt) }));
  }

  private requireLease(tenantId: string, leaseId: string): ProxyLease {
    const lease = this.leases.get(leaseId);
    if (!lease || lease.tenantId !== tenantId) {
      throw new ProxyProviderError(
        'PROXY_LEASE_NOT_FOUND',
        'Proxy lease bulunamadı.',
        false
      );
    }
    return lease;
  }

  private requireProvider(providerId: string): ProxyProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new ProxyProviderError(
        'NO_ELIGIBLE_PROXY',
        'Proxy provider bulunamadı.',
        false
      );
    }
    return provider;
  }

  private sameScope(lease: ProxyLease, request: ProxyAcquireRequest): boolean {
    return lease.tenantId === request.tenantId
      && lease.projectId === request.projectId
      && lease.targetId === request.targetId
      && lease.jobId === request.jobId
      && lease.taskId === request.taskId
      && lease.attemptId === request.attemptId;
  }

  private stickyKey(request: ProxyAcquireRequest): string {
    return createHash('sha256')
      .update(`${request.tenantId}:${request.targetId}:${request.jobId}:${request.stickyKey ?? ''}`)
      .digest('hex');
  }

  private removeStickyBinding(lease: ProxyLease): void {
    for (const [key, leaseId] of this.stickyBindings.entries()) {
      if (leaseId === lease.leaseId) {
        this.stickyBindings.delete(key);
      }
    }
  }
}

function event(
  type: LeaseAuditEvent['type'],
  lease: ProxyLease
): LeaseAuditEvent {
  return {
    type,
    leaseId: lease.leaseId,
    providerId: lease.providerId,
    tenantId: lease.tenantId,
    attemptId: lease.attemptId,
    occurredAt: new Date()
  };
}

function cloneLease(lease: ProxyLease): ProxyLease {
  return {
    ...lease,
    ...(lease.issuedAt !== undefined ? { issuedAt: new Date(lease.issuedAt) } : {}),
    expiresAt: new Date(lease.expiresAt)
  };
}
