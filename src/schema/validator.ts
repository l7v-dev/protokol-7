import type { NormalizedExtractionValue } from '../extraction/normalize.js';
import type { SchemaFieldDefinition } from './definition.js';
import type { SchemaVersion } from './versioning.js';

export type SchemaValidationErrorCode =
  | 'MISSING_REQUIRED'
  | 'NULL_NOT_ALLOWED'
  | 'TYPE_MISMATCH'
  | 'STRING_TOO_SHORT'
  | 'STRING_TOO_LONG'
  | 'STRING_PATTERN_MISMATCH'
  | 'NUMBER_BELOW_MINIMUM'
  | 'NUMBER_ABOVE_MAXIMUM'
  | 'UNKNOWN_FIELD'
  | 'ARRAY_LIMIT_EXCEEDED'
  | 'VALUE_DEPTH_EXCEEDED'
  | 'LINEAGE_REDACTED'
  | 'LINEAGE_VALUE_MISMATCH'
  | 'LINEAGE_TYPE_MISMATCH'
  | 'SENSITIVE_VALUE_REJECTED'
  | 'SCHEMA_PATTERN_UNSAFE';

export type SchemaFieldValidationStatus = 'VALID' | 'MISSING' | 'INVALID';

export type SchemaFieldValidationResult = {
  path: string;
  fieldKey: string;
  status: SchemaFieldValidationStatus;
  errorCodes: ReadonlyArray<SchemaValidationErrorCode>;
  lineageChecked: boolean;
};

export type SchemaValidationReport = {
  tenantId: string;
  projectId: string;
  schemaId: string;
  schemaName: string;
  schemaVersion: number;
  schemaFingerprintSha256: string;
  valid: boolean;
  unknownFieldCount: number;
  fields: ReadonlyArray<SchemaFieldValidationResult>;
};

export type SchemaValidationInput = {
  schema: Pick<SchemaVersion, 'tenantId' | 'projectId' | 'schemaId' | 'name' | 'version' | 'definition'>;
  record: unknown;
  normalizedLineage?: Readonly<Record<string, Pick<NormalizedExtractionValue, 'normalizedValue' | 'redacted'>>>;
};

const MAX_RECORD_DEPTH = 8;
const MAX_ARRAY_ITEMS = 1_000;
const MAX_RUNTIME_STRING_LENGTH = 10_000;
const SENSITIVE_VALUE = /(authorization\s*:|bearer\s+\S+|set-cookie\s*:|password\s*[=:]|api[_-]?key\s*[=:])/i;
const REDACTED_VALUE = /^\[REDACTED\]$/i;

/**
 * Validates a normalized record against a resolved schema version. The report
 * intentionally contains path, status and safe codes only; input values and
 * normalization values never leave this function.
 */
export function validateNormalizedRecord(input: SchemaValidationInput): SchemaValidationReport {
  assertSchemaScope(input.schema);
  const record = asRecord(input.record);
  const fields: SchemaFieldValidationResult[] = [];
  const declaredKeys = new Set(input.schema.definition.fields.map((field) => field.key));
  const unknownFieldCount = Object.keys(record).filter((key) => !declaredKeys.has(key)).length;
  if (unknownFieldCount > 0 && !input.schema.definition.additionalProperties) {
    fields.push(result('$', '$', 'INVALID', ['UNKNOWN_FIELD'], false));
  }
  for (const field of input.schema.definition.fields) {
    fields.push(...validateField(field, record[field.key], fieldPath('$', field.key), 1));
    const lineage = input.normalizedLineage?.[field.key];
    if (lineage) {
      fields.push(...validateLineage(field, record[field.key], lineage));
    }
  }
  return {
    tenantId: input.schema.tenantId,
    projectId: input.schema.projectId,
    schemaId: input.schema.schemaId,
    schemaName: input.schema.name,
    schemaVersion: input.schema.version,
    schemaFingerprintSha256: input.schema.definition.fingerprintSha256,
    valid: fields.every((field) => field.status !== 'INVALID'),
    unknownFieldCount,
    fields: fields.map(cloneFieldResult)
  };
}

function validateField(
  field: SchemaFieldDefinition,
  value: unknown,
  path: string,
  depth: number
): SchemaFieldValidationResult[] {
  if (depth > MAX_RECORD_DEPTH) return [result(path, field.key, 'INVALID', ['VALUE_DEPTH_EXCEEDED'], false)];
  if (value === undefined) {
    return [result(path, field.key, field.required ? 'INVALID' : 'MISSING', field.required ? ['MISSING_REQUIRED'] : [], false)];
  }
  if (value === null) {
    return [result(path, field.key, field.nullable ? 'VALID' : 'INVALID', field.nullable ? [] : ['NULL_NOT_ALLOWED'], false)];
  }
  if (typeof value === 'string' && isSensitive(value)) {
    return [result(path, field.key, 'INVALID', ['SENSITIVE_VALUE_REJECTED'], false)];
  }
  switch (field.type) {
    case 'string':
      return [validateString(field, value, path)];
    case 'number':
      return [validateNumber(field, value, path)];
    case 'boolean':
      return [result(path, field.key, typeof value === 'boolean' ? 'VALID' : 'INVALID', typeof value === 'boolean' ? [] : ['TYPE_MISMATCH'], false)];
    case 'object':
      return validateObject(field, value, path, depth);
    case 'array':
      return validateArray(field, value, path, depth);
  }
}

