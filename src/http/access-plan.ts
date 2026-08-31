export type AccessMode = 'DIRECT' | 'PROXY';

export type ProxyAccessRequest = {
  targetHost: string;
  targetPort: number;
  country?: string;
  proxyClass?: string;
  sessionMode?: 'ephemeral' | 'sticky';
  maxDurationMs: number;
};

export type ProxyLease = {
  leaseId: string;
  providerId: string;
  endpoint: {
    protocol: 'http:' | 'https:';
    host: string;
    port: number;
  };
  credentialReference?: string;
};

export interface ProxyManager {
  acquire(request: ProxyAccessRequest): Promise<ProxyLease>;
  release(leaseId: string, result: { success: boolean; errorCode?: string }): Promise<void>;
}

export type AccessPlan = {
  mode: AccessMode;
  lease?: ProxyLease;
};

export class ProxyAccessError extends Error {
  public constructor(
    public readonly code: 'PROXY_REQUIRED_UNAVAILABLE' | 'PROXY_ACQUIRE_FAILED',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ProxyAccessError';
  }
}

export class HttpAccessPlanner {
  public constructor(private readonly proxyManager?: ProxyManager) {}

  public async resolve(input: {
    requireProxy: boolean;
    allowDirectAccess: boolean;
    proxy?: ProxyAccessRequest;
  }): Promise<AccessPlan> {
    if (!input.requireProxy) {
      if (!input.allowDirectAccess) {
        throw new ProxyAccessError(
          'PROXY_REQUIRED_UNAVAILABLE',
          'Target direct accessı kapatmış ancak proxy planı zorunlu değil.',
          false
        );
      }
      return { mode: 'DIRECT' };
    }

    if (!this.proxyManager || !input.proxy) {
      throw new ProxyAccessError(
        'PROXY_REQUIRED_UNAVAILABLE',
        'Target proxy erişimi istiyor ancak aktif ProxyManager bulunamadı.',
        false
      );
    }

    try {
      const lease = await this.proxyManager.acquire(input.proxy);
      return { mode: 'PROXY', lease };
    } catch (error) {
      throw new ProxyAccessError(
        'PROXY_ACQUIRE_FAILED',
        error instanceof Error ? 'Proxy lease alınamadı.' : 'Proxy lease alınamadı.',
        true
      );
    }
  }

  public async release(plan: AccessPlan, result: { success: boolean; errorCode?: string }): Promise<void> {
    if (plan.mode !== 'PROXY' || !plan.lease || !this.proxyManager) {
      return;
    }
    await this.proxyManager.release(plan.lease.leaseId, result);
  }
}
