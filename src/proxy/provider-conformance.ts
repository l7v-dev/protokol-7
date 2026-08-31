export const PROVIDER_CONFORMANCE_CONTRACT_VERSION = 'provider-conformance/v1' as const;

export type ProviderConformanceCheckId = 'CAPABILITY_CONTRACT' | 'HEALTH_CONTRACT' | 'ACQUIRE_RELEASE_LIFECYCLE' | 'FAILURE_TAXONOMY' | 'TENANT_SCOPE_ISOLATION' | 'CREDENTIAL_REFERENCE_SAFETY';
export type ProviderConformanceReport = {
  contractVersion: typeof PROVIDER_CONFORMANCE_CONTRACT_VERSION;
  adapterId: string;
  providerId: string;
  providerVersion: string;
  executionMode: 'LOCAL_TEST_DOUBLE';
  status: 'CONFORMANT_REFERENCE' | 'NON_CONFORMANT';
  passedCheckIds: ReadonlyArray<ProviderConformanceCheckId>;
  failedCheckIds: ReadonlyArray<ProviderConformanceCheckId>;
  requiresManualCertification: true;
  allowsProviderActivation: false;
  allowsExternalProviderCall: false;
};

export class ProviderConformanceError extends Error {
  public constructor(public readonly code: 'PROVIDER_CONFORMANCE_INVALID', message: string) {
    super(message);
    this.name = 'ProviderConformanceError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
export const PROVIDER_CONFORMANCE_CHECK_IDS: ReadonlyArray<ProviderConformanceCheckId> = [
  'CAPABILITY_CONTRACT', 'HEALTH_CONTRACT', 'ACQUIRE_RELEASE_LIFECYCLE', 'FAILURE_TAXONOMY', 'TENANT_SCOPE_ISOLATION', 'CREDENTIAL_REFERENCE_SAFETY'
];

/**
 * Pure, local evidence evaluator for a ProxyProvider adapter contract. It
 * accepts no provider endpoint, account, credential, token, request payload,
 * proxy IP or raw provider response. It never calls, certifies or activates a
 * provider; a conformant reference outcome still requires manual certification.
 */
export function evaluateProviderConformance(input: { adapterId: string; providerId: string; providerVersion: string; executionMode: 'LOCAL_TEST_DOUBLE'; checks: ReadonlyArray<{ checkId: ProviderConformanceCheckId; status: 'PASS' | 'FAIL' }> }): ProviderConformanceReport {
  validate(input);
  const statusById = new Map(input.checks.map((check) => [check.checkId, check.status]));
  const passedCheckIds = PROVIDER_CONFORMANCE_CHECK_IDS.filter((checkId) => statusById.get(checkId) === 'PASS');
  const failedCheckIds = PROVIDER_CONFORMANCE_CHECK_IDS.filter((checkId) => statusById.get(checkId) === 'FAIL');
  return {
    contractVersion: PROVIDER_CONFORMANCE_CONTRACT_VERSION, adapterId: input.adapterId, providerId: input.providerId, providerVersion: input.providerVersion,
    executionMode: 'LOCAL_TEST_DOUBLE', status: failedCheckIds.length === 0 ? 'CONFORMANT_REFERENCE' : 'NON_CONFORMANT', passedCheckIds, failedCheckIds,
    requiresManualCertification: true, allowsProviderActivation: false, allowsExternalProviderCall: false
  };
}

function validate(input: { adapterId: string; providerId: string; providerVersion: string; executionMode: string; checks: ReadonlyArray<{ checkId: string; status: string }> }): void {
  if (![input.adapterId, input.providerId, input.providerVersion].every((value) => SAFE_ID.test(value)) || input.executionMode !== 'LOCAL_TEST_DOUBLE' || input.checks.length !== PROVIDER_CONFORMANCE_CHECK_IDS.length) throw invalid();
  const seen = new Set<string>();
  for (const check of input.checks) {
    if (!PROVIDER_CONFORMANCE_CHECK_IDS.includes(check.checkId as ProviderConformanceCheckId) || seen.has(check.checkId) || (check.status !== 'PASS' && check.status !== 'FAIL')) throw invalid();
    seen.add(check.checkId);
  }
}

function invalid(): ProviderConformanceError {
  return new ProviderConformanceError('PROVIDER_CONFORMANCE_INVALID', 'Provider conformance input geçerli değil.');
}
