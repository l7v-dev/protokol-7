import { describe, expect, it } from 'vitest';

import { IamEnforcementError, IamEnforcementRegistry, type IamIdentity } from '../../src/security/iam-enforcement.js';

const evaluatedAt = '2026-08-27T00:00:00.000Z';
const identity: IamIdentity = { identityId: 'identity_1', tenantId: 'tenant_1', kind: 'API_KEY_REFERENCE', role: 'OPERATOR', referenceId: 'ref_1', expiresAt: '2026-08-28T00:00:00.000Z' };

describe('secret-safe RBAC, identity reference and revocation enforcement', () => {
  it('allows only fixed role permissions inside the identity tenant scope without exposing any credential material', () => {
    const registry = new IamEnforcementRegistry();
    registry.register(identity);

    expect(registry.authorize({ identity, requestedTenantId: 'tenant_1', permission: 'job:execute', evaluatedAt })).toMatchObject({ allowed: true, code: 'ALLOWED', identity: { kind: 'API_KEY_REFERENCE', referenceId: 'ref_1', role: 'OPERATOR' } });
    expect(registry.authorize({ identity, requestedTenantId: 'tenant_1', permission: 'security:manage', evaluatedAt })).toMatchObject({ allowed: false, code: 'ROLE_FORBIDDEN' });
    expect(JSON.stringify(registry.authorize({ identity, requestedTenantId: 'tenant_1', permission: 'job:read', evaluatedAt }))).not.toContain('token');
  });

  it('denies cross-tenant, revoked and expired API/OAuth session reference identities deterministically', () => {
    const registry = new IamEnforcementRegistry();
    registry.register(identity);
    expect(registry.authorize({ identity, requestedTenantId: 'tenant_2', permission: 'job:read', evaluatedAt }).code).toBe('TENANT_SCOPE_MISMATCH');
    registry.revoke({ tenantId: 'tenant_1', referenceId: 'ref_1' });
    expect(registry.authorize({ identity, requestedTenantId: 'tenant_1', permission: 'job:read', evaluatedAt }).code).toBe('IDENTITY_REVOKED');
    const oauth: IamIdentity = { ...identity, identityId: 'identity_2', kind: 'OAUTH_SESSION_REFERENCE', referenceId: 'ref_2', expiresAt: evaluatedAt };
    expect(registry.authorize({ identity: oauth, requestedTenantId: 'tenant_1', permission: 'job:read', evaluatedAt }).code).toBe('IDENTITY_EXPIRED');
  });

  it('rejects arbitrary roles, permissions, unsafe references and conflicting registrations fail-closed', () => {
    const registry = new IamEnforcementRegistry();
    expect(() => registry.register({ ...identity, role: 'ADMIN' as never })).toThrow(IamEnforcementError);
    expect(() => registry.authorize({ identity, requestedTenantId: 'tenant_1', permission: 'billing:pay' as never, evaluatedAt })).toThrow(IamEnforcementError);
    expect(() => registry.revoke({ tenantId: 'bad tenant', referenceId: 'ref_1' })).toThrow(IamEnforcementError);
    registry.register(identity);
    expect(() => registry.register({ ...identity, role: 'OWNER' })).toThrow(IamEnforcementError);
  });
});
