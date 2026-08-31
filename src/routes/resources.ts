import { randomUUID } from 'node:crypto';

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import type { ResourceService } from '../services/resource-service.js';
import { assertSafeOutboundUrl } from '../security/egress-policy.js';
import { parseSchemaDefinition, SchemaDefinitionError, serializeSchemaDefinition } from '../schema/definition.js';
import { validateNormalizedRecord } from '../schema/validator.js';
import { requireScope } from '../shared/authz.js';
import { ApiError } from '../shared/http.js';

const idSchema = z.string().trim().min(1).max(200);
const limitSchema = z.coerce.number().int().min(1).max(200).default(50);

const projectBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).nullable().optional(),
  defaultPolicy: z.record(z.unknown()).default({})
});

const targetBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  seedUrl: z.string().url(),
  allowedHosts: z.array(z.string().trim().min(1).max(253)).max(50).optional(),
  allowedPorts: z.array(z.number().int().min(1).max(65_535)).max(20).optional(),
  executionPolicy: z.record(z.unknown()).default({}),
  crawlPolicy: z.record(z.unknown()).default({}),
  accessPolicy: z.record(z.unknown()).default({})
});

const schemaBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  version: z.number().int().positive().default(1),
  fields: z.record(z.unknown()),
  additionalProperties: z.boolean().default(false)
}).strict();

const schemaPreviewBodySchema = z.object({
  record: z.record(z.unknown()).refine((record) => Object.keys(record).length <= 100),
  normalizedLineage: z.record(z.object({
    normalizedValue: z.string().max(10_000),
    redacted: z.boolean()
  }).strict()).optional()
}).strict();

function parseOrValidationError<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  throw new ApiError({
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    category: 'VALIDATION',
    message: 'İstek doğrulanamadı.',
    retryable: false,
    details: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || 'request',
      reason: issue.code
    }))
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === '23505';
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === '23503';
}

function notFound(message: string): ApiError {
  return new ApiError({
    statusCode: 404,
    code: 'RESOURCE_NOT_FOUND',
    category: 'VALIDATION',
    message,
    retryable: false
  });
}

function normalizeTargetUrl(seedUrl: string): { url: string; host: string; port: number } {
  const normalized = assertSafeOutboundUrl(seedUrl);

  return {
    url: normalized.url,
    host: normalized.hostname,
    port: normalized.port
  };
}

function parseSchemaDefinitionOrValidationError(value: unknown) {
  try {
    return parseSchemaDefinition(value);
  } catch (error) {
    if (error instanceof SchemaDefinitionError) {
      throw new ApiError({
        statusCode: 400,
        code: 'SCHEMA_DEFINITION_INVALID',
        category: 'VALIDATION',
        message: 'Schema definition contract geçersiz.',
        retryable: false
      });
    }
    throw error;
  }
}

function projectResponse(project: Awaited<ReturnType<ResourceService['getProject']>>) {
  if (!project) {
    return null;
  }

  return {
    type: 'project',
    id: project.id,
    attributes: {
      tenantId: project.tenantId,
      name: project.name,
      description: project.description,
      status: project.status,
      defaultPolicy: project.defaultPolicy,
      createdBy: project.createdBy,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    }
  };
}

function targetResponse(target: Awaited<ReturnType<ResourceService['getTarget']>>) {
  if (!target) {
    return null;
  }

  return {
    type: 'target',
    id: target.id,
    attributes: {
      tenantId: target.tenantId,
      projectId: target.projectId,
      name: target.name,
      seedUrl: target.seedUrl,
      host: target.host,
      allowedHosts: target.allowedHosts,
      allowedPorts: target.allowedPorts,
      executionPolicy: target.executionPolicy,
      crawlPolicy: target.crawlPolicy,
      accessPolicy: target.accessPolicy,
      status: target.status,
      createdAt: target.createdAt,
      updatedAt: target.updatedAt
    }
  };
}

function schemaResponse(schema: Awaited<ReturnType<ResourceService['getSchema']>>) {
  if (!schema) {
    return null;
  }

  return {
    type: 'schema',
    id: schema.id,
    attributes: {
      tenantId: schema.tenantId,
      projectId: schema.projectId,
      name: schema.name,
      version: schema.version,
      definition: schema.definition,
      status: schema.status,
      createdBy: schema.createdBy,
      createdAt: schema.createdAt
    }
  };
}

