import { describe, expect, it } from 'vitest';

import { SecretLifecycleError, SecretReferenceLifecycleRegistry, type SecretReference } from '../../src/security/secret-lifecycle.js';

const reference: SecretReference = { secretId: 'secret_1', tenantId: 'tenant_1', kind: 'PROVIDER_CREDENTIAL_REFERENCE', referenceId: 'ref_1', version: 1, activatedAt: '2026-07-01T00:00:00.000Z', status: 'ACTIVE' };

describe('secret-safe secret reference lifecycle and rotation decision', () => {
  it('produces an approval-required rotation decision from references only, without any secret material', () => {
    const registry = new SecretReferenceLifecycleRegistry();
    registry.register(reference);
    const decision = registry.decideRotation({ tenantId: 'tenant_1', referenceId: 'ref_1', version: 1, evaluatedAt: '2026-08-27T00:00:00.000Z', maxAgeDays: 30 });

    expect(decision).toMatchObject({ action: 'ROTATION_REQUIRED', nextVersion: 2, approvalRequired: true, allowAutomaticRotation: false, secret: { secretId: 'secret_1', kind: 'PROVIDER_CREDENTIAL_REFERENCE', referenceId: 'ref_1', version: 1 } });
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('credentialValue');
  });

  it('returns no-action for fresh references and a revoked decision after lifecycle revoke', () => {
    const registry = new SecretReferenceLifecycleRegistry();
    registry.register(reference);
    expect(registry.decideRotation({ tenantId: 'tenant_1', referenceId: 'ref_1', version: 1, evaluatedAt: '2026-07-15T00:00:00.000Z', maxAgeDays: 30 }).action).toBe('NO_ACTION');
    registry.revoke({ tenantId: 'tenant_1', referenceId: 'ref_1', version: 1 });
    expect(registry.decideRotation({ tenantId: 'tenant_1', referenceId: 'ref_1', version: 1, evaluatedAt: '2026-08-27T00:00:00.000Z', maxAgeDays: 30 }).action).toBe('REVOKED');
  });

  it('rejects invalid references, unsafe lookup, invalid age and conflicting registrations fail-closed', () => {
    const registry = new SecretReferenceLifecycleRegistry();
    expect(() => registry.register({ ...reference, kind: 'RAW_SECRET' as never })).toThrow(SecretLifecycleError);
    expect(() => registry.decideRotation({ tenantId: 'bad tenant', referenceId: 'ref_1', version: 1, evaluatedAt: '2026-08-27T00:00:00.000Z', maxAgeDays: 30 })).toThrow(SecretLifecycleError);
    registry.register(reference);
    expect(() => registry.register({ ...reference, status: 'REVOKED' })).toThrow(SecretLifecycleError);
    expect(() => registry.decideRotation({ tenantId: 'tenant_1', referenceId: 'ref_1', version: 1, evaluatedAt: '2026-08-27T00:00:00.000Z', maxAgeDays: 0 })).toThrow(SecretLifecycleError);
  });
});
