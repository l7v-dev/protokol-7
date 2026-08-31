export type ExtractionAcceptanceCheck = {
  id: string;
  status: 'PASS' | 'FAIL';
};

export type ExtractionAcceptanceInput = {
  gateId: string;
  evidence: {
    planFingerprintSha256: string;
    artifactChecksumSha256: string;
    diagnosticsReportId: string;
  };
  checks: ExtractionAcceptanceCheck[];
};

export type ExtractionAcceptanceResult = {
  gateId: string;
  status: 'LOCAL_REFERENCE_ACCEPTED' | 'REJECTED';
  checks: ExtractionAcceptanceCheck[];
  failedCheckIds: string[];
  allowsTargetFetch: boolean;
  allowsProviderCall: boolean;
  allowsModelInvocation: boolean;
  allowsProductionRelease: boolean;
};

export function evaluateExtractionAcceptance(input: ExtractionAcceptanceInput): ExtractionAcceptanceResult {
  const failedCheckIds = input.checks.filter((c) => c.status !== 'PASS').map((c) => c.id);
  const accepted = failedCheckIds.length === 0;

  return {
    gateId: input.gateId,
    status: accepted ? 'LOCAL_REFERENCE_ACCEPTED' : 'REJECTED',
    checks: input.checks,
    failedCheckIds,
    allowsTargetFetch: false,
    allowsProviderCall: false,
    allowsModelInvocation: false,
    allowsProductionRelease: false
  };
}