export function registerResourceRoutes(app: FastifyInstance, service: ResourceService): void {
  app.post('/projects', async (request, reply) => {
    const context = requireScope(request.authContext, 'project:write');
    const body = parseOrValidationError(projectBodySchema, request.body);

    try {
      const project = await service.createProject({
        id: `project_${randomUUID()}`,
        tenantId: context.tenantId,
        name: body.name,
        description: body.description ?? null,
        defaultPolicy: body.defaultPolicy ?? {},
        createdBy: context.actorId
      });

      return reply.code(201).send({
        data: projectResponse(project),
        meta: { requestId: request.id }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError({
          statusCode: 409,
          code: 'STATE_CONFLICT',
          category: 'DATA',
          message: 'Aynı isimde bir Project zaten mevcut.',
          retryable: false
        });
      }
      throw error;
    }
  });

  app.get('/projects', async (request, reply) => {
    const context = requireScope(request.authContext, 'project:read');
    const query = parseOrValidationError(z.object({ limit: limitSchema }), request.query);
    const projects = await service.listProjects(context.tenantId, query.limit ?? 50);

    return reply.send({
      data: projects.map((project) => projectResponse(project)),
      meta: { requestId: request.id, page: { limit: query.limit, nextCursor: null } }
    });
  });

  app.get('/projects/:projectId', async (request, reply) => {
    const context = requireScope(request.authContext, 'project:read');
    const params = parseOrValidationError(z.object({ projectId: idSchema }), request.params);
    const project = await service.getProject(context.tenantId, params.projectId);

    if (!project) {
      throw new ApiError({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Project bulunamadı.',
        retryable: false
      });
    }

    return reply.send({ data: projectResponse(project), meta: { requestId: request.id } });
  });

  app.post('/projects/:projectId/targets', async (request, reply) => {
    const context = requireScope(request.authContext, 'target:write');
    const params = parseOrValidationError(z.object({ projectId: idSchema }), request.params);
    const body = parseOrValidationError(targetBodySchema, request.body);
    const normalized = normalizeTargetUrl(body.seedUrl);
    const allowedHosts = (body.allowedHosts ?? [normalized.host]).map((host) => host.toLowerCase());
    const allowedPorts = body.allowedPorts ?? [normalized.port];

    if (!allowedHosts.includes(normalized.host) || !allowedPorts.includes(normalized.port)) {
      throw new ApiError({
        statusCode: 422,
        code: 'TARGET_NOT_ALLOWED',
        category: 'POLICY',
        message: 'Seed URL, host veya port allowlist ile uyuşmuyor.',
        retryable: false
      });
    }

    const project = await service.getProject(context.tenantId, params.projectId);
    if (!project) {
      throw notFound('Target oluşturulacak Project bulunamadı.');
    }

    try {
      const target = await service.createTarget({
        id: `target_${randomUUID()}`,
        tenantId: context.tenantId,
        projectId: params.projectId,
        name: body.name,
        seedUrl: normalized.url,
        host: normalized.host,
        allowedHosts,
        allowedPorts,
        executionPolicy: body.executionPolicy ?? {},
        crawlPolicy: body.crawlPolicy ?? {},
        accessPolicy: body.accessPolicy ?? {}
      });

      return reply.code(201).send({
        data: targetResponse(target),
        meta: { requestId: request.id }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError({
          statusCode: 409,
          code: 'STATE_CONFLICT',
          category: 'DATA',
          message: 'Aynı isimde bir Target zaten mevcut.',
          retryable: false
        });
      }
      if (isForeignKeyViolation(error)) {
        throw notFound('Target oluşturulacak Project bulunamadı.');
      }
      throw error;
    }
  });

  app.get('/projects/:projectId/targets', async (request, reply) => {
    const context = requireScope(request.authContext, 'target:read');
    const params = parseOrValidationError(z.object({ projectId: idSchema }), request.params);
    const query = parseOrValidationError(z.object({ limit: limitSchema }), request.query);
    const targets = await service.listTargets(context.tenantId, params.projectId, query.limit ?? 50);

    return reply.send({
      data: targets.map((target) => targetResponse(target)),
      meta: { requestId: request.id, page: { limit: query.limit, nextCursor: null } }
    });
  });

  app.get('/targets/:targetId', async (request, reply) => {
    const context = requireScope(request.authContext, 'target:read');
    const params = parseOrValidationError(z.object({ targetId: idSchema }), request.params);
    const target = await service.getTarget(context.tenantId, params.targetId);

    if (!target) {
      throw new ApiError({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Target bulunamadı.',
        retryable: false
      });
    }

    return reply.send({ data: targetResponse(target), meta: { requestId: request.id } });
  });

  app.post('/projects/:projectId/schemas', async (request, reply) => {
    const context = requireScope(request.authContext, 'schema:write');
    const params = parseOrValidationError(z.object({ projectId: idSchema }), request.params);
    const body = parseOrValidationError(schemaBodySchema, request.body);
    const definition = parseSchemaDefinitionOrValidationError({
      fields: body.fields,
      additionalProperties: body.additionalProperties
    });
    const project = await service.getProject(context.tenantId, params.projectId);
    if (!project) {
      throw notFound('Schema oluşturulacak Project bulunamadı.');
    }

    try {
      const schema = await service.createSchema({
        id: `schema_${randomUUID()}`,
        tenantId: context.tenantId,
        projectId: params.projectId,
        name: body.name,
        version: body.version ?? 1,
        definition: serializeSchemaDefinition(definition),
        createdBy: context.actorId
      });

      return reply.code(201).send({
        data: schemaResponse(schema),
        meta: { requestId: request.id }
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError({
          statusCode: 409,
          code: 'STATE_CONFLICT',
          category: 'DATA',
          message: 'Aynı isim ve version ile bir Schema zaten mevcut.',
          retryable: false
        });
      }
      if (isForeignKeyViolation(error)) {
        throw notFound('Schema oluşturulacak Project bulunamadı.');
      }
      throw error;
    }
  });

  app.get('/projects/:projectId/schemas', async (request, reply) => {
    const context = requireScope(request.authContext, 'schema:read');
    const params = parseOrValidationError(z.object({ projectId: idSchema }), request.params);
    const query = parseOrValidationError(z.object({ limit: limitSchema }), request.query);
    const schemas = await service.listSchemas(context.tenantId, params.projectId, query.limit ?? 50);

    return reply.send({
      data: schemas.map((schema) => schemaResponse(schema)),
      meta: { requestId: request.id, page: { limit: query.limit, nextCursor: null } }
    });
  });

  app.get('/schemas/:schemaId', async (request, reply) => {
    const context = requireScope(request.authContext, 'schema:read');
    const params = parseOrValidationError(z.object({ schemaId: idSchema }), request.params);
    const schema = await service.getSchema(context.tenantId, params.schemaId);

    if (!schema) {
      throw new ApiError({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Schema bulunamadı.',
        retryable: false
      });
    }

    return reply.send({ data: schemaResponse(schema), meta: { requestId: request.id } });
  });

  app.post('/schemas/:schemaId/validation-preview', async (request, reply) => {
    const context = requireScope(request.authContext, 'schema:write');
    const params = parseOrValidationError(z.object({ schemaId: idSchema }), request.params);
    const body = parseOrValidationError(schemaPreviewBodySchema, request.body);
    const schema = await service.getSchema(context.tenantId, params.schemaId);
    if (!schema) {
      throw notFound('Validation preview için Schema bulunamadı.');
    }
    const definition = parseSchemaDefinitionOrValidationError(schema.definition);
    const report = validateNormalizedRecord({
      schema: {
        tenantId: schema.tenantId,
        projectId: schema.projectId,
        schemaId: schema.id,
        name: schema.name,
        version: schema.version,
        definition
      },
      record: body.record,
      ...(body.normalizedLineage === undefined ? {} : { normalizedLineage: body.normalizedLineage })
    });
    return reply.send({
      data: {
        type: 'schema-validation-preview',
        id: `${schema.id}:${schema.version}`,
        attributes: report
      },
      meta: { requestId: request.id }
    });
  });

  app.post('/schemas/:schemaId/publish', async (request, reply) => {
    const context = requireScope(request.authContext, 'schema:publish');
    const params = parseOrValidationError(z.object({ schemaId: idSchema }), request.params);
    const schema = await service.publishSchema(context.tenantId, params.schemaId);

    if (!schema) {
      throw new ApiError({
        statusCode: 409,
        code: 'STATE_CONFLICT',
        category: 'DATA',
        message: 'Schema publish edilemedi; kaynak yok veya mevcut durum uygun değil.',
        retryable: false
      });
    }

    return reply.send({ data: schemaResponse(schema), meta: { requestId: request.id } });
  });
}
