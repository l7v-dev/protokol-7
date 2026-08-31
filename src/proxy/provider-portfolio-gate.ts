import type { LocalReferenceStatus } from './provider-decision-reference.js';
import type { ProviderSupportRunbookRoute } from './provider-operations-reference.js';

export const PROVIDER_PORTFOLIO_GATE_CONTRACT_VERSION = 'provider-portfolio-gate/v1' as const;

export type ProviderPortfolioConformanceStatus = 'CONFORMANT_REFERENCE' | 'NON_CONFORMANT';
export type ProviderPortfolioGateStatus = 'LOCAL_REFERENCE_GATE_PASSED' | 'LOCAL_REFERENCE_GATE_REJECTED';
export type ProviderPortfolioGateReasonCode = 'ALL_LOCAL_REFERENCE_EVIDENCE_ACCEPTED' | 'LOCAL_CONFORMANCE_REJECTED' | 'LOCAL_CERTIFICATION_REJECTED' | 'OPERATIONS_REVIEW_REQUIRED';

export type ProviderPortfolioEvidence = {
  providerId: string;
  providerVersion: string;
  conformanceStatus: ProviderPortfolioConformanceStatus;
  certificationStatus: LocalReferenceStatus;
  supportRunbookRoute: ProviderSupportRunbookRoute;
  activationState: 'NOT_ACTIVATED';
};

export type ProviderPortfolioGateInput = {
  tenantId: string;
  gateId: string;
  providers: ReadonlyArray<ProviderPortfolioEvidence>;
};

export type ProviderPortfolioGateResult = {
  contractVersion: typeof PROVIDER_PORTFOLIO_GATE_CONTRACT_VERSION;
  tenantId: string;
  gateId: string;
  status: ProviderPortfolioGateStatus;
  reasonCode: ProviderPortfolioGateReasonCode;
  locallyQualifiedProviderIds: string[];
  locallyRejectedProviderIds: string[];
  requiresRealProviderCertification: true;
  requiresProductionSecuritySignOff: true;
  requiresExplicitProductionReleaseApproval: true;
  allowsProviderActivation: false;
  allowsProductionRelease: false;
  allowsExternalProviderCall: false;
};

export class ProviderPortfolioGateError extends Error {
  public constructor(public readonly code: 'PROVIDER_PORTFOLIO_GATE_INVALID', message: string) {
    super(message);
    this.name = 'ProviderPortfolioGateError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_PROVIDER_EVIDENCE = 12;

/**
 * Pure local-reference portfolio gate. It verifies supplied bounded evidence
 * only; it cannot enable/disable a runtime provider, release to production,
 * call a provider, inspect credentials or change operational state.
 */
export function evaluateProviderPortfolioGate(input: ProviderPortfolioGateInput): ProviderPortfolioGateResult {
  validate(input);
  const qualified = input.providers.filter(isLocallyQualified).map((provider) => provider.providerId).sort();
  const rejected = input.providers.filter((provider) => !isLocallyQualified(provider)).map((provider) => provider.providerId).sort();
  const reasonCode = reasonFor(input.providers);
  return {
    contractVersion: PROVIDER_PORTFOLIO_GATE_CONTRACT_VERSION,
    tenantId: input.tenantId,
    gateId: input.gateId,
    status: rejected.length === 0 ? 'LOCAL_REFERENCE_GATE_PASSED' : 'LOCAL_REFERENCE_GATE_REJECTED',
    reasonCode,
    locallyQualifiedProviderIds: qualified,
    locallyRejectedProviderIds: rejected,
    requiresRealProviderCertification: true,
    requiresProductionSecuritySignOff: true,
    requiresExplicitProductionReleaseApproval: true,
    allowsProviderActivation: false,
    allowsProductionRelease: false,
    allowsExternalProviderCall: false
  };
}

function isLocallyQualified(provider: ProviderPortfolioEvidence): boolean {
  return provider.conformanceStatus === 'CONFORMANT_REFERENCE'
    && provider.certificationStatus === 'LOCAL_REFERENCE_CERTIFIED'
    && provider.supportRunbookRoute === 'NO_ACTION'
    && provider.activationState === 'NOT_ACTIVATED';
}

function reasonFor(providers: ReadonlyArray<ProviderPortfolioEvidence>): ProviderPortfolioGateReasonCode {
  if (providers.every(isLocallyQualified)) return 'ALL_LOCAL_REFERENCE_EVIDENCE_ACCEPTED';
  if (providers.some((provider) => provider.conformanceStatus === 'NON_CONFORMANT')) return 'LOCAL_CONFORMANCE_REJECTED';
  if (providers.some((provider) => provider.certificationStatus === 'LOCAL_REFERENCE_REJECTED')) return 'LOCAL_CERTIFICATION_REJECTED';
  return 'OPERATIONS_REVIEW_REQUIRED';
}

function validate(input: ProviderPortfolioGateInput): void {
  if (!SAFE_ID.test(input.tenantId) || !SAFE_ID.test(input.gateId)
    || input.providers.length < 1 || input.providers.length > MAX_PROVIDER_EVIDENCE
    || new Set(input.providers.map((provider) => provider.providerId)).size !== input.providers.length
    || input.providers.some((provider) => !SAFE_ID.test(provider.providerId)
      || !SAFE_ID.test(provider.providerVersion)
      || !['CONFORMANT_REFERENCE', 'NON_CONFORMANT'].includes(provider.conformanceStatus)
      || !['LOCAL_REFERENCE_CERTIFIED', 'LOCAL_REFERENCE_REJECTED'].includes(provider.certificationStatus)
      || !['NO_ACTION', 'MANUAL_ONBOARDING_REVIEW', 'MANUAL_QUOTA_REVIEW', 'MANUAL_CREDENTIAL_ROTATION_REVIEW', 'MANUAL_SECURITY_REVIEW'].includes(provider.supportRunbookRoute)
      || provider.activationState !== 'NOT_ACTIVATED')) {
    throw new ProviderPortfolioGateError('PROVIDER_PORTFOLIO_GATE_INVALID', 'Provider portfolio gate input geçerli değil.');
  }
}
