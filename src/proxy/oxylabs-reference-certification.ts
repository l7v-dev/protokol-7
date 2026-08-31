import { evaluateProviderConformance, type ProviderConformanceCheckId, type ProviderConformanceReport } from './provider-conformance.js';

export const OXYLABS_REFERENCE_CERTIFICATION_CONTRACT_VERSION = 'oxylabs-reference-certification/v1' as const;
export type OxylabsReferenceCertification = {
  contractVersion: typeof OXYLABS_REFERENCE_CERTIFICATION_CONTRACT_VERSION;
  certificationId: string;
  adapterId: string;
  providerReference: 'OXYLABS_REFERENCE';
  providerVersion: string;
  reviewedAt: string;
  status: 'LOCAL_REFERENCE_CERTIFIED' | 'LOCAL_REFERENCE_REJECTED';
  conformance: Pick<ProviderConformanceReport, 'status' | 'passedCheckIds' | 'failedCheckIds'>;
  requiresRealProviderCertification: true;
  allowsProviderActivation: false;
  allowsExternalProviderCall: false;
};

export class OxylabsReferenceCertificationError extends Error {
  public constructor(public readonly code: 'OXYLABS_REFERENCE_CERTIFICATION_INVALID' | 'OXYLABS_REFERENCE_CERTIFICATION_CONFLICT', message: string) {
    super(message);
    this.name = 'OxylabsReferenceCertificationError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Immutable local-reference certification registry. `OXYLABS_REFERENCE` is a
 * classification label only: this contract never contacts Oxylabs or another
 * provider, uses an account, resolves credentials, acquires a proxy or
 * certifies a production adapter.
 */
export class OxylabsReferenceCertificationRegistry {
  private readonly certifications = new Map<string, OxylabsReferenceCertification>();

  public certify(input: { certificationId: string; adapterId: string; providerReference: 'OXYLABS_REFERENCE'; providerVersion: string; reviewedAt: string; checks: ReadonlyArray<{ checkId: ProviderConformanceCheckId; status: 'PASS' | 'FAIL' }> }): OxylabsReferenceCertification {
    validate(input);
    const conformance = evaluateProviderConformance({ adapterId: input.adapterId, providerId: 'OXYLABS_REFERENCE', providerVersion: input.providerVersion, executionMode: 'LOCAL_TEST_DOUBLE', checks: input.checks });
    const certification: OxylabsReferenceCertification = {
      contractVersion: OXYLABS_REFERENCE_CERTIFICATION_CONTRACT_VERSION, certificationId: input.certificationId, adapterId: input.adapterId,
      providerReference: 'OXYLABS_REFERENCE', providerVersion: input.providerVersion, reviewedAt: input.reviewedAt,
      status: conformance.status === 'CONFORMANT_REFERENCE' ? 'LOCAL_REFERENCE_CERTIFIED' : 'LOCAL_REFERENCE_REJECTED',
      conformance: { status: conformance.status, passedCheckIds: [...conformance.passedCheckIds], failedCheckIds: [...conformance.failedCheckIds] },
      requiresRealProviderCertification: true, allowsProviderActivation: false, allowsExternalProviderCall: false
    };
    const existing = this.certifications.get(input.certificationId);
    if (existing !== undefined) {
      if (same(existing, certification)) return clone(existing);
      throw new OxylabsReferenceCertificationError('OXYLABS_REFERENCE_CERTIFICATION_CONFLICT', 'Certification ID farklı içerikle tekrar kullanılamaz.');
    }
    this.certifications.set(input.certificationId, certification);
    return clone(certification);
  }
}

function validate(input: { certificationId: string; adapterId: string; providerReference: string; providerVersion: string; reviewedAt: string; checks: ReadonlyArray<{ checkId: string; status: string }> }): void {
  if (![input.certificationId, input.adapterId, input.providerVersion].every((value) => SAFE_ID.test(value)) || input.providerReference !== 'OXYLABS_REFERENCE' || !Number.isFinite(Date.parse(input.reviewedAt))) throw invalid();
}

function same(left: OxylabsReferenceCertification, right: OxylabsReferenceCertification): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value: OxylabsReferenceCertification): OxylabsReferenceCertification {
  return { ...value, conformance: { ...value.conformance, passedCheckIds: [...value.conformance.passedCheckIds], failedCheckIds: [...value.conformance.failedCheckIds] } };
}

function invalid(): OxylabsReferenceCertificationError {
  return new OxylabsReferenceCertificationError('OXYLABS_REFERENCE_CERTIFICATION_INVALID', 'Provider reference certification input geçerli değil.');
}
