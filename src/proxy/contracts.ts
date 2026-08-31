export type ProxyProtocol = 'http' | 'https' | 'socks5';

export type ProxyClass = 'datacenter' | 'residential' | 'mobile' | 'isp';

export type ProxyLeaseStatus = 'ACTIVE' | 'RELEASED' | 'EXPIRED' | 'QUARANTINED';

export type ProxyQuarantineReason = 'PROVIDER_FAILURE' | 'TARGET_BLOCKED' | 'AUTH_FAILED' | 'TIMEOUT' | 'MANUAL' | (string & {});

export type ProxyMetering = {
  request: boolean;
  bytes: boolean;
  lease: boolean;
};

export type ProxyCapability = {
  protocols: ProxyProtocol[];
  proxyClasses: ProxyClass[];
  countries: string[];
  regions: string[];
  supportsStickySession: boolean;
  supportsRotation: boolean;
  maxLeaseSeconds: number;
  metering: ProxyMetering;
};

export type ProxyAcquireRequest = {
  providerId: string;
  tenantId: string;
  projectId: string;
  targetId: string;
  jobId: string;
  taskId: string;
  attemptId: string;
  protocol: ProxyProtocol;
  proxyClass: ProxyClass;
  country?: string;
  region?: string;
  stickyKey?: string;
  leaseExpiresAt: Date;
  correlationId: string;
};

export type ProxyLease = {
  leaseId: string;
  proxyId?: string;
  providerId: string;
  providerVersion?: string;
  tenantId: string;
  projectId?: string;
  targetId?: string;
  jobId: string;
  taskId: string;
  attemptId: string;
  protocol: ProxyProtocol;
  proxyClass: ProxyClass;
  country?: string;
  region?: string;
  endpointHost: string;
  endpointPort: number;
  issuedAt?: Date;
  expiresAt: Date;
  status: ProxyLeaseStatus;
  meterReference: string;
};

export type ProxyHealthReport = {
  providerId: string;
  providerVersion: string;
  healthy: boolean;
  successRate?: number;
  availableCapacity?: number;
  checkedAt?: Date;
  safeReason?: string;
  details?: Record<string, unknown>;
};

export type ProxyProviderHealth = ProxyHealthReport;

export type ProxyProviderErrorCode =
  | 'PROVIDER_POLICY_REFUSED'
  | 'PROXY_CAPABILITY_MISMATCH'
  | 'PROXY_LEASE_NOT_FOUND'
  | 'PROXY_ACQUIRE_TIMEOUT'
  | 'PROVIDER_HEALTH_UNAVAILABLE'
  | 'PROVIDER_CREDENTIAL_INVALID'
  | 'PROVIDER_CONFIG_INVALID'
  | 'PROXY_ROTATION_UNSUPPORTED'
  | 'NO_ELIGIBLE_PROXY'
  | 'PROXY_STICKY_SCOPE_MISMATCH';

export class ProxyProviderError extends Error {
  public constructor(
    public readonly code: ProxyProviderErrorCode,
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ProxyProviderError';
  }
}

export function assertProxyLeaseActive(lease: ProxyLease, now: Date = new Date()): void {
  if (lease.status !== 'ACTIVE') {
    throw new ProxyProviderError('PROXY_LEASE_NOT_FOUND', 'Proxy lease active durumunda değil.', false);
  }
  if (lease.expiresAt && lease.expiresAt.getTime() <= now.getTime()) {
    throw new ProxyProviderError('PROXY_LEASE_NOT_FOUND', 'Proxy lease süresi doldu.', false);
  }
}

export interface ProxyProvider {
  readonly providerId: string;
  readonly version?: string;
  capabilities(): Promise<ProxyCapability>;
  health(): Promise<ProxyHealthReport>;
  acquire(request: ProxyAcquireRequest): Promise<ProxyLease>;
  release(lease: ProxyLease): Promise<void>;
  quarantine(lease: ProxyLease, reason: string): Promise<void>;
  rotate?(lease: ProxyLease, request: ProxyAcquireRequest): Promise<ProxyLease>;
}