function validateString(field: SchemaFieldDefinition, value: unknown, path: string): SchemaFieldValidationResult {
  if (typeof value !== 'string') return result(path, field.key, 'INVALID', ['TYPE_MISMATCH'], false);
  const errors: SchemaValidationErrorCode[] = [];
  if (value.length > MAX_RUNTIME_STRING_LENGTH) errors.push('STRING_TOO_LONG');
  if (field.minLength !== undefined && value.length < field.minLength) errors.push('STRING_TOO_SHORT');
  if (field.maxLength !== undefined && value.length > field.maxLength) errors.push('STRING_TOO_LONG');
  if (field.pattern !== undefined) {
    if (!isExecutionSafePattern(field.pattern)) {
      errors.push('SCHEMA_PATTERN_UNSAFE');
    } else if (!new RegExp(field.pattern, 'u').test(value)) {
      errors.push('STRING_PATTERN_MISMATCH');
    }
  }
  return result(path, field.key, errors.length === 0 ? 'VALID' : 'INVALID', errors, false);
}

function validateNumber(field: SchemaFieldDefinition, value: unknown, path: string): SchemaFieldValidationResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) return result(path, field.key, 'INVALID', ['TYPE_MISMATCH'], false);
  const errors: SchemaValidationErrorCode[] = [];
  if (field.minimum !== undefined && value < field.minimum) errors.push('NUMBER_BELOW_MINIMUM');
  if (field.maximum !== undefined && value > field.maximum) errors.push('NUMBER_ABOVE_MAXIMUM');
  return result(path, field.key, errors.length === 0 ? 'VALID' : 'INVALID', errors, false);
}

function validateObject(field: SchemaFieldDefinition, value: unknown, path: string, depth: number): SchemaFieldValidationResult[] {
  const object = asRecordOrNull(value);
  if (!object) return [result(path, field.key, 'INVALID', ['TYPE_MISMATCH'], false)];
  const nestedFields = field.fields ?? [];
  const nestedKeys = new Set(nestedFields.map((nested) => nested.key));
  const hasUnknown = Object.keys(object).some((key) => !nestedKeys.has(key));
  const results: SchemaFieldValidationResult[] = [];
  if (hasUnknown && !field.additionalProperties) results.push(result(path, field.key, 'INVALID', ['UNKNOWN_FIELD'], false));
  for (const nested of nestedFields) {
    results.push(...validateField(nested, object[nested.key], fieldPath(path, nested.key), depth + 1));
  }
  const objectValid = results.every((entry) => entry.status !== 'INVALID');
  return [result(path, field.key, objectValid ? 'VALID' : 'INVALID', [], false), ...results];
}

function validateArray(field: SchemaFieldDefinition, value: unknown, path: string, depth: number): SchemaFieldValidationResult[] {
  if (!Array.isArray(value)) return [result(path, field.key, 'INVALID', ['TYPE_MISMATCH'], false)];
  if (value.length > MAX_ARRAY_ITEMS) return [result(path, field.key, 'INVALID', ['ARRAY_LIMIT_EXCEEDED'], false)];
  const item = field.items;
  if (!item) return [result(path, field.key, 'INVALID', ['TYPE_MISMATCH'], false)];
  const itemResults = value.flatMap((entry, index) => validateField(item, entry, `${path}[${index}]`, depth + 1));
  return [result(path, field.key, itemResults.some((entry) => entry.status === 'INVALID') ? 'INVALID' : 'VALID', [], false), ...itemResults];
}

function validateLineage(
  field: SchemaFieldDefinition,
  value: unknown,
  lineage: Pick<NormalizedExtractionValue, 'normalizedValue' | 'redacted'>
): SchemaFieldValidationResult[] {
  const path = fieldPath('$', field.key);
  if (lineage.redacted) return [result(path, field.key, 'INVALID', ['LINEAGE_REDACTED'], true)];
  if (typeof value !== 'string') return [result(path, field.key, 'INVALID', ['LINEAGE_TYPE_MISMATCH'], true)];
  if (value !== lineage.normalizedValue) return [result(path, field.key, 'INVALID', ['LINEAGE_VALUE_MISMATCH'], true)];
  return [result(path, field.key, 'VALID', [], true)];
}

function result(
  path: string,
  fieldKey: string,
  status: SchemaFieldValidationStatus,
  errorCodes: ReadonlyArray<SchemaValidationErrorCode>,
  lineageChecked: boolean
): SchemaFieldValidationResult {
  return { path, fieldKey, status, errorCodes: [...errorCodes], lineageChecked };
}

function asRecord(value: unknown): Record<string, unknown> {
  const record = asRecordOrNull(value);
  if (!record) throw new Error('Schema validation record nesne olmalıdır.');
  return record;
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isSensitive(value: string): boolean {
  return REDACTED_VALUE.test(value) || SENSITIVE_VALUE.test(value);
}

function isExecutionSafePattern(pattern: string): boolean {
  return !/\((?:[^()]|\\.)*[+*{][^)]*\)[+*{]/.test(pattern);
}

function fieldPath(parentPath: string, key: string): string {
  return parentPath === '$' ? `$.${key}` : `${parentPath}.${key}`;
}

function assertSchemaScope(schema: SchemaValidationInput['schema']): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(schema.tenantId)
    || !/^[A-Za-z0-9._:-]{1,128}$/.test(schema.projectId)
    || !/^[A-Za-z0-9._:-]{1,128}$/.test(schema.schemaId)
    || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(schema.name)
    || !Number.isInteger(schema.version) || schema.version < 1
    || !/^[a-f0-9]{64}$/i.test(schema.definition.fingerprintSha256)) {
    throw new Error('Schema validation scope geçerli değil.');
  }
}

function cloneFieldResult(field: SchemaFieldValidationResult): SchemaFieldValidationResult {
  return { ...field, errorCodes: [...field.errorCodes] };
}
