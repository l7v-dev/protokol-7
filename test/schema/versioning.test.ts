import { describe, expect, it } from 'vitest';

import { parseSchemaDefinition } from '../../src/schema/definition.js';
import { compareSchemaCompatibility, SchemaVersionError, SchemaVersionRegistry } from '../../src/schema/versioning.js';
import type { SchemaVersionDraft, SchemaVersionErrorCode } from '../../src/schema/versioning.js';

const createdAt = new Date('2026-08-27T00:00:00.000Z');

function productDefinition(): Record<string, unknown> {
  return {
    additionalProperties: false,
    fields: {
      product_name: { type: 'string', required: true, minLength: 1, maxLength: 200 },
      price: { type: 'number', required: true, minimum: 0 },
      availability: { type: 'boolean', required: false }
    }
  };
}

function draft(overrides: Partial<SchemaVersionDraft> = {}): SchemaVersionDraft {
  return {
    tenantId: 'tenant_1',
    projectId: 'project_1',
    schemaId: 'schema_products',
    name: 'product',
    definition: productDefinition(),
    createdBy: 'user_1',
    createdAt,
    ...overrides
  };
}

function expectVersionError(action: () => unknown, code: SchemaVersionErrorCode): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SchemaVersionError);
    expect((error as SchemaVersionError).code).toBe(code);
    return;
  }
  throw new Error(`Expected schema version error ${code}.`);
}

describe('SchemaVersionRegistry', () => {
  it('creates immutable sequential versions and permits compatible additions', () => {
    const registry = new SchemaVersionRegistry(() => createdAt);
    const first = registry.register(draft());
    const second = registry.register(draft({
      definition: {
        ...productDefinition(),
        fields: {
          ...(productDefinition().fields as Record<string, unknown>),
          brand: { type: 'string', required: false, maxLength: 120 }
        }
      }
    }));

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.compatibilityWithPrevious?.backwardCompatible).toBe(true);
    expect(second.compatibilityWithPrevious?.changes).toContainEqual({ path: '$.brand', code: 'FIELD_ADDED', breaking: false });

    const resolved = registry.resolve({ tenantId: 'tenant_1', projectId: 'project_1', name: 'product', version: 1 });
    resolved.definition.fields[0]!.key = 'mutated';
    expect(registry.resolve({ tenantId: 'tenant_1', projectId: 'project_1', name: 'product', version: 1 }).definition.fields[0]!.key).toBe('product_name');
  });

  it('rejects breaking changes unless the explicit policy acknowledges them', () => {
    const registry = new SchemaVersionRegistry(() => createdAt);
    registry.register(draft());
    const breakingDefinition = {
      ...productDefinition(),
      fields: {
        ...(productDefinition().fields as Record<string, unknown>),
        price: { type: 'string', required: true, minLength: 1 },
        category: { type: 'string', required: true }
      }
    };

    expectVersionError(() => registry.register(draft({ definition: breakingDefinition })), 'SCHEMA_VERSION_COMPATIBILITY_VIOLATION');
    const acknowledged = registry.register(draft({ definition: breakingDefinition, compatibilityPolicy: 'ALLOW_BREAKING' }));
    expect(acknowledged.version).toBe(2);
    expect(acknowledged.compatibilityWithPrevious?.backwardCompatible).toBe(false);
    expect(acknowledged.compatibilityWithPrevious?.changes).toEqual(expect.arrayContaining([
      { path: '$.price', code: 'FIELD_TYPE_CHANGED', breaking: true },
      { path: '$.category', code: 'FIELD_ADDED', breaking: true }
    ]));
  });

  it('preserves a published schema snapshot for the original job and rejects rebinding drift', () => {
    const registry = new SchemaVersionRegistry(() => createdAt);
    const first = registry.register(draft());
    registry.publish({ tenantId: 'tenant_1', projectId: 'project_1', name: 'product', version: first.version });
    const binding = registry.bindJob({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', name: 'product', version: 1 });

    const second = registry.register(draft({
      definition: {
        ...productDefinition(),
        fields: {
          ...(productDefinition().fields as Record<string, unknown>),
          brand: { type: 'string', required: false }
        }
      }
    }));
    registry.publish({ tenantId: 'tenant_1', projectId: 'project_1', name: 'product', version: second.version });

    expect(registry.bindJob({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', name: 'product', version: 1 })).toEqual(binding);
    expect(binding.schemaVersion).toBe(1);
    expect(binding.schemaFingerprintSha256).toBe(first.definition.fingerprintSha256);
    expectVersionError(
      () => registry.bindJob({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', name: 'product', version: 2 }),
      'SCHEMA_VERSION_BINDING_CONFLICT'
    );
  });

  it('keeps compatibility reports deterministic and preserves tenant isolation', () => {
    const previous = parseSchemaDefinition(productDefinition());
    const candidate = parseSchemaDefinition({
      ...productDefinition(),
      fields: {
        ...(productDefinition().fields as Record<string, unknown>),
        price: { type: 'number', required: true, minimum: 10, maximum: 1_000 }
      }
    });
    const report = compareSchemaCompatibility(previous, candidate);
    expect(report.backwardCompatible).toBe(false);
    expect(report.changes).toContainEqual({ path: '$.price', code: 'NUMBER_MINIMUM_INCREASED', breaking: true });

    const registry = new SchemaVersionRegistry(() => createdAt);
    registry.register(draft());
    expectVersionError(
      () => registry.resolve({ tenantId: 'tenant_2', projectId: 'project_1', name: 'product', version: 1 }),
      'SCHEMA_VERSION_NOT_FOUND'
    );
  });
});
