import { describe, expect, it } from 'vitest';

import {
  ProviderOperationsReferenceError,
  evaluateProviderOperationsReference
} from '../../src/proxy/provider-operations-reference.js';
import type { ProviderOperationsReferenceInput } from '../../src/proxy/provider-operations-reference.js';

function input(overrides: Partial<ProviderOperationsReferenceInput> = {}): ProviderOperationsReferenceInput {
  return {
    tenantId: 'tenant_1',
    providerId: 'internal_provider',
    providerVersion: 'reference_1.0.0',
    localReferenceStatus: 'LOCAL_REFERENCE_CERTIFIED',
    onboardingStatus: 'LOCAL_REFERENCE_READY',
    quota: { status: 'WITHIN_LOCAL_REFERENCE', remainingPercent: 75 },
    credentialReference: { referenceId: 'credential_ref_1', version: 1, status: 'ACTIVE' },
    rotation: { action: 'NO_ACTION', nextVersion: null },
    ...overrides
  };
}

describe('provider operations local reference contract', () => {
  it('maps a complete local-reference posture to no action while prohibiting onboarding execution, rotation and external calls', () => {
    const result = evaluateProviderOperationsReference(input());
    expect(result).toMatchObject({
      supportRunbookRoute: 'NO_ACTION',
      requiresRealProviderOnboarding: true,
      requiresExplicitCredentialRotationApproval: true,
      requiresExplicitQuotaApproval: true,
      allowsAutomaticCredentialRotation: false,
      allowsProviderActivation: false,
      allowsExternalProviderCall: false
    });
  });

  it('routes local quota, rotation and onboarding conditions to manual-only support reviews', () => {
    expect(evaluateProviderOperationsReference(input({ quota: { status: 'LIMIT_REACHED', remainingPercent: 0 } })).supportRunbookRoute).toBe('MANUAL_QUOTA_REVIEW');
    expect(evaluateProviderOperationsReference(input({ rotation: { action: 'ROTATION_REQUIRED', nextVersion: 2 } })).supportRunbookRoute).toBe('MANUAL_CREDENTIAL_ROTATION_REVIEW');
    expect(evaluateProviderOperationsReference(input({ onboardingStatus: 'REAL_PROVIDER_ONBOARDING_REQUIRED' })).supportRunbookRoute).toBe('MANUAL_ONBOARDING_REVIEW');
    expect(evaluateProviderOperationsReference(input({ localReferenceStatus: 'LOCAL_REFERENCE_REJECTED' })).supportRunbookRoute).toBe('MANUAL_ONBOARDING_REVIEW');
  });

  it('prioritizes revoked credential reference conditions as a manual security review without exposing credential material', () => {
    const result = evaluateProviderOperationsReference(input({ credentialReference: { referenceId: 'credential_ref_1', version: 1, status: 'REVOKED' }, quota: { status: 'LIMIT_REACHED', remainingPercent: 0 } }));
    expect(result.supportRunbookRoute).toBe('MANUAL_SECURITY_REVIEW');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('credential_ref_1');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('endpoint');
  });

  it('rejects unsafe identifiers, invalid quota values and inconsistent rotation reference metadata before route selection', () => {
    expect(() => evaluateProviderOperationsReference(input({ tenantId: 'tenant unsafe' }))).toThrow(ProviderOperationsReferenceError);
    expect(() => evaluateProviderOperationsReference(input({ quota: { status: 'WITHIN_LOCAL_REFERENCE', remainingPercent: 101 } }))).toThrow(ProviderOperationsReferenceError);
    expect(() => evaluateProviderOperationsReference(input({ rotation: { action: 'ROTATION_REQUIRED', nextVersion: 9 } }))).toThrow(ProviderOperationsReferenceError);
    expect(() => evaluateProviderOperationsReference(input({ rotation: { action: 'NO_ACTION', nextVersion: 2 } }))).toThrow(ProviderOperationsReferenceError);
  });
});
