import {
  FakeProxyProvider,
  type FakeProxyCall,
  type FakeProxyFailure,
  type FakeProxyOperation
} from './fake-provider.js';
import type {
  ProxyAcquireRequest,
  ProxyCapability,
  ProxyLease,
  ProxyProvider,
  ProxyProviderHealth,
  ProxyQuarantineReason
} from './contracts.js';

export const INTERNAL_PROVIDER_ADAPTER_CONTRACT_VERSION = 'internal-provider-adapter/v1' as const;

export type LocalProviderExecutionBoundary = {
  contractVersion: typeof INTERNAL_PROVIDER_ADAPTER_CONTRACT_VERSION;
  executionMode: 'LOCAL_TEST_DOUBLE';
  allowsExternalProviderCall: false;
  allowsProviderActivation: false;
  allowsCredentialMaterial: false;
};

export type InternalProviderAdapterOptions = {
  providerId?: string;
  version?: string;
  capability: ProxyCapability;
  health?: ProxyProviderHealth;
  now?: () => Date;
};

export class InternalProviderAdapterError extends Error {
  public constructor(public readonly code: 'INTERNAL_PROVIDER_ADAPTER_CONFIG_INVALID', message: string) {
    super(message);
    this.name = 'InternalProviderAdapterError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const LOCAL_ENDPOINT_HOST = 'internal.provider.invalid';

/**
 * Provider interface adapter backed exclusively by the in-process local test
 * double. It neither accepts credential material nor executes network calls,
 * provider activation, proxy dispatch or production-provider operations.
 */
export class InternalProviderAdapter implements ProxyProvider {
  public readonly providerId: string;
  public readonly version: string;
  private readonly localDouble: FakeProxyProvider;

  public constructor(options: InternalProviderAdapterOptions) {
    const providerId = options.providerId ?? 'internal_provider';
    const version = options.version ?? 'internal-reference-1.0.0';
    if (!SAFE_ID.test(providerId) || !SAFE_ID.test(version)) {
      throw new InternalProviderAdapterError('INTERNAL_PROVIDER_ADAPTER_CONFIG_INVALID', 'Internal provider adapter ID veya version geçerli değil.');
    }
    this.providerId = providerId;
    this.version = version;
    this.localDouble = new FakeProxyProvider({
      providerId,
      version,
      capability: options.capability,
      ...(options.health ? { health: options.health } : {}),
      endpointHost: LOCAL_ENDPOINT_HOST,
      endpointPort: 443,
      ...(options.now ? { now: options.now } : {})
    });
  }

  public get executionBoundary(): LocalProviderExecutionBoundary {
    return {
      contractVersion: INTERNAL_PROVIDER_ADAPTER_CONTRACT_VERSION,
      executionMode: 'LOCAL_TEST_DOUBLE',
      allowsExternalProviderCall: false,
      allowsProviderActivation: false,
      allowsCredentialMaterial: false
    };
  }

  public get calls(): FakeProxyCall[] {
    return this.localDouble.calls;
  }

  public async capabilities(): Promise<ProxyCapability> {
    return this.localDouble.capabilities();
  }

  public async health(): Promise<ProxyProviderHealth> {
    return this.localDouble.health();
  }

  public async acquire(request: ProxyAcquireRequest): Promise<ProxyLease> {
    return this.localDouble.acquire(request);
  }

  public async release(lease: ProxyLease): Promise<void> {
    return this.localDouble.release(lease);
  }

  public async quarantine(lease: ProxyLease, reason: ProxyQuarantineReason): Promise<void> {
    return this.localDouble.quarantine(lease, reason);
  }

  public async rotate(lease: ProxyLease, request: ProxyAcquireRequest): Promise<ProxyLease> {
    return this.localDouble.rotate(lease, request);
  }

  public failNext(operation: FakeProxyOperation, failure: FakeProxyFailure, count = 1): void {
    this.localDouble.failNext(operation, failure, count);
  }
}
