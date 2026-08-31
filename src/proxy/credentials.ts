import { ProxyProviderError } from './contracts.js';

export type ProviderCredentialReference = {
  tenantId: string;
  providerId: string;
  referenceId: string;
  version: number;
};

export type ProviderCredentialMaterial = {
  username?: string;
  password?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
};

export type ProviderCredentialResolver = {
  resolve(reference: ProviderCredentialReference): Promise<ProviderCredentialMaterial | undefined>;
};

export type CredentialLifecycle = 'ACTIVE' | 'REVOKED';

type CredentialEntry = {
  reference: ProviderCredentialReference;
  material: ProviderCredentialMaterial;
  lifecycle: CredentialLifecycle;
};

export class ProviderCredentialManager {
  public constructor(private readonly resolver: ProviderCredentialResolver) {}

  public async withCredential<T>(input: {
    tenantId: string;
    providerId: string;
    reference: ProviderCredentialReference;
    operation: (material: Readonly<ProviderCredentialMaterial>) => Promise<T>;
  }): Promise<T> {
    this.assertReferenceScope(input.reference, input.tenantId, input.providerId);
    const material = await this.resolver.resolve(input.reference);
    if (!material) {
      throw new ProxyProviderError(
        'PROVIDER_CREDENTIAL_INVALID',
        'Provider credential reference çözümlenemedi.',
        false
      );
    }

    try {
      return await input.operation(material);
    } finally {
      // JavaScript string değerleri güvenli biçimde wipe edilemez; scope ve log izolasyonu korunur.
      void material;
    }
  }

  private assertReferenceScope(
    reference: ProviderCredentialReference,
    tenantId: string,
    providerId: string
  ): void {
    if (reference.tenantId !== tenantId || reference.providerId !== providerId) {
      throw new ProxyProviderError(
        'PROVIDER_CREDENTIAL_INVALID',
        'Provider credential reference scope ile eşleşmiyor.',
        false
      );
    }
    if (!reference.referenceId || !Number.isInteger(reference.version) || reference.version < 1) {
      throw new ProxyProviderError(
        'PROVIDER_CREDENTIAL_INVALID',
        'Provider credential reference geçerli değil.',
        false
      );
    }
  }
}

export class InMemoryProviderCredentialResolver implements ProviderCredentialResolver {
  private readonly entries = new Map<string, CredentialEntry>();

  public register(
    reference: ProviderCredentialReference,
    material: ProviderCredentialMaterial
  ): void {
    this.entries.set(keyFor(reference), {
      reference: { ...reference },
      material: { ...material },
      lifecycle: 'ACTIVE'
    });
  }

  public revoke(reference: ProviderCredentialReference): void {
    const entry = this.entries.get(keyFor(reference));
    if (entry) {
      entry.lifecycle = 'REVOKED';
    }
  }

  public rotate(
    reference: ProviderCredentialReference,
    material: ProviderCredentialMaterial
  ): ProviderCredentialReference {
    const next: ProviderCredentialReference = {
      ...reference,
      version: reference.version + 1
    };
    this.register(next, material);
    this.revoke(reference);
    return next;
  }

  public async resolve(
    reference: ProviderCredentialReference
  ): Promise<ProviderCredentialMaterial | undefined> {
    const entry = this.entries.get(keyFor(reference));
    if (!entry || entry.lifecycle !== 'ACTIVE') {
      return undefined;
    }
    return { ...entry.material };
  }

  public get lifecycleEntries(): number {
    return this.entries.size;
  }
}

function keyFor(reference: ProviderCredentialReference): string {
  return `${reference.tenantId}:${reference.providerId}:${reference.referenceId}:${reference.version}`;
}
