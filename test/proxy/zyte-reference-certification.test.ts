import { describe, expect, it } from 'vitest';

import { ZyteReferenceCertificationError, ZyteReferenceCertificationRegistry } from '../../src/proxy/zyte-reference-certification.js';
import { PROVIDER_CONFORMANCE_CHECK_IDS } from '../../src/proxy/provider-conformance.js';

const checks = PROVIDER_CONFORMANCE_CHECK_IDS.map((checkId) => ({ checkId, status: 'PASS' as const }));
const input = { certificationId: 'zyte_reference_cert_1', adapterId: 'zyte_reference_adapter_1', providerReference: 'ZYTE_REFERENCE' as const, providerVersion: 'reference_1.0.0', reviewedAt: '2026-08-27T00:00:00.000Z', checks };

describe('Zyte local-reference adapter certification contract', () => {
  it('certifies complete local evidence while refusing activation, external calls and real provider certification claims', () => {
    const registry = new ZyteReferenceCertificationRegistry();
    const result = registry.certify(input);
    expect(result).toMatchObject({ status: 'LOCAL_REFERENCE_CERTIFIED', providerReference: 'ZYTE_REFERENCE', conformance: { status: 'CONFORMANT_REFERENCE' }, requiresRealProviderCertification: true, allowsProviderActivation: false, allowsExternalProviderCall: false });
    expect(result.conformance.passedCheckIds).toEqual(PROVIDER_CONFORMANCE_CHECK_IDS);
  });

  it('projects local evidence failures as fixed conformance identifiers without account, endpoint or credential data', () => {
    const registry = new ZyteReferenceCertificationRegistry();
    const result = registry.certify({ ...input, checks: checks.map((check) => check.checkId === 'FAILURE_TAXONOMY' ? { ...check, status: 'FAIL' } : check) });
    expect(result.status).toBe('LOCAL_REFERENCE_REJECTED');
    expect(result.conformance.failedCheckIds).toEqual(['FAILURE_TAXONOMY']);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('endpoint');
    expect(serialized).not.toContain('account');
  });

  it('rejects invalid provider reference and immutable certification conflicts fail-closed', () => {
    const registry = new ZyteReferenceCertificationRegistry();
    expect(() => registry.certify({ ...input, providerReference: 'ZYTE' as never })).toThrow(ZyteReferenceCertificationError);
    registry.certify(input);
    expect(() => registry.certify({ ...input, providerVersion: 'reference_2.0.0' })).toThrow(ZyteReferenceCertificationError);
  });
});
