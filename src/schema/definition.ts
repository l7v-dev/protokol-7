import { createHash } from 'node:crypto';

export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export type SchemaFieldDefinition = {
  key: string;
  type: SchemaFieldType;
  required: boolean;
  nullable: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  fields?: ReadonlyArray<SchemaFieldDefinition>;
  additionalProperties?: boolean;
  items?: SchemaFieldDefinition;
};

export type SchemaDefinition = {
  additionalProperties: boolean;
  fields: ReadonlyArray<SchemaFieldDefinition>;
  fingerprintSha256: string;
};

export type SchemaDefinitionErrorCode = 'SCHEMA_DEFINITION_INVALID';

export class SchemaDefinitionError extends Error {
  public constructor(public readonly code: SchemaDefinitionErrorCode, message: string) {
    super(message);
    this.name = 'SchemaDefinitionError';
  }
}

const SAFE_FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SENSITIVE_FIELD_KEY = /authorization|cookie|credential|password|secret|token|session|api[_-]?key/i;
const FIELD_TYPES: ReadonlySet<SchemaFieldType> = new Set(['string', 'number', 'boolean', 'object', 'array']);
const MAX_FIELDS_PER_OBJECT = 100;
const MAX_NESTING_DEPTH = 5;
const MAX_STRING_LENGTH = 10_000;
const MAX_PATTERN_LENGTH = 256;

/**
 * Parses only the data contract of a schema. Schema identity, versioning,
 * compatibility policy, persistence and record validation remain separate
 * responsibilities of later Phase 7 tasks.
 */
export function parseSchemaDefinition(value: unknown): SchemaDefinition {
  const input = asRecord(value, 'Schema tanımı nesne olmalıdır.');
  assertAllowedKeys(input, new Set(['fields', 'additionalProperties']), 'Schema tanımında izin verilmeyen alan var.');
  const fieldsInput = asRecord(input.fields, 'Schema tanımı en az bir fields nesnesi içermelidir.');
  const additionalProperties = parseBoolean(input.additionalProperties, false, 'additionalProperties boolean olmalıdır.');
  const fields = parseFields(fieldsInput, 1);
  const definition = { additionalProperties, fields };
  return { ...definition, fingerprintSha256: fingerprint(canonicalDefinition(definition)) };
}

/** Serializes the parsed contract for JSON persistence without derived evidence. */
export function serializeSchemaDefinition(definition: SchemaDefinition): Record<string, unknown> {
  return {
    additionalProperties: definition.additionalProperties,
    fields: serializeFields(definition.fields)
  };
}

function parseFields(input: Record<string, unknown>, depth: number): SchemaFieldDefinition[] {
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > MAX_FIELDS_PER_OBJECT) {
    invalid('Bir schema object 1 ila 100 field içermelidir.');
  }
  return entries.map(([key, field]) => parseField(key, field, depth));
}

function parseField(key: string, value: unknown, depth: number): SchemaFieldDefinition {
  if (!SAFE_FIELD_KEY.test(key) || SENSITIVE_FIELD_KEY.test(key)) {
    invalid('Schema field key güvenli identifier biçiminde olmalıdır.');
  }
  if (depth > MAX_NESTING_DEPTH) {
    invalid('Schema field nesting limiti aşıldı.');
  }
  const input = asRecord(value, 'Schema field tanımı nesne olmalıdır.');
  const type = parseFieldType(input.type);
  const required = parseRequired(input.required);
  const nullable = parseBoolean(input.nullable, false, 'nullable boolean olmalıdır.');
  const base = { key, type, required, nullable };

  switch (type) {
    case 'string':
      return parseStringField(base, input);
    case 'number':
      return parseNumberField(base, input);
    case 'boolean':
      assertAllowedKeys(input, new Set(['type', 'required', 'nullable']), 'Boolean field constraint kabul etmez.');
      return base;
    case 'object':
      return parseObjectField(base, input, depth);
    case 'array':
      return parseArrayField(base, input, depth);
  }
}

function parseStringField(
  base: Pick<SchemaFieldDefinition, 'key' | 'type' | 'required' | 'nullable'>,
  input: Record<string, unknown>
): SchemaFieldDefinition {
  assertAllowedKeys(input, new Set(['type', 'required', 'nullable', 'minLength', 'maxLength', 'pattern']), 'String field constraint geçersiz.');
  const minLength = parseBoundedInteger(input.minLength, 'minLength', 0, MAX_STRING_LENGTH);
  const maxLength = parseBoundedInteger(input.maxLength, 'maxLength', 0, MAX_STRING_LENGTH);
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    invalid('String minLength maxLength değerinden büyük olamaz.');
  }
  const pattern = parsePattern(input.pattern);
  return {
    ...base,
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(pattern === undefined ? {} : { pattern })
  };
}

