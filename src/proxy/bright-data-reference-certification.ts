import { evaluateProviderConformance, type ProviderConformanceCheckId, type ProviderConformanceReport } from './provider-conformance.js';

export const BRIGHT_DATA_REFERENCE_CERTIFICATION_CONTRACT_VERSION = 'bright-data-reference-certification/v1' as const;
export type BrightDataReferenceCertification = {
  contractVersion: typeof BRIGHT_DATA_REFERENCE_CERTIFICATION_CONTRACT_VERSION;
  certificationId: string;
  adapterId: string;
  providerReference: 'BRIGHT_DATA_REFERENCE';
  providerVersion: string;
  reviewedAt: string;
  status: 'LOCAL_REFERENCE_CERTIFIED' | 'LOCAL_REFERENCE_REJECTED';
  conformance: Pick<ProviderConformanceReport, 'status' | 'passedCheckIds' | 'failedCheckIds'>;
  requiresRealProviderCertification: true;
  allowsProviderActivation: false;
  allowsExternalProviderCall: false;
};

export class BrightDataReferenceCertificationError extends Error {
  public constructor(public readonly code: 'BRIGHT_DATA_REFERENCE_CERTIFICATION_INVALID' | 'BRIGHT_DATA_REFERENCE_CERTIFICATION_CONFLICT', message: string) {
    super(message);
    this.name = 'BrightDataReferenceCertificationError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Immutable local-reference certification registry. `BRIGHT_DATA_REFERENCE` is
 * a classification label only: this contract never contacts Bright Data or any
 * provider, uses an account, resolves credentials, acquires a proxy or certifies
 * a production adapter.
 */
export class BrightDataReferenceCertificationRegistry {
  private readonly certifications = new Map<string, BrightDataReferenceCertification>();

  public certify(input: { certificationId: string; adapterId: string; providerReference: 'BRIGHT_DATA_REFERENCE'; providerVersion: string; reviewedAt: string; checks: ReadonlyArray<{ checkId: ProviderConformanceCheckId; status: 'PASS' | 'FAIL' }> }): BrightDataReferenceCertification {
    validate(input);
    const conformance = evaluateProviderConformance({ adapterId: input.adapterId, providerId: 'BRIGHT_DATA_REFERENCE', providerVersion: input.providerVersion, executionMode: 'LOCAL_TEST_DOUBLE', checks: input.checks });
    const certification: BrightDataReferenceCertification = {
      contractVersion: BRIGHT_DATA_REFERENCE_CERTIFICATION_CONTRACT_VERSION, certificationId: input.certificationId, adapterId: input.adapterId,
      providerReference: 'BRIGHT_DATA_REFERENCE', providerVersion: input.providerVersion, reviewedAt: input.reviewedAt,
      status: conformance.status === 'CONFORMANT_REFERENCE' ? 'LOCAL_REFERENCE_CERTIFIED' : 'LOCAL_REFERENCE_REJECTED',
      conformance: { status: conformance.status, passedCheckIds: [...conformance.passedCheckIds], failedCheckIds: [...conformance.failedCheckIds] },
      requiresRealProviderCertification: true, allowsProviderActivation: false, allowsExternalProviderCall: false
    };
    const existing = this.certifications.get(input.certificationId);
    if (existing !== undefined) {
      if (same(existing, certification)) return clone(existing);
      throw new BrightDataReferenceCertificationError('BRIGHT_DATA_REFERENCE_CERTIFICATION_CONFLICT', 'Certification ID farklı içerikle tekrar kullanılamaz.');
    }
    this.certifications.set(input.certificationId, certification);
    return clone(certification);
  }
}

function validate(input: { certificationId: string; adapterId: string; providerReference: string; providerVersion: string; reviewedAt: string; checks: ReadonlyArray<{ checkId: string; status: string }> }): void {
  if (![input.certificationId, input.adapterId, input.providerVersion].every((value) => SAFE_ID.test(value)) || input.providerReference !== 'BRIGHT_DATA_REFERENCE' || !Number.isFinite(Date.parse(input.reviewedAt))) throw invalid();
}

function same(left: BrightDataReferenceCertification, right: BrightDataReferenceCertification): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value: BrightDataReferenceCertification): BrightDataReferenceCertification {
  return { ...value, conformance: { ...value.conformance, passedCheckIds: [...value.conformance.passedCheckIds], failedCheckIds: [...value.conformance.failedCheckIds] } };
}

function invalid(): BrightDataReferenceCertificationError {
  return new BrightDataReferenceCertificationError('BRIGHT_DATA_REFERENCE_CERTIFICATION_INVALID', 'Provider reference certification input geçerli değil.');
}
