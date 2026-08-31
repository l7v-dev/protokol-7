export const SECRET_LIFECYCLE_CONTRACT_VERSION = 'secret-lifecycle/v1' as const;

export type SecretKind = 'PROVIDER_CREDENTIAL_REFERENCE' | 'API_KEY_REFERENCE' | 'OAUTH_CLIENT_REFERENCE' | 'ENCRYPTION_KEY_REFERENCE';
export type SecretLifecycleStatus = 'ACTIVE' | 'REVOKED';
export type SecretReference = { secretId: string; tenantId: string; kind: SecretKind; referenceId: string; version: number; activatedAt: string; status: SecretLifecycleStatus };
export type RotationDecision = {
  contractVersion: typeof SECRET_LIFECYCLE_CONTRACT_VERSION;
  secret: { secretId: string; tenantId: string; kind: SecretKind; referenceId: string; version: number; status: SecretLifecycleStatus };
  evaluatedAt: string;
  maxAgeDays: number;
  action: 'NO_ACTION' | 'ROTATION_REQUIRED' | 'REVOKED';
  nextVersion: number | null;
  approvalRequired: true;
  allowAutomaticRotation: false;
};

export class SecretLifecycleError extends Error {
  public constructor(public readonly code: 'SECRET_LIFECYCLE_INVALID' | 'SECRET_LIFECYCLE_CONFLICT' | 'SECRET_LIFECYCLE_NOT_FOUND', message: string) {
    super(message);
    this.name = 'SecretLifecycleError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_ROTATION_AGE_DAYS = 365;

/**
 * Process-local lifecycle registry for secret references only. It never accepts,
 * stores, resolves, logs, hashes or returns a secret value, credential, token,
 * key material, password, cookie or authorization header. Its rotation output
 * is an approval-required decision and cannot rotate an external credential.
 */
export class SecretReferenceLifecycleRegistry {
  private readonly references = new Map<string, SecretReference>();

  public register(reference: SecretReference): SecretReference {
    validateReference(reference);
    const key = referenceKey(reference.tenantId, reference.referenceId, reference.version);
    const existing = this.references.get(key);
    if (existing !== undefined) {
      if (sameReference(existing, reference)) return clone(existing);
      throw new SecretLifecycleError('SECRET_LIFECYCLE_CONFLICT', 'Aynı tenant/reference/version secret lifecycle farklı içerikle tekrar kullanılamaz.');
    }
    this.references.set(key, clone(reference));
    return clone(reference);
  }

  public revoke(input: { tenantId: string; referenceId: string; version: number }): SecretReference {
    validateLookup(input);
    const reference = this.references.get(referenceKey(input.tenantId, input.referenceId, input.version));
    if (reference === undefined) throw new SecretLifecycleError('SECRET_LIFECYCLE_NOT_FOUND', 'Secret reference bulunamadı.');
    const revoked = { ...reference, status: 'REVOKED' as const };
    this.references.set(referenceKey(input.tenantId, input.referenceId, input.version), revoked);
    return clone(revoked);
  }

  public decideRotation(input: { tenantId: string; referenceId: string; version: number; evaluatedAt: string; maxAgeDays: number }): RotationDecision {
    validateLookup(input);
    if (!Number.isFinite(Date.parse(input.evaluatedAt)) || !Number.isInteger(input.maxAgeDays) || input.maxAgeDays < 1 || input.maxAgeDays > MAX_ROTATION_AGE_DAYS) throw invalid();
    const reference = this.references.get(referenceKey(input.tenantId, input.referenceId, input.version));
    if (reference === undefined) throw new SecretLifecycleError('SECRET_LIFECYCLE_NOT_FOUND', 'Secret reference bulunamadı.');
    const action = reference.status === 'REVOKED' ? 'REVOKED' : Date.parse(input.evaluatedAt) - Date.parse(reference.activatedAt) >= input.maxAgeDays * 86_400_000 ? 'ROTATION_REQUIRED' : 'NO_ACTION';
    return {
      contractVersion: SECRET_LIFECYCLE_CONTRACT_VERSION,
      secret: toPublic(reference), evaluatedAt: input.evaluatedAt, maxAgeDays: input.maxAgeDays, action,
      nextVersion: action === 'ROTATION_REQUIRED' ? reference.version + 1 : null,
      approvalRequired: true, allowAutomaticRotation: false
    };
  }
}

function validateReference(reference: SecretReference): void {
  if (!SAFE_ID.test(reference.secretId) || !SAFE_ID.test(reference.tenantId) || !SAFE_ID.test(reference.referenceId)
    || !['PROVIDER_CREDENTIAL_REFERENCE', 'API_KEY_REFERENCE', 'OAUTH_CLIENT_REFERENCE', 'ENCRYPTION_KEY_REFERENCE'].includes(reference.kind)
    || !Number.isInteger(reference.version) || reference.version < 1 || !Number.isFinite(Date.parse(reference.activatedAt))
    || (reference.status !== 'ACTIVE' && reference.status !== 'REVOKED')) throw invalid();
}

function validateLookup(input: { tenantId: string; referenceId: string; version: number }): void {
  if (!SAFE_ID.test(input.tenantId) || !SAFE_ID.test(input.referenceId) || !Number.isInteger(input.version) || input.version < 1) throw invalid();
}

function referenceKey(tenantId: string, referenceId: string, version: number): string {
  return `${tenantId}:${referenceId}:${version}`;
}

function sameReference(left: SecretReference, right: SecretReference): boolean {
  return left.secretId === right.secretId && left.tenantId === right.tenantId && left.kind === right.kind && left.referenceId === right.referenceId && left.version === right.version && left.activatedAt === right.activatedAt && left.status === right.status;
}

function toPublic(reference: SecretReference): RotationDecision['secret'] {
  return { secretId: reference.secretId, tenantId: reference.tenantId, kind: reference.kind, referenceId: reference.referenceId, version: reference.version, status: reference.status };
}

function clone(reference: SecretReference): SecretReference {
  return { ...reference };
}

function invalid(): SecretLifecycleError {
  return new SecretLifecycleError('SECRET_LIFECYCLE_INVALID', 'Secret lifecycle input geçerli değil.');
}
