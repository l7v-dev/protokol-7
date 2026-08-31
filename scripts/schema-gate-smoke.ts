import Fastify from 'fastify';

import { registerResourceRoutes } from '../src/routes/resources.js';
import { parseSchemaDefinition, serializeSchemaDefinition } from '../src/schema/definition.js';
import { evaluateSchemaPublishPolicy } from '../src/schema/publish-policy.js';
import { buildSchemaQualityReport } from '../src/schema/quality.js';
import { validateNormalizedRecord } from '../src/schema/validator.js';
import { SchemaVersionError, SchemaVersionRegistry } from '../src/schema/versioning.js';
import { ApiError, sendApiError } from '../src/shared/http.js';
import type { SchemaRecord } from '../src/database/repositories/schema-repository.js';
import type { ResourceService } from '../src/services/resource-service.js';

const createdAt = new Date('2026-08-27T00:00:00.000Z');
const checks: string[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function definition(): Record<string, unknown> {
  return {
    additionalProperties: false,
    fields: {
      product_name: { type: 'string', required: true, minLength: 3 },
      price: { type: 'number', required: true, minimum: 0 },
      brand: { type: 'string', required: false }
    }
  };
}

function createSchemaRecord(): SchemaRecord {
  return {
    id: 'schema_product',
    tenantId: 'tenant_1',
    projectId: 'project_1',
    name: 'product',
    version: 1,
    definition: definition(),
    status: 'DRAFT',
    createdBy: 'user_1',
    createdAt
  };
}

async function previewRoute(): Promise<void> {
  const app = Fastify();
  const schema = createSchemaRecord();
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
    getSchema: async (tenantId: string, schemaId: string) => tenantId === 'tenant_1' && schemaId === 'schema_product' ? schema : null
  } as unknown as ResourceService;
  registerResourceRoutes(app, service);
  const response = await app.inject({
    method: 'POST',
    url: '/schemas/schema_product/validation-preview',
    payload: { record: { product_name: 'A', price: -1, unknown: 'private-test-value' } }
  });
  const body = response.json() as { data?: { attributes?: { valid?: boolean; unknownFieldCount?: number } } };
  assert(response.statusCode === 200, 'Validation preview başarıyla dönmeli.');
  assert(body.data?.attributes?.valid === false && body.data.attributes.unknownFieldCount === 1, 'Preview invalid record ve unknown count döndürmeli.');
  assert(!response.body.includes('private-test-value') && !response.body.includes('"unknown"'), 'Preview raw value veya unknown field adı sızdırmamalı.');
  await app.close();
}

async function main(): Promise<void> {
  const parsed = parseSchemaDefinition(definition());
  const persisted = serializeSchemaDefinition(parsed);
  assert(parsed.fields.length === 3 && !JSON.stringify(persisted).includes('fingerprintSha256'), 'Schema contract canonical persistence data üretmeli.');
  checks.push('schema-definition-canonicalization');

  const registry = new SchemaVersionRegistry(() => createdAt);
  const first = registry.register({
    tenantId: 'tenant_1', projectId: 'project_1', schemaId: 'schema_product', name: 'product', definition: definition(), createdBy: 'user_1', createdAt
  });
  registry.publish({ tenantId: 'tenant_1', projectId: 'project_1', name: 'product', version: first.version });
  const second = registry.register({
    tenantId: 'tenant_1', projectId: 'project_1', schemaId: 'schema_product', name: 'product', createdBy: 'user_1', createdAt,
    definition: { ...definition(), fields: { ...(definition().fields as Record<string, unknown>), category: { type: 'string', required: false, maxLength: 100 } } }
  });
  assert(second.compatibilityWithPrevious?.backwardCompatible === true, 'Optional field compatibility korunmalı.');
  try {
    registry.register({
      tenantId: 'tenant_1', projectId: 'project_1', schemaId: 'schema_product', name: 'product', createdBy: 'user_1', createdAt,
      definition: { ...definition(), fields: { ...(definition().fields as Record<string, unknown>), price: { type: 'string', required: true } } }
    });
    throw new Error('Breaking schema default policy ile kabul edilmemeli.');
  } catch (error) {
    if (!(error instanceof SchemaVersionError) || error.code !== 'SCHEMA_VERSION_COMPATIBILITY_VIOLATION') throw error;
  }
  const binding = registry.bindJob({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', name: 'product', version: 1 });
  assert(binding.schemaFingerprintSha256 === first.definition.fingerprintSha256, 'Job v1 schema snapshot fingerprint ile bağlanmalı.');
  checks.push('versioning-and-compatibility');

  const validation = validateNormalizedRecord({
    schema: first,
    record: { product_name: 'Acme Widget', price: -3, unexpected: 'private-test-value' }
  });
  assert(!validation.valid && validation.unknownFieldCount === 1, 'Validator required/unknown constraints uygulamalı.');
  assert(!JSON.stringify(validation).includes('private-test-value') && !JSON.stringify(validation).includes('unexpected'), 'Validator value veya unknown key sızdırmamalı.');
  checks.push('validation-no-value-leak');

  const quality = buildSchemaQualityReport({ validation });
  const decision = evaluateSchemaPublishPolicy([quality], {
    minimumQualityScorePercent: 80,
    minimumValidRecords: 1,
    maxInvalidRatioPercent: 0,
    allowPartialResults: false
  });
  assert(decision.status === 'PUBLISH_BLOCKED' && decision.reasons.includes('MINIMUM_VALID_RECORDS_NOT_MET'), 'Invalid quality report publish kararını blocklamalı.');
  assert(!JSON.stringify(decision).includes('private-test-value'), 'Publish decision record value sızdırmamalı.');
  checks.push('quality-and-publish-policy');

  await previewRoute();
  checks.push('validation-preview-route');
  console.log(JSON.stringify({ result: 'PASS', checks, schemaFingerprintSha256: parsed.fingerprintSha256 }));
}

void main();
