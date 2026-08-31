import { describe, expect, it } from 'vitest';

import { ExtractionNormalizer } from '../../src/extraction/normalize.js';
import { SchemaVersionRegistry } from '../../src/schema/versioning.js';
import { validateNormalizedRecord } from '../../src/schema/validator.js';

const createdAt = new Date('2026-08-27T00:00:00.000Z');

function createSchema(definition: Record<string, unknown>) {
  const registry = new SchemaVersionRegistry(() => createdAt);
  const version = registry.register({
    tenantId: 'tenant_1',
    projectId: 'project_1',
    schemaId: 'schema_product',
    name: 'product',
    definition,
    createdBy: 'user_1',
    createdAt
  });
  return version;
}

function productSchema() {
  return createSchema({
    additionalProperties: false,
    fields: {
      product_name: { type: 'string', required: true, minLength: 3, maxLength: 60, pattern: '^[A-Za-z ]+$' },
      price: { type: 'number', required: true, minimum: 0, maximum: 10_000 },
      availability: { type: 'boolean', required: false },
      brand: {
        type: 'object',
        required: false,
        additionalProperties: false,
        fields: { name: { type: 'string', required: true, minLength: 2 } }
      },
      images: { type: 'array', required: false, items: { type: 'string', required: true, minLength: 5 } }
    }
  });
}

describe('validateNormalizedRecord', () => {
  it('validates a typed normalized record and exposes no input values in the result', () => {
    const normalized = new ExtractionNormalizer().normalize(['  Acme   Widget  '], [{ kind: 'COLLAPSE_WHITESPACE' }]).values[0]!;
    const report = validateNormalizedRecord({
      schema: productSchema(),
      record: {
        product_name: normalized.normalizedValue,
        price: 12.5,
        availability: true,
        brand: { name: 'Acme' },
        images: ['https://img.example/a.png']
      },
      normalizedLineage: { product_name: normalized }
    });

    expect(report.valid).toBe(true);
    expect(report.unknownFieldCount).toBe(0);
    expect(report.fields.find((field) => field.path === '$.product_name' && field.lineageChecked)?.status).toBe('VALID');
    expect(JSON.stringify(report)).not.toContain('Acme Widget');
    expect(JSON.stringify(report)).not.toContain('https://img.example/a.png');
  });

  it('returns deterministic field-level codes for missing, invalid nested and unknown values', () => {
    const report = validateNormalizedRecord({
      schema: productSchema(),
      record: {
        price: -1,
        availability: 'yes',
        brand: { name: 'A', unexpected: 'not-disclosed' },
        images: ['bad'],
        undeclared: 'not-disclosed'
      }
    });

    expect(report.valid).toBe(false);
    expect(report.unknownFieldCount).toBe(1);
    expect(report.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.product_name', errorCodes: ['MISSING_REQUIRED'] }),
      expect.objectContaining({ path: '$.price', errorCodes: ['NUMBER_BELOW_MINIMUM'] }),
      expect.objectContaining({ path: '$.availability', errorCodes: ['TYPE_MISMATCH'] }),
      expect.objectContaining({ path: '$.brand', errorCodes: ['UNKNOWN_FIELD'] }),
      expect.objectContaining({ path: '$.brand.name', errorCodes: ['STRING_TOO_SHORT'] }),
      expect.objectContaining({ path: '$.images[0]', errorCodes: ['STRING_TOO_SHORT'] }),
      expect.objectContaining({ path: '$', errorCodes: ['UNKNOWN_FIELD'] })
    ]));
    expect(JSON.stringify(report)).not.toContain('undeclared');
    expect(JSON.stringify(report)).not.toContain('not-disclosed');
  });

  it('fails closed when normalized lineage is redacted or does not match the supplied normalized record', () => {
    const schema = productSchema();
    const redacted = new ExtractionNormalizer().normalize(['Authorization: Bearer super-secret']).values[0]!;
    const report = validateNormalizedRecord({
      schema,
      record: { product_name: 'Acme Widget', price: 10 },
      normalizedLineage: {
        product_name: { normalizedValue: 'different', redacted: false },
        price: redacted
      }
    });

    expect(report.valid).toBe(false);
    expect(report.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.product_name', errorCodes: ['LINEAGE_VALUE_MISMATCH'], lineageChecked: true }),
      expect.objectContaining({ path: '$.price', errorCodes: ['LINEAGE_REDACTED'], lineageChecked: true })
    ]));
    expect(JSON.stringify(report)).not.toContain('super-secret');
    expect(JSON.stringify(report)).not.toContain('[REDACTED]');
  });

  it('fails closed for an unsafe runtime pattern without evaluating it against a record value', () => {
    const schema = createSchema({
      fields: { name: { type: 'string', required: true, pattern: '^(a+)+$' } }
    });
    const report = validateNormalizedRecord({ schema, record: { name: 'aaaa!' } });

    expect(report.valid).toBe(false);
    expect(report.fields).toContainEqual(expect.objectContaining({
      path: '$.name',
      errorCodes: ['SCHEMA_PATTERN_UNSAFE']
    }));
  });
});
