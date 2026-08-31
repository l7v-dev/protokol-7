import { createHash } from 'node:crypto';

import type { ExtractionArtifactReference, ExtractionScope } from './html-cleaner.js';
import type { NormalizationResult } from './normalize.js';
import type { ExtractionFieldPlan, ExtractionPlan, ExtractionSourceKind } from './plan.js';

export type SelectorFieldStatus = 'EXTRACTED' | 'EMPTY' | 'ERROR' | 'REDACTED';

export type SelectorFieldOutput = {
  fieldId: string;
  values: ReadonlyArray<string>;
  status: SelectorFieldStatus;
  errorCode?: string;
};

export type FieldEvidence = {
  sourceKind: ExtractionSourceKind;
  artifactType: ExtractionArtifactReference['artifactType'];
  artifactChecksumSha256: string;
  sourceChecksumSha256: string;
  selectorKind: ExtractionFieldPlan['selectorKind'];
  selectorFingerprintSha256: string;
  transformFingerprint: string;
};

export type FieldDiagnostic = {
  fieldId: string;
  outputKey: string;
  required: boolean;
  status: SelectorFieldStatus;
  errorCode?: string;
  selectedValueCount: number;
  normalizedValueCount: number;
  redactedValueCount: number;
  evidence: FieldEvidence;
};

export type ExtractionDiagnosticsReport = {
  reportId: string;
  scope: ExtractionScope;
  plan: Pick<ExtractionPlan, 'planId' | 'version' | 'fingerprintSha256'>;
  artifact: Pick<ExtractionArtifactReference, 'artifactType' | 'contentType' | 'sizeBytes' | 'checksumSha256'>;
  fields: ReadonlyArray<FieldDiagnostic>;
  summary: {
    totalFields: number;
    extractedFields: number;
    emptyFields: number;
    errorFields: number;
    redactedFields: number;
    requiredMissingFields: number;
  };
};

export type FieldDiagnosticInput = {
  output: SelectorFieldOutput;
  normalization?: NormalizationResult;
};

export type ExtractionDiagnosticsInput = {
  scope: ExtractionScope;
  artifact: ExtractionArtifactReference;
  sourceChecksumSha256: string;
  plan: ExtractionPlan;
  fields: ReadonlyArray<FieldDiagnosticInput>;
};

export const EXTRACTION_DIAGNOSTICS_EXECUTION_BOUNDARY = {
  executionMode: 'LOCAL_PROJECTION_ONLY',
  allowsTargetFetch: false,
  allowsArtifactStorageRead: false,
  allowsArtifactStorageWrite: false,
  allowsProviderCall: false,
  allowsBrowserExecution: false,
  allowsCredentialMaterial: false
} as const;

export class ExtractionDiagnosticsError extends Error {
  public constructor(
    public readonly code: 'EXTRACTION_DIAGNOSTICS_INVALID' | 'EXTRACTION_DIAGNOSTICS_CONFLICT',
    message: string
  ) {
    super(message);
    this.name = 'ExtractionDiagnosticsError';
  }
}

/**
 * Process-local diagnostic projection. It retains no selected, raw or
 * normalized value — only count/status/fingerprint evidence is recorded.
 */
export class ExtractionDiagnosticsRegistry {
  private readonly reports = new Map<string, ExtractionDiagnosticsReport>();

  public record(input: ExtractionDiagnosticsInput): ExtractionDiagnosticsReport {
    const report = buildDiagnosticsReport(input);
    const key = attemptKey(input.scope.tenantId, input.scope.attemptId);
    const existing = this.reports.get(key);
    if (existing) {
      if (existing.reportId !== report.reportId) {
        throw new ExtractionDiagnosticsError(
          'EXTRACTION_DIAGNOSTICS_CONFLICT',
          'Attempt farklı extraction diagnostics report ile yeniden yazılamaz.'
        );
      }
      return cloneReport(existing);
    }
    this.reports.set(key, cloneReport(report));
    return cloneReport(report);
  }

  public get(input: { tenantId: string; attemptId: string }): ExtractionDiagnosticsReport | undefined {
    assertIdentifier(input.tenantId);
    assertIdentifier(input.attemptId);
    const report = this.reports.get(attemptKey(input.tenantId, input.attemptId));
    return report ? cloneReport(report) : undefined;
  }

  public get executionBoundary(): typeof EXTRACTION_DIAGNOSTICS_EXECUTION_BOUNDARY {
    return { ...EXTRACTION_DIAGNOSTICS_EXECUTION_BOUNDARY };
  }
}

