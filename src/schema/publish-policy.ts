import type { SchemaQualityReport } from './quality.js';

export type SchemaPublishPolicy = {
  minimumQualityScorePercent: number;
  minimumValidRecords: number;
  maxInvalidRatioPercent: number;
  allowPartialResults: boolean;
};

export type SchemaPublishDecisionStatus = 'PUBLISH_ALLOWED' | 'PARTIAL_ALLOWED' | 'PUBLISH_BLOCKED';

export type SchemaPublishDecisionReason =
  | 'NO_RECORDS'
  | 'MINIMUM_VALID_RECORDS_NOT_MET'
  | 'INVALID_RATIO_EXCEEDED'
  | 'QUALITY_BELOW_THRESHOLD'
  | 'PARTIAL_RESULTS_DISABLED';

export type SchemaPublishDecision = {
  tenantId: string;
  projectId: string;
  schemaId: string;
  schemaName: string;
  schemaVersion: number;
  schemaFingerprintSha256: string;
  status: SchemaPublishDecisionStatus;
  reasons: ReadonlyArray<SchemaPublishDecisionReason>;
  summary: {
    totalRecords: number;
    validRecords: number;
    invalidRecords: number;
    invalidRatioPercent: number;
    averageQualityScorePercent: number;
    recordsAtOrAboveQualityThreshold: number;
  };
};

export class SchemaPublishPolicyError extends Error {
  public constructor(public readonly code: 'SCHEMA_PUBLISH_POLICY_INVALID', message: string) {
    super(message);
    this.name = 'SchemaPublishPolicyError';
  }
}

/**
 * Evaluates publication eligibility only. It has no repository, queue, storage
 * or dataset side effect and never returns field or record values.
 */
export function evaluateSchemaPublishPolicy(
  qualityReports: ReadonlyArray<SchemaQualityReport>,
  policy: SchemaPublishPolicy
): SchemaPublishDecision {
  validatePolicy(policy);
  if (qualityReports.length === 0) {
    return emptyDecision(['NO_RECORDS']);
  }
  const first = qualityReports[0]!;
  validateReports(qualityReports, first);
  const validRecords = qualityReports.filter((report) => report.validationValid).length;
  const invalidRecords = qualityReports.length - validRecords;
  const averageQualityScorePercent = round(qualityReports.reduce((total, report) => total + report.qualityScorePercent, 0) / qualityReports.length);
  const recordsAtOrAboveQualityThreshold = qualityReports.filter((report) => report.validationValid && report.qualityScorePercent >= policy.minimumQualityScorePercent).length;
  const invalidRatioPercent = percentage(invalidRecords, qualityReports.length);
  const reasons: SchemaPublishDecisionReason[] = [];
  if (validRecords < policy.minimumValidRecords) reasons.push('MINIMUM_VALID_RECORDS_NOT_MET');
  if (invalidRatioPercent > policy.maxInvalidRatioPercent) reasons.push('INVALID_RATIO_EXCEEDED');
  if (recordsAtOrAboveQualityThreshold < policy.minimumValidRecords) reasons.push('QUALITY_BELOW_THRESHOLD');
  const blockingReasons = [...reasons];
  if (blockingReasons.length === 0) {
    return decision(first, 'PUBLISH_ALLOWED', [], qualityReports.length, validRecords, invalidRecords, invalidRatioPercent, averageQualityScorePercent, recordsAtOrAboveQualityThreshold);
  }
  if (policy.allowPartialResults && validRecords >= policy.minimumValidRecords && recordsAtOrAboveQualityThreshold >= policy.minimumValidRecords) {
    return decision(first, 'PARTIAL_ALLOWED', blockingReasons, qualityReports.length, validRecords, invalidRecords, invalidRatioPercent, averageQualityScorePercent, recordsAtOrAboveQualityThreshold);
  }
  if (!policy.allowPartialResults) reasons.push('PARTIAL_RESULTS_DISABLED');
  return decision(first, 'PUBLISH_BLOCKED', reasons, qualityReports.length, validRecords, invalidRecords, invalidRatioPercent, averageQualityScorePercent, recordsAtOrAboveQualityThreshold);
}

function validatePolicy(policy: SchemaPublishPolicy): void {
  if (typeof policy.minimumQualityScorePercent !== 'number' || !Number.isFinite(policy.minimumQualityScorePercent)
    || policy.minimumQualityScorePercent < 0 || policy.minimumQualityScorePercent > 100
    || !Number.isInteger(policy.minimumValidRecords) || policy.minimumValidRecords < 1 || policy.minimumValidRecords > 1_000_000
    || typeof policy.maxInvalidRatioPercent !== 'number' || !Number.isFinite(policy.maxInvalidRatioPercent)
    || policy.maxInvalidRatioPercent < 0 || policy.maxInvalidRatioPercent > 100
    || typeof policy.allowPartialResults !== 'boolean') {
    throw new SchemaPublishPolicyError('SCHEMA_PUBLISH_POLICY_INVALID', 'Schema publish policy geçerli değil.');
  }
}

function validateReports(reports: ReadonlyArray<SchemaQualityReport>, first: SchemaQualityReport): void {
  for (const report of reports) {
    if (report.tenantId !== first.tenantId
      || report.projectId !== first.projectId
      || report.schemaId !== first.schemaId
      || report.schemaName !== first.schemaName
      || report.schemaVersion !== first.schemaVersion
      || report.schemaFingerprintSha256 !== first.schemaFingerprintSha256
      || !Number.isFinite(report.qualityScorePercent)
      || report.qualityScorePercent < 0 || report.qualityScorePercent > 100) {
      throw new SchemaPublishPolicyError('SCHEMA_PUBLISH_POLICY_INVALID', 'Quality report seti aynı schema snapshot ile uyumlu olmalıdır.');
    }
  }
}

function emptyDecision(reasons: ReadonlyArray<SchemaPublishDecisionReason>): SchemaPublishDecision {
  return {
    tenantId: '',
    projectId: '',
    schemaId: '',
    schemaName: '',
    schemaVersion: 0,
    schemaFingerprintSha256: '',
    status: 'PUBLISH_BLOCKED',
    reasons: [...reasons],
    summary: {
      totalRecords: 0,
      validRecords: 0,
      invalidRecords: 0,
      invalidRatioPercent: 0,
      averageQualityScorePercent: 0,
      recordsAtOrAboveQualityThreshold: 0
    }
  };
}

function decision(
  report: SchemaQualityReport,
  status: SchemaPublishDecisionStatus,
  reasons: ReadonlyArray<SchemaPublishDecisionReason>,
  totalRecords: number,
  validRecords: number,
  invalidRecords: number,
  invalidRatioPercent: number,
  averageQualityScorePercent: number,
  recordsAtOrAboveQualityThreshold: number
): SchemaPublishDecision {
  return {
    tenantId: report.tenantId,
    projectId: report.projectId,
    schemaId: report.schemaId,
    schemaName: report.schemaName,
    schemaVersion: report.schemaVersion,
    schemaFingerprintSha256: report.schemaFingerprintSha256,
    status,
    reasons: [...new Set(reasons)],
    summary: {
      totalRecords,
      validRecords,
      invalidRecords,
      invalidRatioPercent,
      averageQualityScorePercent,
      recordsAtOrAboveQualityThreshold
    }
  };
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round((numerator / denominator) * 100);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
