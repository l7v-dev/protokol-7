import type { ExtractionDiagnosticsReport, FieldDiagnostic } from '../extraction/diagnostics.js';
import type { SchemaFieldValidationResult, SchemaValidationReport } from './validator.js';

export type SchemaQualityFieldStatus = 'VALID' | 'OPTIONAL_MISSING' | 'INVALID' | 'EXTRACTION_ERROR' | 'REDACTED';

export type SchemaFieldQualityDiagnostic = {
  fieldKey: string;
  weight: number;
  status: SchemaQualityFieldStatus;
  score: number;
  validationErrorCodes: ReadonlyArray<string>;
  extractionErrorCodes: ReadonlyArray<string>;
};

export type SchemaQualityReport = {
  tenantId: string;
  projectId: string;
  schemaId: string;
  schemaName: string;
  schemaVersion: number;
  schemaFingerprintSha256: string;
  validationValid: boolean;
  qualityScorePercent: number;
  totalWeight: number;
  earnedWeight: number;
  summary: {
    totalFields: number;
    validFields: number;
    optionalMissingFields: number;
    invalidFields: number;
    extractionErrorFields: number;
    redactedFields: number;
  };
  fields: ReadonlyArray<SchemaFieldQualityDiagnostic>;
  extractionEvidence?: {
    attemptId: string;
    planFingerprintSha256: string;
    artifactChecksumSha256: string;
  };
};

export type SchemaQualityInput = {
  validation: SchemaValidationReport;
  extractionDiagnostics?: Pick<ExtractionDiagnosticsReport, 'scope' | 'plan' | 'artifact' | 'fields'>;
  fieldWeights?: Readonly<Record<string, number>>;
};

export class SchemaQualityError extends Error {
  public constructor(public readonly code: 'SCHEMA_QUALITY_INVALID', message: string) {
    super(message);
    this.name = 'SchemaQualityError';
  }
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;

/**
 * Produces deterministic schema quality evidence without carrying source,
 * raw/normalized values, selectors or artifact storage locations.
 */
export function buildSchemaQualityReport(input: SchemaQualityInput): SchemaQualityReport {
  validateInput(input);
  const topLevelFields = input.validation.fields.filter((field) => isTopLevelField(field));
  const validationByField = new Map<string, SchemaFieldValidationResult[]>();
  for (const field of topLevelFields) {
    const existing = validationByField.get(field.fieldKey) ?? [];
    validationByField.set(field.fieldKey, [...existing, field]);
  }
  const extractionByField = new Map(input.extractionDiagnostics?.fields.map((field) => [field.outputKey, field]) ?? []);
  const qualityFields = [...validationByField.entries()]
    .filter(([key]) => key !== '$')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldKey, validation]) => scoreField(fieldKey, validation, extractionByField.get(fieldKey), input.fieldWeights?.[fieldKey]));
  const totalWeight = qualityFields.reduce((total, field) => total + field.weight, 0);
  const earnedWeight = qualityFields.reduce((total, field) => total + (field.weight * field.score), 0);
  const summary = {
    totalFields: qualityFields.length,
    validFields: qualityFields.filter((field) => field.status === 'VALID').length,
    optionalMissingFields: qualityFields.filter((field) => field.status === 'OPTIONAL_MISSING').length,
    invalidFields: qualityFields.filter((field) => field.status === 'INVALID').length,
    extractionErrorFields: qualityFields.filter((field) => field.status === 'EXTRACTION_ERROR').length,
    redactedFields: qualityFields.filter((field) => field.status === 'REDACTED').length
  };
  return {
    tenantId: input.validation.tenantId,
    projectId: input.validation.projectId,
    schemaId: input.validation.schemaId,
    schemaName: input.validation.schemaName,
    schemaVersion: input.validation.schemaVersion,
    schemaFingerprintSha256: input.validation.schemaFingerprintSha256,
    validationValid: input.validation.valid,
    qualityScorePercent: percentage(earnedWeight, totalWeight),
    totalWeight,
    earnedWeight,
    summary,
    fields: qualityFields.map(cloneQualityField),
    ...(input.extractionDiagnostics === undefined ? {} : {
      extractionEvidence: {
        attemptId: input.extractionDiagnostics.scope.attemptId,
        planFingerprintSha256: input.extractionDiagnostics.plan.fingerprintSha256,
        artifactChecksumSha256: input.extractionDiagnostics.artifact.checksumSha256
      }
    })
  };
}