function parseNumberField(
  base: Pick<SchemaFieldDefinition, 'key' | 'type' | 'required' | 'nullable'>,
  input: Record<string, unknown>
): SchemaFieldDefinition {
  assertAllowedKeys(input, new Set(['type', 'required', 'nullable', 'minimum', 'maximum']), 'Number field constraint geçersiz.');
  const minimum = parseFiniteNumber(input.minimum, 'minimum');
  const maximum = parseFiniteNumber(input.maximum, 'maximum');
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    invalid('Number minimum maximum değerinden büyük olamaz.');
  }
  return {
    ...base,
    ...(minimum === undefined ? {} : { minimum }),
    ...(maximum === undefined ? {} : { maximum })
  };
}

function parseObjectField(
  base: Pick<SchemaFieldDefinition, 'key' | 'type' | 'required' | 'nullable'>,
  input: Record<string, unknown>,
  depth: number
): SchemaFieldDefinition {
  assertAllowedKeys(input, new Set(['type', 'required', 'nullable', 'fields', 'additionalProperties']), 'Object field constraint geçersiz.');
  const fieldsInput = asRecord(input.fields, 'Object field fields nesnesi içermelidir.');
  const additionalProperties = parseBoolean(input.additionalProperties, false, 'Object additionalProperties boolean olmalıdır.');
  return { ...base, fields: parseFields(fieldsInput, depth + 1), additionalProperties };
}

function parseArrayField(
  base: Pick<SchemaFieldDefinition, 'key' | 'type' | 'required' | 'nullable'>,
  input: Record<string, unknown>,
  depth: number
): SchemaFieldDefinition {
  assertAllowedKeys(input, new Set(['type', 'required', 'nullable', 'items']), 'Array field constraint geçersiz.');
  return { ...base, items: parseField('item', input.items, depth + 1) };
}

function parseFieldType(value: unknown): SchemaFieldType {
  if (typeof value !== 'string' || !FIELD_TYPES.has(value as SchemaFieldType)) {
    invalid('Schema field type desteklenmiyor.');
  }
  return value as SchemaFieldType;
}

function parseRequired(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    invalid('Schema field required boolean olarak açıkça belirtilmelidir.');
  }
  return value;
}

function parseBoolean(value: unknown, defaultValue: boolean, message: string): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'boolean') invalid(message);
  return value;
}

function parseBoundedInteger(value: unknown, name: string, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    invalid(`${name} kabul edilen integer sınırında olmalıdır.`);
  }
  return value;
}

function parseFiniteNumber(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`${name} finite number olmalıdır.`);
  }
  return value;
}

function parsePattern(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATTERN_LENGTH) {
    invalid('String pattern kabul edilen uzunlukta olmalıdır.');
  }
  if (/\\[1-9]|\(\?[<!=]|\(\?=|\(\?!/.test(value)) {
    invalid('String pattern backreference veya lookaround içeremez.');
  }
  try {
    new RegExp(value, 'u');
  } catch {
    invalid('String pattern geçerli regex olmalıdır.');
  }
  return value;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}

function assertAllowedKeys(input: Record<string, unknown>, allowed: ReadonlySet<string>, message: string): void {
  if (Object.keys(input).some((key) => !allowed.has(key))) invalid(message);
}

function canonicalDefinition(definition: Pick<SchemaDefinition, 'additionalProperties' | 'fields'>): unknown {
  return {
    additionalProperties: definition.additionalProperties,
    fields: canonicalFields(definition.fields)
  };
}

function serializeFields(fields: ReadonlyArray<SchemaFieldDefinition>): Record<string, unknown> {
  return Object.fromEntries(fields.map((field) => [field.key, serializeField(field)]));
}

function serializeField(field: SchemaFieldDefinition): Record<string, unknown> {
  return {
    type: field.type,
    required: field.required,
    nullable: field.nullable,
    ...(field.minLength === undefined ? {} : { minLength: field.minLength }),
    ...(field.maxLength === undefined ? {} : { maxLength: field.maxLength }),
    ...(field.pattern === undefined ? {} : { pattern: field.pattern }),
    ...(field.minimum === undefined ? {} : { minimum: field.minimum }),
    ...(field.maximum === undefined ? {} : { maximum: field.maximum }),
    ...(field.fields === undefined ? {} : { fields: serializeFields(field.fields) }),
    ...(field.additionalProperties === undefined ? {} : { additionalProperties: field.additionalProperties }),
    ...(field.items === undefined ? {} : { items: serializeField(field.items) })
  };
}

function canonicalFields(fields: ReadonlyArray<SchemaFieldDefinition>): SchemaFieldDefinition[] {
  return fields
    .map((field) => ({
      ...field,
      ...(field.fields === undefined ? {} : { fields: canonicalFields(field.fields) }),
      ...(field.items === undefined ? {} : { items: canonicalFields([field.items])[0]! })
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function invalid(message: string): never {
  throw new SchemaDefinitionError('SCHEMA_DEFINITION_INVALID', message);
}
