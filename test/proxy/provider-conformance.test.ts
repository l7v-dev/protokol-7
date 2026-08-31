import { describe, expect, it } from 'vitest';

import { evaluateProviderConformance, ProviderConformanceError, PROVIDER_CONFORMANCE_CHECK_IDS } from '../../src/proxy/provider-conformance.js';

const passChecks = PROVIDER_CONFORMANCE_CHECK_IDS.map((checkId) => ({ checkId, status: 'PASS' as const }));

describe('secret-safe deterministic provider contract conformance suite', () => {
  it('returns a conformant local-reference result without external calls, activation or automatic certification', () => {
    const report = evaluateProviderConformance({ adapterId: 'adapter_fake_1', providerId: 'provider_fake', providerVersion: 'fake_1.0.0', executionMode: 'LOCAL_TEST_DOUBLE', checks: passChecks });
    expect(report.status).toBe('CONFORMANT_REFERENCE');
    expect(report.passedCheckIds).toEqual(PROVIDER_CONFORMANCE_CHECK_IDS);
    expect(report.failedCheckIds).toEqual([]);
    expect(report).toMatchObject({ requiresManualCertification: true, allowsProviderActivation: false, allowsExternalProviderCall: false });
  });

  it('returns only fixed failed check identifiers and does not expose provider endpoint, credentials or responses', () => {
    const report = evaluateProviderConformance({ adapterId: 'adapter_fake_1', providerId: 'provider_fake', providerVersion: 'fake_1.0.0', executionMode: 'LOCAL_TEST_DOUBLE', checks: passChecks.map((check) => check.checkId === 'CREDENTIAL_REFERENCE_SAFETY' ? { ...check, status: 'FAIL' } : check) });
    expect(report.status).toBe('NON_CONFORMANT');
    expect(report.failedCheckIds).toEqual(['CREDENTIAL_REFERENCE_SAFETY']);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('endpoint');
    expect(serialized).not.toContain('password');
  });

  it('rejects unsafe identifiers, non-local execution, duplicate checks and incomplete evidence fail-closed', () => {
    expect(() => evaluateProviderConformance({ adapterId: 'bad adapter', providerId: 'provider_fake', providerVersion: 'fake_1.0.0', executionMode: 'LOCAL_TEST_DOUBLE', checks: passChecks })).toThrow(ProviderConformanceError);
    expect(() => evaluateProviderConformance({ adapterId: 'adapter_fake_1', providerId: 'provider_fake', providerVersion: 'fake_1.0.0', executionMode: 'LIVE_PROVIDER' as never, checks: passChecks })).toThrow(ProviderConformanceError);
    expect(() => evaluateProviderConformance({ adapterId: 'adapter_fake_1', providerId: 'provider_fake', providerVersion: 'fake_1.0.0', executionMode: 'LOCAL_TEST_DOUBLE', checks: [...passChecks.slice(0, 5), passChecks[0]!] })).toThrow(ProviderConformanceError);
  });
});
