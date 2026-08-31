import type {
  ProxyCapability,
  ProxyClass,
  ProxyLeaseStatus,
  ProxyProtocol
} from './contracts.js';

export type ProxyCatalogStatus = 'AVAILABLE' | 'IN_USE' | 'QUARANTINED' | 'DISABLED';

export type ProxyCatalogEntry = {
  proxyId: string;
  providerId: string;
  providerVersion: string;
  endpointHost: string;
  endpointPort: number;
  protocol: ProxyProtocol;
  proxyClass: ProxyClass;
  country?: string;
  region?: string;
  status: ProxyCatalogStatus;
  capability: ProxyCapability;
  updatedAt: Date;
  leaseStatus?: ProxyLeaseStatus;
};

export type ProxyRequirement = {
  tenantId: string;
  targetId: string;
  protocol: ProxyProtocol;
  allowedClasses: ProxyClass[];
  allowedCountries?: string[];
  allowedRegions?: string[];
  requireStickySession: boolean;
  requireRotation: boolean;
};

export class ProxyCatalogError extends Error {
  public constructor(
    public readonly code:
      | 'PROXY_ENTRY_INVALID'
      | 'PROXY_ENTRY_NOT_FOUND'
      | 'PROXY_PROTOCOL_NOT_ALLOWED'
      | 'PROXY_CLASS_NOT_ALLOWED'
      | 'PROXY_GEO_NOT_ALLOWED'
      | 'PROXY_STICKY_UNSUPPORTED'
      | 'PROXY_ROTATION_UNSUPPORTED'
      | 'NO_ELIGIBLE_PROXY',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ProxyCatalogError';
  }
}

export class ProxyCatalog {
  private readonly entries = new Map<string, ProxyCatalogEntry>();

  public upsert(entry: ProxyCatalogEntry): void {
    validateEntry(entry);
    this.entries.set(entry.proxyId, {
      ...entry,
      capability: { ...entry.capability },
      updatedAt: new Date(entry.updatedAt)
    });
  }

  public get(proxyId: string): ProxyCatalogEntry | undefined {
    const entry = this.entries.get(proxyId);
    return entry ? cloneEntry(entry) : undefined;
  }

  public listEligible(requirement: ProxyRequirement): ProxyCatalogEntry[] {
    const candidates = [...this.entries.values()]
      .filter((entry) => entry.status === 'AVAILABLE')
      .filter((entry) => isEligible(entry, requirement))
      .sort((left, right) => left.proxyId.localeCompare(right.proxyId));
    return candidates.map(cloneEntry);
  }

  public select(requirement: ProxyRequirement): ProxyCatalogEntry {
    const selected = this.listEligible(requirement)[0];
    if (!selected) {
      throw new ProxyCatalogError(
        'NO_ELIGIBLE_PROXY',
        'Proxy requirement için eligible catalog entry bulunamadı.',
        false
      );
    }
    return selected;
  }

  public setStatus(proxyId: string, status: ProxyCatalogStatus): ProxyCatalogEntry {
    const entry = this.entries.get(proxyId);
    if (!entry) {
      throw new ProxyCatalogError(
        'PROXY_ENTRY_NOT_FOUND',
        'Proxy catalog entry bulunamadı.',
        false
      );
    }
    entry.status = status;
    entry.updatedAt = new Date();
    return cloneEntry(entry);
  }

  public get size(): number {
    return this.entries.size;
  }
}

function isEligible(entry: ProxyCatalogEntry, requirement: ProxyRequirement): boolean {
  if (entry.protocol !== requirement.protocol || !entry.capability.protocols.includes(requirement.protocol)) {
    return false;
  }
  if (!requirement.allowedClasses.includes(entry.proxyClass) || !entry.capability.proxyClasses.includes(entry.proxyClass)) {
    return false;
  }
  if (requirement.allowedCountries?.length && (!entry.country || !requirement.allowedCountries.includes(entry.country))) {
    return false;
  }
  if (requirement.allowedRegions?.length && (!entry.region || !requirement.allowedRegions.includes(entry.region))) {
    return false;
  }
  if (requirement.requireStickySession && !entry.capability.supportsStickySession) {
    return false;
  }
  if (requirement.requireRotation && !entry.capability.supportsRotation) {
    return false;
  }
  return true;
}

function validateEntry(entry: ProxyCatalogEntry): void {
  if (!entry.proxyId || !entry.providerId || !entry.providerVersion || !entry.endpointHost) {
    throw new ProxyCatalogError(
      'PROXY_ENTRY_INVALID',
      'Proxy catalog entry identity alanları eksik.',
      false
    );
  }
  if (entry.endpointHost.includes('@') || entry.endpointHost.includes(':')) {
    throw new ProxyCatalogError(
      'PROXY_ENTRY_INVALID',
      'Proxy endpoint host raw credential veya port içermemelidir.',
      false
    );
  }
  if (!Number.isInteger(entry.endpointPort) || entry.endpointPort < 1 || entry.endpointPort > 65_535) {
    throw new ProxyCatalogError(
      'PROXY_ENTRY_INVALID',
      'Proxy endpoint port geçerli değil.',
      false
    );
  }
  if (!entry.capability.protocols.includes(entry.protocol) || !entry.capability.proxyClasses.includes(entry.proxyClass)) {
    throw new ProxyCatalogError(
      'PROXY_ENTRY_INVALID',
      'Proxy catalog capability entry ile uyumlu değil.',
      false
    );
  }
}

function cloneEntry(entry: ProxyCatalogEntry): ProxyCatalogEntry {
  return {
    ...entry,
    capability: {
      ...entry.capability,
      protocols: [...entry.capability.protocols],
      proxyClasses: [...entry.capability.proxyClasses],
      countries: [...entry.capability.countries],
      regions: [...entry.capability.regions],
      metering: { ...entry.capability.metering }
    },
    updatedAt: new Date(entry.updatedAt)
  };
}
