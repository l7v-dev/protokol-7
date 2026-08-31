export const ENCRYPTION_POSTURE_CONTRACT_VERSION = 'encryption-posture/v1' as const;

export type EncryptionControlId = 'AT_REST_STORAGE' | 'IN_TRANSIT_INBOUND' | 'IN_TRANSIT_OUTBOUND' | 'DATA_KEY_REFERENCE' | 'TRANSPORT_CERTIFICATE_REFERENCE' | 'SECRETS_KEY_REFERENCE';
export type KeyReferenceKind = 'DATA_KEY_REFERENCE' | 'TRANSPORT_CERTIFICATE_REFERENCE' | 'SECRETS_KEY_REFERENCE';
export type KeyReferenceStatus = 'ACTIVE' | 'REVOKED';
export type KeyPolicyReference = { controlId: KeyReferenceKind; referenceId: string; version: number; status: KeyReferenceStatus; reviewedAt: string };
export type EncryptionPostureReport = {
  contractVersion: typeof ENCRYPTION_POSTURE_CONTRACT_VERSION;
  reviewId: string;
  reviewedAt: string;
  status: 'REFERENCE_READY' | 'EVIDENCE_REQUIRED';
  checks: { atRestReferenceConfirmed: boolean; inboundTransportReferenceConfirmed: boolean; outboundTransportReferenceConfirmed: boolean; keyPolicyReferencesConfirmed: boolean };
  missingControlIds: ReadonlyArray<EncryptionControlId>;
  keyReferences: ReadonlyArray<{ controlId: KeyReferenceKind; referenceId: string; version: number; status: KeyReferenceStatus }>;
  requiresManualEvidence: true;
  allowsCryptographicOperation: false;
  allowsGoLive: false;
};

export class EncryptionPostureError extends Error {
  public constructor(public readonly code: 'ENCRYPTION_POSTURE_INVALID', message: string) {
    super(message);
    this.name = 'EncryptionPostureError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const KEY_CONTROLS: ReadonlyArray<KeyReferenceKind> = ['DATA_KEY_REFERENCE', 'TRANSPORT_CERTIFICATE_REFERENCE', 'SECRETS_KEY_REFERENCE'];

/**
 * Pure reference-evidence evaluator. It accepts only bounded confirmation
 * signals and safe key/certificate reference identifiers; it cannot access key
 * material, encrypt/decrypt, negotiate TLS, inspect a certificate, connect to
 * a storage provider, modify runtime settings or prove real cryptography.
 */
export function verifyEncryptionPosture(input: { reviewId: string; reviewedAt: string; atRestStorage: 'CONFIRMED_REFERENCE' | 'NOT_CONFIRMED'; inboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE' | 'NOT_CONFIRMED'; outboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE' | 'NOT_CONFIRMED'; keyReferences: ReadonlyArray<KeyPolicyReference> }): EncryptionPostureReport {
  validate(input);
  const activeControls = new Set(input.keyReferences.filter((reference) => reference.status === 'ACTIVE').map((reference) => reference.controlId));
  const checks = {
    atRestReferenceConfirmed: input.atRestStorage === 'CONFIRMED_REFERENCE',
    inboundTransportReferenceConfirmed: input.inboundTransport === 'TLS_1_2_OR_HIGHER_REFERENCE',
    outboundTransportReferenceConfirmed: input.outboundTransport === 'TLS_1_2_OR_HIGHER_REFERENCE',
    keyPolicyReferencesConfirmed: KEY_CONTROLS.every((controlId) => activeControls.has(controlId))
  };
  const missingControlIds: EncryptionControlId[] = [
    ...(checks.atRestReferenceConfirmed ? [] : ['AT_REST_STORAGE' as const]),
    ...(checks.inboundTransportReferenceConfirmed ? [] : ['IN_TRANSIT_INBOUND' as const]),
    ...(checks.outboundTransportReferenceConfirmed ? [] : ['IN_TRANSIT_OUTBOUND' as const]),
    ...KEY_CONTROLS.filter((controlId) => !activeControls.has(controlId))
  ];
  return {
    contractVersion: ENCRYPTION_POSTURE_CONTRACT_VERSION, reviewId: input.reviewId, reviewedAt: input.reviewedAt,
    status: missingControlIds.length === 0 ? 'REFERENCE_READY' : 'EVIDENCE_REQUIRED', checks, missingControlIds,
    keyReferences: input.keyReferences.map(toPublic), requiresManualEvidence: true, allowsCryptographicOperation: false, allowsGoLive: false
  };
}

function validate(input: { reviewId: string; reviewedAt: string; atRestStorage: string; inboundTransport: string; outboundTransport: string; keyReferences: ReadonlyArray<KeyPolicyReference> }): void {
  if (!SAFE_ID.test(input.reviewId) || !Number.isFinite(Date.parse(input.reviewedAt)) || !['CONFIRMED_REFERENCE', 'NOT_CONFIRMED'].includes(input.atRestStorage)
    || !['TLS_1_2_OR_HIGHER_REFERENCE', 'NOT_CONFIRMED'].includes(input.inboundTransport) || !['TLS_1_2_OR_HIGHER_REFERENCE', 'NOT_CONFIRMED'].includes(input.outboundTransport)
    || input.keyReferences.length !== KEY_CONTROLS.length) throw invalid();
  const seen = new Set<KeyReferenceKind>();
  for (const reference of input.keyReferences) {
    if (!KEY_CONTROLS.includes(reference.controlId) || seen.has(reference.controlId) || !SAFE_ID.test(reference.referenceId) || !Number.isInteger(reference.version) || reference.version < 1
      || (reference.status !== 'ACTIVE' && reference.status !== 'REVOKED') || !Number.isFinite(Date.parse(reference.reviewedAt))) throw invalid();
    seen.add(reference.controlId);
  }
}

function toPublic(reference: KeyPolicyReference): EncryptionPostureReport['keyReferences'][number] {
  return { controlId: reference.controlId, referenceId: reference.referenceId, version: reference.version, status: reference.status };
}

function invalid(): EncryptionPostureError {
  return new EncryptionPostureError('ENCRYPTION_POSTURE_INVALID', 'Encryption posture input geçerli değil.');
}
