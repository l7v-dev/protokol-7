import { describe, expect, it } from 'vitest';

import { parseSchemaDefinition, SchemaDefinitionError, serializeSchemaDefinition } from '../../src/schema/definition.js';

function validDefinition(): Record<string, unknown> {
  return {
    additionalProperties: false,
    fields: {
      product_name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
      price: { type: 'number', required: true, minimum: 0 },
      availability: { type: 'boolean', required: false },
      brand: {
        type: 'object',
        required: false,
        additionalProperties: false,
        fields: {
          name: { type: 'string', required: true, pattern: '^[A-Za-z ]+$' }
        }
      },
      images: {
        type: 'array',
        required: false,
        items: { type: 'string', required: true, maxLength: 2_048 }
      }
    }
  };
}

function expectInvalid(value: unknown): void {
  expect(() => parseSchemaDefinition(value)).toThrow(SchemaDefinitionError);
  try {
    parseSchemaDefinition(value);
  } catch (error) {
    expect((error as SchemaDefinitionError).code).toBe('SCHEMA_DEFINITION_INVALID');
  }
}

describe('parseSchemaDefinition', () => {
  it('parses bounded nested field types and generates a deterministic fingerprint', () => {
    const first = parseSchemaDefinition(validDefinition());
    const second = parseSchemaDefinition({
      ...validDefinition(),
      fields: {
        images: validDefinition().fields instanceof Object
          ? (validDefinition().fields as Record<string, unknown>).images
          : undefined,
        availability: (validDefinition().fields as Record<string, unknown>).availability,
        price: (validDefinition().fields as Record<string, unknown>).price,
        brand: (validDefinition().fields as Record<string, unknown>).brand,
        product_name: (validDefinition().fields as Record<string, unknown>).product_name
      }
    });

    expect(first.additionalProperties).toBe(false);
    expect(first.fields.map((field) => field.key)).toEqual(['product_name', 'price', 'availability', 'brand', 'images']);
    expect(first.fields.find((field) => field.key === 'brand')?.fields?.[0]?.key).toBe('name');
    expect(first.fields.find((field) => field.key === 'images')?.items?.type).toBe('string');
    expect(first.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(second.fingerprintSha256).toBe(first.fingerprintSha256);
    expect(serializeSchemaDefinition(first)).toMatchObject({
      additionalProperties: false,
      fields: {
        product_name: { type: 'string', required: true, nullable: false },
        brand: { type: 'object', additionalProperties: false, fields: { name: { type: 'string', required: true } } }
      }
    });
    expect(JSON.stringify(serializeSchemaDefinition(first))).not.toContain('fingerprintSha256');
  });

  it('rejects invalid types, unsafe field names and invalid type-specific constraints', () => {
    expectInvalid({ fields: { api_token: { type: 'string', required: true } } });
    expectInvalid({ fields: { title: { type: 'date', required: true } } });
    expectInvalid({ fields: { price: { type: 'number', required: true, minLength: 1 } } });
    expectInvalid({ fields: { title: { type: 'string', required: true, minLength: 10, maxLength: 2 } } });
    expectInvalid({ fields: { title: { type: 'string', required: true, pattern: '(?=unsafe)' } } });
  });

  it('rejects ambiguous object and array definitions, unknown properties and unsafe depth', () => {
    expectInvalid({ fields: { metadata: { type: 'object', required: false } } });
    expectInvalid({ fields: { tags: { type: 'array', required: false } } });
    expectInvalid({ fields: { title: { type: 'string', required: true, arbitrary: 'value' } } });
    expectInvalid({ additionalProperties: 'false', fields: { title: { type: 'string', required: true } } });
    expectInvalid({
      fields: {
        level_1: {
          type: 'object', required: true, fields: {
            level_2: { type: 'object', required: true, fields: {
              level_3: { type: 'object', required: true, fields: {
                level_4: { type: 'object', required: true, fields: {
                  level_5: { type: 'object', required: true, fields: {
                    level_6: { type: 'string', required: true }
                  } }
                } }
              } }
            } }
          }
        }
      }
    });
  });
});
