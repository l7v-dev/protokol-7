import type { SchemaDefinition, SchemaFieldDefinition } from './definition.js';
import { parseSchemaDefinition } from './definition.js';

export type SchemaVersionStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
export type SchemaCompatibilityPolicy = 'REQUIRE_BACKWARD_COMPATIBLE' | 'ALLOW_BREAKING';

export type SchemaVersionDraft = {
  tenantId: string;
  projectId: string;
  schemaId: string;
  name: string;
  definition: unknown;
  createdBy: string;
  compatibilityPolicy?: SchemaCompatibilityPolicy;
  createdAt?: Date;
};

export type SchemaCompatibilityChangeCode =
  | 'FIELD_ADDED'
  | 'FIELD_REMOVED'
  | 'FIELD_TYPE_CHANGED'
  | 'FIELD_BECAME_REQUIRED'
  | 'FIELD_BECAME_NON_NULLABLE'
  | 'STRING_MIN_LENGTH_INCREASED'
  | 'STRING_MAX_LENGTH_DECREASED'
  | 'STRING_PATTERN_CHANGED'
  | 'NUMBER_MINIMUM_INCREASED'
  | 'NUMBER_MAXIMUM_DECREASED'
  | 'ADDITIONAL_PROPERTIES_RESTRICTED';

export type SchemaCompatibilityChange = {
  path: string;
  code: SchemaCompatibilityChangeCode;
  breaking: boolean;
};

export type SchemaCompatibilityReport = {
  previousFingerprintSha256: string;
  candidateFingerprintSha256: string;
  backwardCompatible: boolean;
  changes: ReadonlyArray<SchemaCompatibilityChange>;
};

export type SchemaVersion = {
  tenantId: string;
  projectId: string;
  schemaId: string;
  name: string;
  version: number;
  definition: SchemaDefinition;
  status: SchemaVersionStatus;
  createdBy: string;
  createdAt: string;
  compatibilityPolicy: SchemaCompatibilityPolicy;
  compatibilityWithPrevious?: SchemaCompatibilityReport;
};

export type SchemaVersionJobBinding = {
  tenantId: string;
  projectId: string;
  jobId: string;
  schemaId: string;
  schemaName: string;
  schemaVersion: number;
  schemaFingerprintSha256: string;
  boundAt: string;
};

export type SchemaVersionErrorCode =
  | 'SCHEMA_VERSION_INVALID'
  | 'SCHEMA_VERSION_NOT_FOUND'
  | 'SCHEMA_VERSION_IMMUTABLE'
  | 'SCHEMA_VERSION_COMPATIBILITY_VIOLATION'
  | 'SCHEMA_VERSION_BINDING_CONFLICT';

export class SchemaVersionError extends Error {
  public constructor(public readonly code: SchemaVersionErrorCode, message: string) {
    super(message);
    this.name = 'SchemaVersionError';
  }
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_SCHEMA_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Process-local schema registry. It keeps each resolved version immutable and
 * models compatibility decisions before durable repository integration.
 */
export class SchemaVersionRegistry {
  private readonly versions = new Map<string, SchemaVersion[]>();
  private readonly jobBindings = new Map<string, SchemaVersionJobBinding>();

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public register(draft: SchemaVersionDraft): SchemaVersion {
    validateDraft(draft);
    const definition = parseSchemaDefinition(draft.definition);
    const key = schemaKey(draft.tenantId, draft.projectId, draft.name);
    const previousVersions = this.versions.get(key) ?? [];
    const previous = previousVersions.at(-1);
    if (previous && previous.schemaId !== draft.schemaId) {
      throw new SchemaVersionError('SCHEMA_VERSION_INVALID', 'Aynı schema name farklı schemaId ile versionlanamaz.');
    }
    const compatibilityPolicy = draft.compatibilityPolicy ?? 'REQUIRE_BACKWARD_COMPATIBLE';
    const compatibilityWithPrevious = previous ? compareSchemaCompatibility(previous.definition, definition) : undefined;
    if (compatibilityWithPrevious && !compatibilityWithPrevious.backwardCompatible && compatibilityPolicy !== 'ALLOW_BREAKING') {
      throw new SchemaVersionError(
        'SCHEMA_VERSION_COMPATIBILITY_VIOLATION',
        'Breaking schema değişikliği için ALLOW_BREAKING compatibility policy açıkça seçilmelidir.'
      );
    }
    const version: SchemaVersion = {
      tenantId: draft.tenantId,
      projectId: draft.projectId,
      schemaId: draft.schemaId,
      name: draft.name,
      version: previousVersions.length + 1,
      definition: cloneDefinition(definition),
      status: 'DRAFT',
      createdBy: draft.createdBy,
      createdAt: (draft.createdAt ?? this.now()).toISOString(),
      compatibilityPolicy,
      ...(compatibilityWithPrevious === undefined ? {} : { compatibilityWithPrevious: cloneCompatibilityReport(compatibilityWithPrevious) })
    };
    this.versions.set(key, [...previousVersions, cloneVersion(version)]);
    return cloneVersion(version);
  }