export function buildDiagnosticsReport(input: ExtractionDiagnosticsInput): ExtractionDiagnosticsReport {
  validateInput(input);
  const fields = input.fields.map((field) => buildFieldDiagnostic(input, field));
  const summary = {
    totalFields: fields.length,
    extractedFields: fields.filter((field) => field.status === 'EXTRACTED').length,
    emptyFields: fields.filter((field) => field.status === 'EMPTY').length,
    errorFields: fields.filter((field) => field.status === 'ERROR').length,
    redactedFields: fields.filter((field) => field.status === 'REDACTED').length,
    requiredMissingFields: fields.filter((field) => field.errorCode === 'REQUIRED_FIELD_MISSING').length
  };
  const report: Omit<ExtractionDiagnosticsReport, 'reportId'> = {
    scope: { ...input.scope },
    plan: { planId: input.plan.planId, version: input.plan.version, fingerprintSha256: input.plan.fingerprintSha256 },
    artifact: {
      artifactType: input.artifact.artifactType,
      contentType: input.artifact.contentType,
      sizeBytes: input.artifact.sizeBytes,
      checksumSha256: input.artifact.checksumSha256
    },
    fields,
    summary
  };
  return { ...report, reportId: sha256(JSON.stringify(report)) };
}

function buildFieldDiagnostic(input: ExtractionDiagnosticsInput, fieldInput: FieldDiagnosticInput): FieldDiagnostic {
  const field = input.plan.fields.find((candidate) => candidate.fieldId === fieldInput.output.fieldId);
  if (!field) {
    throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Plan dışında field diagnostics yazılamaz.');
  }
  if (!isSafeErrorCode(fieldInput.output.errorCode)) {
    throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Field diagnostic error code geçerli değil.');
  }
  if (!['EXTRACTED', 'EMPTY', 'ERROR', 'REDACTED'].includes(fieldInput.output.status)
    || (fieldInput.output.status === 'ERROR' && fieldInput.output.errorCode === undefined)
    || (fieldInput.output.status !== 'ERROR' && fieldInput.output.errorCode !== undefined)
    || !Array.isArray(fieldInput.output.values) || fieldInput.output.values.length > 100
    || fieldInput.output.values.some((value) => typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 64_000)) {
    throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Field diagnostic output sınırı veya status/error ilişkisi geçerli değil.');
  }
  const transformFingerprint = field.transforms?.map((transform) => transform.kind).join('|') || 'IDENTITY';
  if (fieldInput.normalization && fieldInput.normalization.transformFingerprint !== transformFingerprint) {
    throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Normalization transform fingerprint plan ile uyuşmuyor.');
  }
  const normalized = fieldInput.normalization?.values ?? [];
  const redactedValueCount = normalized.length > 0
    ? normalized.filter((value) => value.redacted).length
    : fieldInput.output.status === 'REDACTED' ? fieldInput.output.values.length : 0;
  const status: SelectorFieldStatus = redactedValueCount > 0 ? 'REDACTED' : fieldInput.output.status;
  return {
    fieldId: field.fieldId,
    outputKey: field.outputKey,
    required: field.required,
    status,
    ...(fieldInput.output.errorCode ? { errorCode: fieldInput.output.errorCode } : {}),
    selectedValueCount: fieldInput.output.values.length,
    normalizedValueCount: normalized.length,
    redactedValueCount,
    evidence: {
      sourceKind: input.plan.sourceKind,
      artifactType: input.artifact.artifactType,
      artifactChecksumSha256: input.artifact.checksumSha256,
      sourceChecksumSha256: input.sourceChecksumSha256,
      selectorKind: field.selectorKind,
      selectorFingerprintSha256: sha256(`${field.selectorKind}:${field.selector}`),
      transformFingerprint
    }
  };
}

function validateInput(input: ExtractionDiagnosticsInput): void {
  for (const value of Object.values(input.scope)) assertIdentifier(value);
  if (!/^[a-f0-9]{64}$/i.test(input.sourceChecksumSha256) || !/^[a-f0-9]{64}$/i.test(input.artifact.checksumSha256)) {
    throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Extraction evidence checksum geçerli değil.');
  }
  if (input.plan.fields.length !== input.fields.length || input.fields.length > 100) {
    throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Diagnostics tüm plan field sonuçlarını içermelidir.');
  }
  const seen = new Set<string>();
  for (const field of input.fields) {
    if (seen.has(field.output.fieldId)) {
      throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Field diagnostic yalnız bir kez yazılabilir.');
    }
    seen.add(field.output.fieldId);
  }
}

function assertIdentifier(value: string): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new ExtractionDiagnosticsError('EXTRACTION_DIAGNOSTICS_INVALID', 'Extraction diagnostics scope geçerli değil.');
  }
}

function isSafeErrorCode(value: string | undefined): boolean {
  return value === undefined || /^[A-Z][A-Z0-9_]{1,127}$/.test(value);
}

function attemptKey(tenantId: string, attemptId: string): string {
  return `${tenantId}:${attemptId}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cloneReport(report: ExtractionDiagnosticsReport): ExtractionDiagnosticsReport {
  return {
    ...report,
    scope: { ...report.scope },
    plan: { ...report.plan },
    artifact: { ...report.artifact },
    fields: report.fields.map((field) => ({ ...field, evidence: { ...field.evidence } })),
    summary: { ...report.summary }
  };
}
