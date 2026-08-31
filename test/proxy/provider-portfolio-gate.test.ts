import { describe, expect, it } from 'vitest';

import {
  ProviderPortfolioGateError,
  evaluateProviderPortfolioGate
} from '../../src/proxy/provider-portfolio-gate.js';
import type { ProviderPortfolioEvidence, ProviderPortfolioGateInput } from '../../src/proxy/provider-portfolio-gate.js';

const providers: ProviderPortfolioEvidence[] = [
  { providerId: 'bright_data_reference', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' },
  { providerId: 'oxylabs_reference', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' },
  { providerId: 'zyte_reference', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' },
  { providerId: 'internal_provider', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' }
];

function input(overrides: Partial<ProviderPortfolioGateInput> = {}): ProviderPortfolioGateInput {
  return { tenantId: 'tenant_1', gateId: 'portfolio_gate_1', providers, ...overrides };
}

describe('provider portfolio local-reference gate', () => {
  it('passes complete local reference evidence but explicitly cannot activate, release or call providers', () => {
    const result = evaluateProviderPortfolioGate(input());
    expect(result).toMatchObject({
      status: 'LOCAL_REFERENCE_GATE_PASSED',
      reasonCode: 'ALL_LOCAL_REFERENCE_EVIDENCE_ACCEPTED',
      locallyQualifiedProviderIds: ['bright_data_reference', 'internal_provider', 'oxylabs_reference', 'zyte_reference'],
      locallyRejectedProviderIds: [],
      requiresRealProviderCertification: true,
      requiresProductionSecuritySignOff: true,
      requiresExplicitProductionReleaseApproval: true,
      allowsProviderActivation: false,
      allowsProductionRelease: false,
      allowsExternalProviderCall: false
    });
  });

  it('rejects non-conformant or locally uncertified providers without claiming that a runtime provider was disabled', () => {
    const result = evaluateProviderPortfolioGate(input({ providers: providers.map((provider) => provider.providerId === 'zyte_reference' ? { ...provider, conformanceStatus: 'NON_CONFORMANT', certificationStatus: 'LOCAL_REFERENCE_REJECTED' } : provider) }));
    expect(result).toMatchObject({ status: 'LOCAL_REFERENCE_GATE_REJECTED', reasonCode: 'LOCAL_CONFORMANCE_REJECTED', locallyRejectedProviderIds: ['zyte_reference'] });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('credential');
    expect(serialized).not.toContain('endpoint');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('account');
  });

  it('rejects locally certified providers that still require an operations review', () => {
    const result = evaluateProviderPortfolioGate(input({ providers: providers.map((provider) => provider.providerId === 'internal_provider' ? { ...provider, supportRunbookRoute: 'MANUAL_CREDENTIAL_ROTATION_REVIEW' } : provider) }));
    expect(result).toMatchObject({ status: 'LOCAL_REFERENCE_GATE_REJECTED', reasonCode: 'OPERATIONS_REVIEW_REQUIRED', locallyRejectedProviderIds: ['internal_provider'] });
  });

  it('fails closed before evaluation for unsafe, duplicate or unbounded portfolio evidence', () => {
    expect(() => evaluateProviderPortfolioGate(input({ tenantId: 'tenant unsafe' }))).toThrow(ProviderPortfolioGateError);
    expect(() => evaluateProviderPortfolioGate(input({ providers: [{ ...providers[0]! }, { ...providers[0]! }] }))).toThrow(ProviderPortfolioGateError);
    expect(() => evaluateProviderPortfolioGate(input({ providers: Array.from({ length: 13 }, (_, index) => ({ ...providers[0]!, providerId: `provider_${index}` })) }))).toThrow(ProviderPortfolioGateError);
  });
});