  public resolve(input: { tenantId: string; projectId: string; name: string; version: number }): SchemaVersion {
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.projectId, 'projectId');
    assertSchemaName(input.name);
    if (!Number.isInteger(input.version) || input.version < 1) {
      throw new SchemaVersionError('SCHEMA_VERSION_INVALID', 'Schema version pozitif integer olmalıdır.');
    }
    const version = this.versions.get(schemaKey(input.tenantId, input.projectId, input.name))?.[input.version - 1];
    if (!version) {
      throw new SchemaVersionError('SCHEMA_VERSION_NOT_FOUND', 'Schema version bulunamadı.');
    }
    return cloneVersion(version);
  }

  public publish(input: { tenantId: string; projectId: string; name: string; version: number }): SchemaVersion {
    const resolved = this.resolve(input);
    if (resolved.status !== 'DRAFT') {
      throw new SchemaVersionError('SCHEMA_VERSION_IMMUTABLE', 'Yalnızca DRAFT schema version publish edilebilir.');
    }
    const key = schemaKey(input.tenantId, input.projectId, input.name);
    const stored = this.versions.get(key);
    const index = input.version - 1;
    if (!stored?.[index]) {
      throw new SchemaVersionError('SCHEMA_VERSION_NOT_FOUND', 'Schema version bulunamadı.');
    }
    const published: SchemaVersion = { ...resolved, status: 'PUBLISHED' };
    const next = [...stored];
    next[index] = cloneVersion(published);
    this.versions.set(key, next);
    return cloneVersion(published);
  }

  public bindJob(input: {
    tenantId: string;
    projectId: string;
    jobId: string;
    name: string;
    version: number;
  }): SchemaVersionJobBinding {
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.projectId, 'projectId');
    assertIdentifier(input.jobId, 'jobId');
    const schema = this.resolve(input);
    if (schema.status !== 'PUBLISHED') {
      throw new SchemaVersionError('SCHEMA_VERSION_INVALID', 'Job yalnızca PUBLISHED schema version ile bağlanabilir.');
    }
    const candidate: SchemaVersionJobBinding = {
      tenantId: input.tenantId,
      projectId: input.projectId,
      jobId: input.jobId,
      schemaId: schema.schemaId,
      schemaName: schema.name,
      schemaVersion: schema.version,
      schemaFingerprintSha256: schema.definition.fingerprintSha256,
      boundAt: this.now().toISOString()
    };
    const key = jobBindingKey(input.tenantId, input.jobId);
    const existing = this.jobBindings.get(key);
    if (existing) {
      if (!sameBinding(existing, candidate)) {
        throw new SchemaVersionError('SCHEMA_VERSION_BINDING_CONFLICT', 'Job farklı bir schema version ile yeniden bağlanamaz.');
      }
      return { ...existing };
    }
    this.jobBindings.set(key, { ...candidate });
    return candidate;
  }
}

export function compareSchemaCompatibility(previous: SchemaDefinition, candidate: SchemaDefinition): SchemaCompatibilityReport {
  const changes: SchemaCompatibilityChange[] = [];
  if (previous.additionalProperties && !candidate.additionalProperties) {
    changes.push({ path: '$', code: 'ADDITIONAL_PROPERTIES_RESTRICTED', breaking: true });
  }
  compareFieldCollection(previous.fields, candidate.fields, '$', changes);
  return {
    previousFingerprintSha256: previous.fingerprintSha256,
    candidateFingerprintSha256: candidate.fingerprintSha256,
    backwardCompatible: !changes.some((change) => change.breaking),
    changes
  };
}

function compareFieldCollection(
  previousFields: ReadonlyArray<SchemaFieldDefinition>,
  candidateFields: ReadonlyArray<SchemaFieldDefinition>,
  parentPath: string,
  changes: SchemaCompatibilityChange[]
): void {
  const previousByKey = new Map(previousFields.map((field) => [field.key, field]));
  const candidateByKey = new Map(candidateFields.map((field) => [field.key, field]));
  for (const [key, previous] of previousByKey) {
    const candidate = candidateByKey.get(key);
    const path = fieldPath(parentPath, key);
    if (!candidate) {
      changes.push({ path, code: 'FIELD_REMOVED', breaking: true });
      continue;
    }
    compareField(previous, candidate, path, changes);
  }
  for (const [key, candidate] of candidateByKey) {
    if (!previousByKey.has(key)) {
      changes.push({ path: fieldPath(parentPath, key), code: 'FIELD_ADDED', breaking: candidate.required });
    }
  }
}

function compareField(
  previous: SchemaFieldDefinition,
  candidate: SchemaFieldDefinition,
  path: string,
  changes: SchemaCompatibilityChange[]
): void {
  if (previous.type !== candidate.type) {
    changes.push({ path, code: 'FIELD_TYPE_CHANGED', breaking: true });
    return;
  }
  if (!previous.required && candidate.required) changes.push({ path, code: 'FIELD_BECAME_REQUIRED', breaking: true });
  if (previous.nullable && !candidate.nullable) changes.push({ path, code: 'FIELD_BECAME_NON_NULLABLE', breaking: true });
  switch (previous.type) {
    case 'string':
      compareStringConstraints(previous, candidate, path, changes);
      return;
    case 'number':
      compareNumberConstraints(previous, candidate, path, changes);
      return;
    case 'object':
      if (previous.additionalProperties && !candidate.additionalProperties) {
        changes.push({ path, code: 'ADDITIONAL_PROPERTIES_RESTRICTED', breaking: true });
      }
      compareFieldCollection(previous.fields ?? [], candidate.fields ?? [], path, changes);
      return;
    case 'array':
      if (!previous.items || !candidate.items) return;
      compareField(previous.items, candidate.items, `${path}[]`, changes);
      return;
    case 'boolean':
      return;
  }
}

