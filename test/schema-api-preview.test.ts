import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { registerResourceRoutes } from '../src/routes/resources.js';
import { ApiError, sendApiError } from '../src/shared/http.js';
import type { CreateSchemaInput } from '../src/database/repositories/schema-repository.js';
import type { SchemaRecord } from '../src/database/repositories/schema-repository.js';
import type { ResourceService } from '../src/services/resource-service.js';

function storedSchema(): SchemaRecord {
  return {
    id: 'schema_product',
    tenantId: 'tenant_1',
    projectId: 'project_1',
    name: 'product',
    version: 1,
    definition: {
      additionalProperties: false,
      fields: {
        product_name: { type: 'string', required: true, minLength: 3 },
        price: { type: 'number', required: true, minimum: 0 }
      }
    },
    status: 'DRAFT',
    createdBy: 'user_1',
    createdAt: new Date('2026-08-27T00:00:00.000Z')
  };
}

function buildResourceRouteApp(schema: SchemaRecord | null) {
  const app = Fastify();
  let createdSchemaInput: CreateSchemaInput | undefined;
  app.decorateRequest('authContext', null);
  app.addHook('onRequest', async (request) => {
    request.authContext = { actorId: 'user_1', actorType: 'test', tenantId: 'tenant_1', roles: ['owner'], scopes: ['*'] };
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      sendApiError(request, reply, error);
      return;
    }
    throw error;
  });
  const service = {
    getProject: async (tenantId: string, projectId: string) => tenantId === 'tenant_1' && projectId === 'project_1'
      ? { id: 'project_1', tenantId: 'tenant_1', name: 'project', description: null, status: 'ACTIVE', defaultPolicy: {}, createdBy: 'user_1', createdAt: new Date(), updatedAt: new Date() }
      : null,
    getSchema: async (tenantId: string, schemaId: string) => tenantId === 'tenant_1' && schemaId === 'schema_product' ? schema : null,
    createSchema: async (input: CreateSchemaInput) => {
      createdSchemaInput = input;
      return {
        id: input.id,
        tenantId: input.tenantId,
        projectId: input.projectId,
        name: input.name,
        version: input.version,
        definition: input.definition,
        status: 'DRAFT' as const,
        createdBy: input.createdBy,
        createdAt: new Date('2026-08-27T00:00:00.000Z')
      };
    }
  } as unknown as ResourceService;
  registerResourceRoutes(app, service);
  return { app, createdSchemaInput: () => createdSchemaInput };
}

describe('schema validation preview route', () => {
  it('returns a secret-safe validation preview for a tenant-scoped schema', async () => {
    const { app } = buildResourceRouteApp(storedSchema());
    const response = await app.inject({
      method: 'POST',
      url: '/schemas/schema_product/validation-preview',
      payload: { record: { product_name: 'A', price: -3, undeclared: 'raw-private-value' } }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      data: {
        type: 'schema-validation-preview',
        id: 'schema_product:1',
        attributes: {
          valid: false,
          unknownFieldCount: 1,
          fields: expect.arrayContaining([
            expect.objectContaining({ path: '$.product_name', errorCodes: ['STRING_TOO_SHORT'] }),
            expect.objectContaining({ path: '$.price', errorCodes: ['NUMBER_BELOW_MINIMUM'] }),
            expect.objectContaining({ path: '$', errorCodes: ['UNKNOWN_FIELD'] })
          ])
        }
      }
    });
    expect(response.body).not.toContain('raw-private-value');
    expect(response.body).not.toContain('undeclared');
    await app.close();
  });

  it('rejects malformed preview input and hides unavailable schemas across tenant scope', async () => {
    const { app } = buildResourceRouteApp(null);
    const malformed = await app.inject({
      method: 'POST',
      url: '/schemas/schema_product/validation-preview',
      payload: { record: ['not-a-record'] }
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR', category: 'VALIDATION' } });

    const missing = await app.inject({
      method: 'POST',
      url: '/schemas/schema_product/validation-preview',
      payload: { record: { product_name: 'Acme', price: 20 } }
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: { code: 'RESOURCE_NOT_FOUND', category: 'VALIDATION', retryable: false } });
    await app.close();
  });

  it('parses a valid schema create contract before persisting only canonical definition data', async () => {
    const { app, createdSchemaInput } = buildResourceRouteApp(null);
    const response = await app.inject({
      method: 'POST',
      url: '/projects/project_1/schemas',
      payload: {
        name: 'product',
        fields: {
          product_name: { type: 'string', required: true, minLength: 3 },
          labels: { type: 'array', required: false, items: { type: 'string', required: true } }
        }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createdSchemaInput()).toMatchObject({
      tenantId: 'tenant_1',
      projectId: 'project_1',
      name: 'product',
      version: 1,
      definition: {
        additionalProperties: false,
        fields: {
          product_name: { type: 'string', required: true, nullable: false },
          labels: { type: 'array', required: false, nullable: false, items: { type: 'string', required: true, nullable: false } }
        }
      }
    });
    expect(JSON.stringify(createdSchemaInput())).not.toContain('fingerprintSha256');
    await app.close();
  });
});
