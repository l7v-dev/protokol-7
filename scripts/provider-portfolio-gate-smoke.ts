import assert from 'node:assert/strict';

import { evaluateProviderPortfolioGate } from '../src/proxy/provider-portfolio-gate.js';

const result = evaluateProviderPortfolioGate({
  tenantId: 'tenant_provider_gate',
  gateId: 'provider_portfolio_gate_1',
  providers: [
    { providerId: 'bright_data_reference', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' },
    { providerId: 'oxylabs_reference', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' },
    { providerId: 'zyte_reference', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' },
    { providerId: 'internal_provider', providerVersion: 'reference_1.0.0', conformanceStatus: 'CONFORMANT_REFERENCE', certificationStatus: 'LOCAL_REFERENCE_CERTIFIED', supportRunbookRoute: 'NO_ACTION', activationState: 'NOT_ACTIVATED' }
  ]
});

assert.equal(result.status, 'LOCAL_REFERENCE_GATE_PASSED');
assert.equal(result.reasonCode, 'ALL_LOCAL_REFERENCE_EVIDENCE_ACCEPTED');
assert.equal(result.locallyQualifiedProviderIds.length, 4);
assert.deepEqual(result.locallyRejectedProviderIds, []);
assert.equal(result.requiresRealProviderCertification, true);
assert.equal(result.requiresProductionSecuritySignOff, true);
assert.equal(result.requiresExplicitProductionReleaseApproval, true);
assert.equal(result.allowsProviderActivation, false);
assert.equal(result.allowsProductionRelease, false);
assert.equal(result.allowsExternalProviderCall, false);

console.log(JSON.stringify({
  gate: 'P16-T08',
  status: result.status,
  reasonCode: result.reasonCode,
  locallyQualifiedProviderIds: result.locallyQualifiedProviderIds,
  localReferenceOnly: true,
  note: 'deterministic process-local provider portfolio evidence gate; no provider API/account/credential/quota/billing/SLA call, provider activation/disablement, traffic dispatch, proxy lifecycle, external provider network call, production release or deployment'
}, null, 2));