function scoreField(
  fieldKey: string,
  validation: ReadonlyArray<SchemaFieldValidationResult>,
  extraction: FieldDiagnostic | undefined,
  configuredWeight: number | undefined
): SchemaFieldQualityDiagnostic {
  const required = validation.some((field) => field.errorCodes.includes('MISSING_REQUIRED'));
  const weight = configuredWeight ?? (required ? 2 : 1);
  const validationErrorCodes = uniqueSafeCodes(validation.flatMap((field) => field.errorCodes));
  const extractionErrorCodes = extraction?.errorCode && SAFE_CODE.test(extraction.errorCode) ? [extraction.errorCode] : [];
  if (extraction?.status === 'REDACTED') {
    return diagnostic(fieldKey, weight, 'REDACTED', 0, validationErrorCodes, extractionErrorCodes);
  }
  if (extraction?.status === 'ERROR') {
    return diagnostic(fieldKey, weight, 'EXTRACTION_ERROR', 0, validationErrorCodes, extractionErrorCodes);
  }
  if (validation.some((field) => field.status === 'INVALID')) {
    return diagnostic(fieldKey, weight, 'INVALID', 0, validationErrorCodes, extractionErrorCodes);
  }
  if (validation.every((field) => field.status === 'MISSING')) {
    return diagnostic(fieldKey, weight, 'OPTIONAL_MISSING', 0.5, validationErrorCodes, extractionErrorCodes);
  }
  return diagnostic(fieldKey, weight, 'VALID', 1, validationErrorCodes, extractionErrorCodes);
}

function diagnostic(
  fieldKey: string,
  weight: number,
  status: SchemaQualityFieldStatus,
  score: number,
  validationErrorCodes: ReadonlyArray<string>,
  extractionErrorCodes: ReadonlyArray<string>
): SchemaFieldQualityDiagnostic {
  return { fieldKey, weight, status, score, validationErrorCodes: [...validationErrorCodes], extractionErrorCodes: [...extractionErrorCodes] };
}

function validateInput(input: SchemaQualityInput): void {
  if (!Number.isInteger(input.validation.schemaVersion) || input.validation.schemaVersion < 1
    || !/^[a-f0-9]{64}$/i.test(input.validation.schemaFingerprintSha256)
    || input.validation.fields.length === 0) {
    throw new SchemaQualityError('SCHEMA_QUALITY_INVALID', 'Schema validation report geçerli değil.');
  }
  if (input.extractionDiagnostics) {
    if (input.extractionDiagnostics.scope.tenantId !== input.validation.tenantId
      || !/^[a-f0-9]{64}$/i.test(input.extractionDiagnostics.plan.fingerprintSha256)
      || !/^[a-f0-9]{64}$/i.test(input.extractionDiagnostics.artifact.checksumSha256)) {
      throw new SchemaQualityError('SCHEMA_QUALITY_INVALID', 'Extraction diagnostics evidence validation scope ile uyuşmuyor.');
    }
  }
  if (input.fieldWeights) {
    const declaredKeys = new Set(input.validation.fields.filter(isTopLevelField).map((field) => field.fieldKey));
    for (const [key, weight] of Object.entries(input.fieldWeights)) {
      if (!declaredKeys.has(key) || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0.1 || weight > 10) {
        throw new SchemaQualityError('SCHEMA_QUALITY_INVALID', 'Field quality weight tanımı geçerli değil.');
      }
    }
  }
}

function isTopLevelField(field: SchemaFieldValidationResult): boolean {
  return field.path === `$.${field.fieldKey}` || field.fieldKey === '$';
}

function uniqueSafeCodes(codes: ReadonlyArray<string>): string[] {
  return [...new Set(codes.filter((code) => SAFE_CODE.test(code)))].sort();
}

function percentage(earnedWeight: number, totalWeight: number): number {
  return totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 10_000) / 100;
}

function cloneQualityField(field: SchemaFieldQualityDiagnostic): SchemaFieldQualityDiagnostic {
  return { ...field, validationErrorCodes: [...field.validationErrorCodes], extractionErrorCodes: [...field.extractionErrorCodes] };
}