function compareStringConstraints(
  previous: SchemaFieldDefinition,
  candidate: SchemaFieldDefinition,
  path: string,
  changes: SchemaCompatibilityChange[]
): void {
  if ((candidate.minLength ?? 0) > (previous.minLength ?? 0)) {
    changes.push({ path, code: 'STRING_MIN_LENGTH_INCREASED', breaking: true });
  }
  if (candidate.maxLength !== undefined && (previous.maxLength === undefined || candidate.maxLength < previous.maxLength)) {
    changes.push({ path, code: 'STRING_MAX_LENGTH_DECREASED', breaking: true });
  }
  if (candidate.pattern !== previous.pattern && candidate.pattern !== undefined) {
    changes.push({ path, code: 'STRING_PATTERN_CHANGED', breaking: true });
  }
}

function compareNumberConstraints(
  previous: SchemaFieldDefinition,
  candidate: SchemaFieldDefinition,
  path: string,
  changes: SchemaCompatibilityChange[]
): void {
  if (candidate.minimum !== undefined && (previous.minimum === undefined || candidate.minimum > previous.minimum)) {
    changes.push({ path, code: 'NUMBER_MINIMUM_INCREASED', breaking: true });
  }
  if (candidate.maximum !== undefined && (previous.maximum === undefined || candidate.maximum < previous.maximum)) {
    changes.push({ path, code: 'NUMBER_MAXIMUM_DECREASED', breaking: true });
  }
}

function validateDraft(draft: SchemaVersionDraft): void {
  assertIdentifier(draft.tenantId, 'tenantId');
  assertIdentifier(draft.projectId, 'projectId');
  assertIdentifier(draft.schemaId, 'schemaId');
  assertIdentifier(draft.createdBy, 'createdBy');
  assertSchemaName(draft.name);
  if (draft.compatibilityPolicy !== undefined && draft.compatibilityPolicy !== 'REQUIRE_BACKWARD_COMPATIBLE' && draft.compatibilityPolicy !== 'ALLOW_BREAKING') {
    throw new SchemaVersionError('SCHEMA_VERSION_INVALID', 'Schema compatibility policy desteklenmiyor.');
  }
}

function assertIdentifier(value: string, name: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new SchemaVersionError('SCHEMA_VERSION_INVALID', `${name} güvenli identifier biçiminde olmalıdır.`);
  }
}

function assertSchemaName(value: string): void {
  if (!SAFE_SCHEMA_NAME.test(value)) {
    throw new SchemaVersionError('SCHEMA_VERSION_INVALID', 'Schema name güvenli identifier biçiminde olmalıdır.');
  }
}

function schemaKey(tenantId: string, projectId: string, name: string): string {
  return `${tenantId}:${projectId}:${name}`;
}

function jobBindingKey(tenantId: string, jobId: string): string {
  return `${tenantId}:${jobId}`;
}

function fieldPath(parentPath: string, key: string): string {
  return parentPath === '$' ? `$.${key}` : `${parentPath}.${key}`;
}

function cloneDefinition(definition: SchemaDefinition): SchemaDefinition {
  return {
    additionalProperties: definition.additionalProperties,
    fields: cloneFields(definition.fields),
    fingerprintSha256: definition.fingerprintSha256
  };
}

function cloneFields(fields: ReadonlyArray<SchemaFieldDefinition>): SchemaFieldDefinition[] {
  return fields.map((field) => ({
    ...field,
    ...(field.fields === undefined ? {} : { fields: cloneFields(field.fields) }),
    ...(field.items === undefined ? {} : { items: cloneFields([field.items])[0]! })
  }));
}

function cloneCompatibilityReport(report: SchemaCompatibilityReport): SchemaCompatibilityReport {
  return { ...report, changes: report.changes.map((change) => ({ ...change })) };
}

function cloneVersion(version: SchemaVersion): SchemaVersion {
  return {
    ...version,
    definition: cloneDefinition(version.definition),
    ...(version.compatibilityWithPrevious === undefined ? {} : { compatibilityWithPrevious: cloneCompatibilityReport(version.compatibilityWithPrevious) })
  };
}

function sameBinding(left: SchemaVersionJobBinding, right: SchemaVersionJobBinding): boolean {
  return left.tenantId === right.tenantId
    && left.projectId === right.projectId
    && left.jobId === right.jobId
    && left.schemaId === right.schemaId
    && left.schemaName === right.schemaName
    && left.schemaVersion === right.schemaVersion
    && left.schemaFingerprintSha256 === right.schemaFingerprintSha256;
}
