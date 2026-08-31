import { describe, expect, it, vi } from 'vitest';

import {
  InMemoryProviderCredentialResolver,
  ProviderCredentialManager,
  type ProviderCredentialReference
} from '../../src/proxy/credentials.js';

function reference(overrides: Partial<ProviderCredentialReference> = {}): ProviderCredentialReference {
  return {
    tenantId: 'tenant_1',
    providerId: 'provider_test',
    referenceId: 'credential_1',
    version: 1,
    ...overrides
  };
}

describe('ProviderCredentialManager', () => {
  it('resolves an active credential only inside tenant/provider scope', async () => {
    const resolver = new InMemoryProviderCredentialResolver();
    resolver.register(reference(), { username: 'proxy-user', password: 'proxy-secret' });
    const manager = new ProviderCredentialManager(resolver);
    const operation = vi.fn().mockResolvedValue('adapter-result');

    await expect(manager.withCredential({
      tenantId: 'tenant_1',
      providerId: 'provider_test',
      reference: reference(),
      operation
    })).resolves.toBe('adapter-result');
    expect(operation).toHaveBeenCalledWith({ username: 'proxy-user', password: 'proxy-secret' });

    await expect(manager.withCredential({
      tenantId: 'tenant_2',
      providerId: 'provider_test',
      reference: reference(),
      operation
    })).rejects.toMatchObject({ code: 'PROVIDER_CREDENTIAL_INVALID', retryable: false });
    await expect(manager.withCredential({
      tenantId: 'tenant_1',
      providerId: 'provider_other',
      reference: reference(),
      operation
    })).rejects.toMatchObject({ code: 'PROVIDER_CREDENTIAL_INVALID', retryable: false });
  });

  it('does not resolve missing or invalid references', async () => {
    const resolver = new InMemoryProviderCredentialResolver();
    const manager = new ProviderCredentialManager(resolver);
    const operation = vi.fn();

    await expect(manager.withCredential({
      tenantId: 'tenant_1',
      providerId: 'provider_test',
      reference: reference({ referenceId: 'missing' }),
      operation
    })).rejects.toMatchObject({ code: 'PROVIDER_CREDENTIAL_INVALID', retryable: false });
    expect(operation).not.toHaveBeenCalled();
    await expect(manager.withCredential({
      tenantId: 'tenant_1',
      providerId: 'provider_test',
      reference: reference({ version: 0 }),
      operation
    })).rejects.toMatchObject({ code: 'PROVIDER_CREDENTIAL_INVALID', retryable: false });
  });

  it('revokes old credentials and rotates to a new version', async () => {
    const resolver = new InMemoryProviderCredentialResolver();
    const first = reference();
    resolver.register(first, { token: 'old-secret' });
    const next = resolver.rotate(first, { token: 'new-secret' });
    const manager = new ProviderCredentialManager(resolver);

    await expect(manager.withCredential({
      tenantId: 'tenant_1',
      providerId: 'provider_test',
      reference: first,
      operation: vi.fn()
    })).rejects.toMatchObject({ code: 'PROVIDER_CREDENTIAL_INVALID' });
    await expect(manager.withCredential({
      tenantId: 'tenant_1',
      providerId: 'provider_test',
      reference: next,
      operation: vi.fn().mockResolvedValue('rotated')
    })).resolves.toBe('rotated');
    expect(next.version).toBe(2);
  });

  it('does not put raw credential values into manager errors', async () => {
    const resolver = new InMemoryProviderCredentialResolver();
    resolver.register(reference(), { password: 'do-not-log' });
    const manager = new ProviderCredentialManager(resolver);
    try {
      await manager.withCredential({
        tenantId: 'tenant_1',
        providerId: 'provider_test',
        reference: reference({ referenceId: 'unknown' }),
        operation: vi.fn()
      });
    } catch (error) {
      expect(String(error)).not.toContain('do-not-log');
    }
  });
});
