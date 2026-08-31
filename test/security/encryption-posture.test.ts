import { describe, expect, it } from 'vitest';

import { EncryptionPostureError, verifyEncryptionPosture, type KeyPolicyReference } from '../../src/security/encryption-posture.js';

const reviewedAt = '2026-08-27T00:00:00.000Z';
const keyReferences: ReadonlyArray<KeyPolicyReference> = [
  { controlId: 'DATA_KEY_REFERENCE', referenceId: 'data_key_ref', version: 1, status: 'ACTIVE', reviewedAt },
  { controlId: 'TRANSPORT_CERTIFICATE_REFERENCE', referenceId: 'transport_cert_ref', version: 2, status: 'ACTIVE', reviewedAt },
  { controlId: 'SECRETS_KEY_REFERENCE', referenceId: 'secrets_key_ref', version: 3, status: 'ACTIVE', reviewedAt }
];

describe('secret-safe encryption posture and key policy reference verification', () => {
  it('returns a complete reference-ready posture without claiming a cryptographic operation or go-live approval', () => {
    const report = verifyEncryptionPosture({ reviewId: 'review_1', reviewedAt, atRestStorage: 'CONFIRMED_REFERENCE', inboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', outboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', keyReferences });
    expect(report.status).toBe('REFERENCE_READY');
    expect(report.checks).toEqual({ atRestReferenceConfirmed: true, inboundTransportReferenceConfirmed: true, outboundTransportReferenceConfirmed: true, keyPolicyReferencesConfirmed: true });
    expect(report.missingControlIds).toEqual([]);
    expect(report).toMatchObject({ requiresManualEvidence: true, allowsCryptographicOperation: false, allowsGoLive: false });
  });

  it('reports only fixed missing-control identifiers when a transport signal or key reference is unconfirmed', () => {
    const report = verifyEncryptionPosture({ reviewId: 'review_2', reviewedAt, atRestStorage: 'CONFIRMED_REFERENCE', inboundTransport: 'NOT_CONFIRMED', outboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', keyReferences: keyReferences.map((reference) => reference.controlId === 'SECRETS_KEY_REFERENCE' ? { ...reference, status: 'REVOKED' } : reference) });
    expect(report.status).toBe('EVIDENCE_REQUIRED');
    expect(report.missingControlIds).toEqual(['IN_TRANSIT_INBOUND', 'SECRETS_KEY_REFERENCE']);
    expect(JSON.stringify(report)).not.toContain('privateKey');
    expect(JSON.stringify(report)).not.toContain('password');
  });

  it('rejects unknown signals, duplicate key control, unsafe references and malformed time fail-closed', () => {
    expect(() => verifyEncryptionPosture({ reviewId: 'review_3', reviewedAt, atRestStorage: 'ENCRYPTED' as never, inboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', outboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', keyReferences })).toThrow(EncryptionPostureError);
    expect(() => verifyEncryptionPosture({ reviewId: 'review_3', reviewedAt, atRestStorage: 'CONFIRMED_REFERENCE', inboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', outboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', keyReferences: [keyReferences[0]!, keyReferences[0]!, keyReferences[2]!] })).toThrow(EncryptionPostureError);
    expect(() => verifyEncryptionPosture({ reviewId: 'bad id', reviewedAt: 'bad-time', atRestStorage: 'CONFIRMED_REFERENCE', inboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', outboundTransport: 'TLS_1_2_OR_HIGHER_REFERENCE', keyReferences })).toThrow(EncryptionPostureError);
  });
});
