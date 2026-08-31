export const IAM_ENFORCEMENT_CONTRACT_VERSION = 'iam-enforcement/v1' as const;

export type IamRole = 'OWNER' | 'OPERATOR' | 'ANALYST' | 'VIEWER' | 'SERVICE';
export type IamPermission = 'project:read' | 'job:read' | 'job:execute' | 'dataset:read' | 'dataset:export' | 'security:manage';
export type IdentityKind = 'API_KEY_REFERENCE' | 'OAUTH_SESSION_REFERENCE';
export type IamIdentity = { identityId: string; tenantId: string; kind: IdentityKind; role: IamRole; referenceId: string; expiresAt: string };
export type IamAuthorizationDecision = {
  contractVersion: typeof IAM_ENFORCEMENT_CONTRACT_VERSION;
  allowed: boolean;
  code: 'ALLOWED' | 'TENANT_SCOPE_MISMATCH' | 'ROLE_FORBIDDEN' | 'IDENTITY_REVOKED' | 'IDENTITY_EXPIRED';
  identity: { identityId: string; tenantId: string; kind: IdentityKind; role: IamRole; referenceId: string };
  permission: IamPermission;
};

export class IamEnforcementError extends Error {
  public constructor(public readonly code: 'IAM_ENFORCEMENT_INVALID' | 'IAM_ENFORCEMENT_CONFLICT', message: string) {
    super(message);
    this.name = 'IamEnforcementError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const PERMISSIONS: Readonly<Record<IamRole, ReadonlyArray<IamPermission>>> = {
  OWNER: ['project:read', 'job:read', 'job:execute', 'dataset:read', 'dataset:export', 'security:manage'],
  OPERATOR: ['project:read', 'job:read', 'job:execute', 'dataset:read'],
  ANALYST: ['project:read', 'job:read', 'dataset:read', 'dataset:export'],
  VIEWER: ['project:read', 'job:read', 'dataset:read'],
  SERVICE: ['project:read', 'job:read', 'job:execute', 'dataset:read', 'dataset:export']
};

/**
 * Process-local authorization and revocation decision contract. It receives no
 * API key, OAuth access token, refresh token, cookie or session material; it
 * evaluates only safe identity/reference identifiers and cannot authenticate,
 * persist revocations or alter a Fastify request/session.
 */
export class IamEnforcementRegistry {
  private readonly identities = new Map<string, IamIdentity>();
  private readonly revoked = new Set<string>();

  public register(identity: IamIdentity): IamIdentity {
    validateIdentity(identity);
    const key = identityKey(identity.tenantId, identity.referenceId);
    const existing = this.identities.get(key);
    if (existing !== undefined) {
      if (sameIdentity(existing, identity)) return cloneIdentity(existing);
      throw new IamEnforcementError('IAM_ENFORCEMENT_CONFLICT', 'Aynı tenant/reference identity farklı içerikle tekrar kullanılamaz.');
    }
    this.identities.set(key, cloneIdentity(identity));
    return cloneIdentity(identity);
  }

  public revoke(input: { tenantId: string; referenceId: string }): void {
    validateReference(input.tenantId, input.referenceId);
    this.revoked.add(identityKey(input.tenantId, input.referenceId));
  }

  public authorize(input: { identity: IamIdentity; requestedTenantId: string; permission: IamPermission; evaluatedAt: string }): IamAuthorizationDecision {
    validateIdentity(input.identity);
    if (!SAFE_ID.test(input.requestedTenantId) || !isPermission(input.permission) || !Number.isFinite(Date.parse(input.evaluatedAt))) throw invalid();
    const identity = toPublicIdentity(input.identity);
    if (input.identity.tenantId !== input.requestedTenantId) return decision(false, 'TENANT_SCOPE_MISMATCH', identity, input.permission);
    if (this.revoked.has(identityKey(input.identity.tenantId, input.identity.referenceId))) return decision(false, 'IDENTITY_REVOKED', identity, input.permission);
    if (Date.parse(input.identity.expiresAt) <= Date.parse(input.evaluatedAt)) return decision(false, 'IDENTITY_EXPIRED', identity, input.permission);
    if (!PERMISSIONS[input.identity.role].includes(input.permission)) return decision(false, 'ROLE_FORBIDDEN', identity, input.permission);
    return decision(true, 'ALLOWED', identity, input.permission);
  }
}

function decision(allowed: boolean, code: IamAuthorizationDecision['code'], identity: IamAuthorizationDecision['identity'], permission: IamPermission): IamAuthorizationDecision {
  return { contractVersion: IAM_ENFORCEMENT_CONTRACT_VERSION, allowed, code, identity, permission };
}

function validateIdentity(identity: IamIdentity): void {
  validateReference(identity.tenantId, identity.referenceId);
  if (!SAFE_ID.test(identity.identityId) || !isKind(identity.kind) || !isRole(identity.role) || !Number.isFinite(Date.parse(identity.expiresAt))) throw invalid();
}

function validateReference(tenantId: string, referenceId: string): void {
  if (!SAFE_ID.test(tenantId) || !SAFE_ID.test(referenceId)) throw invalid();
}

function isKind(value: string): value is IdentityKind {
  return value === 'API_KEY_REFERENCE' || value === 'OAUTH_SESSION_REFERENCE';
}

function isRole(value: string): value is IamRole {
  return Object.hasOwn(PERMISSIONS, value);
}

function isPermission(value: string): value is IamPermission {
  return Object.values(PERMISSIONS).flat().includes(value as IamPermission);
}

function identityKey(tenantId: string, referenceId: string): string {
  return `${tenantId}:${referenceId}`;
}

function sameIdentity(left: IamIdentity, right: IamIdentity): boolean {
  return left.identityId === right.identityId && left.tenantId === right.tenantId && left.kind === right.kind && left.role === right.role && left.referenceId === right.referenceId && left.expiresAt === right.expiresAt;
}

function toPublicIdentity(identity: IamIdentity): IamAuthorizationDecision['identity'] {
  return { identityId: identity.identityId, tenantId: identity.tenantId, kind: identity.kind, role: identity.role, referenceId: identity.referenceId };
}

function cloneIdentity(identity: IamIdentity): IamIdentity {
  return { ...identity };
}

function invalid(): IamEnforcementError {
  return new IamEnforcementError('IAM_ENFORCEMENT_INVALID', 'IAM enforcement input geçerli değil.');
}
