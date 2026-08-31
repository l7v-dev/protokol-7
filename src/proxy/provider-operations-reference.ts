import type { LocalReferenceStatus } from './provider-decision-reference.js';

export const PROVIDER_OPERATIONS_REFERENCE_CONTRACT_VERSION = 'provider-operations-reference/v1' as const;

export type ProviderOnboardingReferenceStatus = 'LOCAL_REFERENCE_READY' | 'REAL_PROVIDER_ONBOARDING_REQUIRED';
export type ProviderQuotaReferenceStatus = 'WITHIN_LOCAL_REFERENCE' | 'LIMIT_REACHED' | 'UNKNOWN';
export type CredentialReferenceStatus = 'ACTIVE' | 'REVOKED';
export type CredentialRotationReferenceAction = 'NO_ACTION' | 'ROTATION_REQUIRED' | 'REVOKED';
export type ProviderSupportRunbookRoute = 'NO_ACTION' | 'MANUAL_ONBOARDING_REVIEW' | 'MANUAL_QUOTA_REVIEW' | 'MANUAL_CREDENTIAL_ROTATION_REVIEW' | 'MANUAL_SECURITY_REVIEW';

export type ProviderOperationsReferenceInput = {
  tenantId: string;
  providerId: string;
  providerVersion: string;
  localReferenceStatus: LocalReferenceStatus;
  onboardingStatus: ProviderOnboardingReferenceStatus;
  quota: {
    status: ProviderQuotaReferenceStatus;
    remainingPercent: number;
  };
  credentialReference: {
    referenceId: string;
    version: number;
    status: CredentialReferenceStatus;
  };
  rotation: {
    action: CredentialRotationReferenceAction;
    nextVersion: number | null;
  };
};

export type ProviderOperationsReference = {
  contractVersion: typeof PROVIDER_OPERATIONS_REFERENCE_CONTRACT_VERSION;
  tenantId: string;
  providerId: string;
  providerVersion: string;
  supportRunbookRoute: ProviderSupportRunbookRoute;
  requiresRealProviderOnboarding: true;
  requiresExplicitCredentialRotationApproval: true;
  requiresExplicitQuotaApproval: true;
  allowsAutomaticCredentialRotation: false;
  allowsProviderActivation: false;
  allowsExternalProviderCall: false;
};

export class ProviderOperationsReferenceError extends Error {
  public constructor(public readonly code: 'PROVIDER_OPERATIONS_REFERENCE_INVALID', message: string) {
    super(message);
    this.name = 'ProviderOperationsReferenceError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Side-effect-free provider operations reference. It evaluates only bounded
 * metadata and maps it to a manual runbook route. No provider is onboarded,
 * activated, contacted, dispatched, credential-rotated or quota-queried.
 */
export function evaluateProviderOperationsReference(input: ProviderOperationsReferenceInput): ProviderOperationsReference {
  validate(input);
  return {
    contractVersion: PROVIDER_OPERATIONS_REFERENCE_CONTRACT_VERSION,
    tenantId: input.tenantId,
    providerId: input.providerId,
    providerVersion: input.providerVersion,
    supportRunbookRoute: routeFor(input),
    requiresRealProviderOnboarding: true,
    requiresExplicitCredentialRotationApproval: true,
    requiresExplicitQuotaApproval: true,
    allowsAutomaticCredentialRotation: false,
    allowsProviderActivation: false,
    allowsExternalProviderCall: false
  };
}

function routeFor(input: ProviderOperationsReferenceInput): ProviderSupportRunbookRoute {
  if (input.credentialReference.status === 'REVOKED' || input.rotation.action === 'REVOKED') return 'MANUAL_SECURITY_REVIEW';
  if (input.quota.status === 'LIMIT_REACHED' || input.quota.status === 'UNKNOWN') return 'MANUAL_QUOTA_REVIEW';
  if (input.rotation.action === 'ROTATION_REQUIRED') return 'MANUAL_CREDENTIAL_ROTATION_REVIEW';
  if (input.localReferenceStatus === 'LOCAL_REFERENCE_REJECTED' || input.onboardingStatus === 'REAL_PROVIDER_ONBOARDING_REQUIRED') return 'MANUAL_ONBOARDING_REVIEW';
  return 'NO_ACTION';
}

function validate(input: ProviderOperationsReferenceInput): void {
  if (!SAFE_ID.test(input.tenantId) || !SAFE_ID.test(input.providerId) || !SAFE_ID.test(input.providerVersion)
    || !SAFE_ID.test(input.credentialReference.referenceId)
    || !['LOCAL_REFERENCE_CERTIFIED', 'LOCAL_REFERENCE_REJECTED'].includes(input.localReferenceStatus)
    || !['LOCAL_REFERENCE_READY', 'REAL_PROVIDER_ONBOARDING_REQUIRED'].includes(input.onboardingStatus)
    || !['WITHIN_LOCAL_REFERENCE', 'LIMIT_REACHED', 'UNKNOWN'].includes(input.quota.status)
    || !Number.isFinite(input.quota.remainingPercent) || input.quota.remainingPercent < 0 || input.quota.remainingPercent > 100
    || !Number.isInteger(input.credentialReference.version) || input.credentialReference.version < 1
    || !['ACTIVE', 'REVOKED'].includes(input.credentialReference.status)
    || !['NO_ACTION', 'ROTATION_REQUIRED', 'REVOKED'].includes(input.rotation.action)
    || (input.rotation.action === 'ROTATION_REQUIRED' && (!Number.isInteger(input.rotation.nextVersion) || input.rotation.nextVersion !== input.credentialReference.version + 1))
    || (input.rotation.action !== 'ROTATION_REQUIRED' && input.rotation.nextVersion !== null)) {
    throw new ProviderOperationsReferenceError('PROVIDER_OPERATIONS_REFERENCE_INVALID', 'Provider operations reference input geçerli değil.');
  }
}
