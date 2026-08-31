import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { KnowledgeService } from '../services/knowledge-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const knowledgeCreateSchema = z.object({
  name: z.string().min(1, 'Bilgi bankası adı zorunludur.'),
  description: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  access_grants: z.array(z.record(z.string(), z.unknown())).optional()
});

const knowledgeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  access_grants: z.array(z.record(z.string(), z.unknown())).optional()
});

export function registerKnowledgeRoutes(app: FastifyInstance, knowledgeService: KnowledgeService): void {
  // GET /knowledge/
  const listKnowledgeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';

    const items = await knowledgeService.listKnowledge(tenantId);
    return reply.code(200).send(items);
  };

  // POST /knowledge/create
  const createKnowledgeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = knowledgeCreateSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
          retryable: false
        })
      );
    }

    const createDto: { name: string; description?: string; data?: Record<string, unknown>; meta?: Record<string, unknown>; access_grants?: Array<Record<string, unknown>> } = {
      name: parseResult.data.name
    };
    if (parseResult.data.description !== undefined) createDto.description = parseResult.data.description;
    if (parseResult.data.data !== undefined) createDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.access_grants !== undefined) createDto.access_grants = parseResult.data.access_grants;

    const created = await knowledgeService.createKnowledge(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /knowledge/search
  const searchKnowledgeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const query = (request.query as { query?: string }) || {};

    const items = await knowledgeService.listKnowledge(tenantId);
    const q = query.query?.toLowerCase();
    const filtered = q
      ? items.filter((k) => k.name.toLowerCase().includes(q) || k.description.toLowerCase().includes(q))
      : items;

    return reply.code(200).send({ items: filtered, total: filtered.length });
  };

  // GET /knowledge/search/files
  const searchKnowledgeFilesHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ files: [], total: 0 });
  };

  // GET /knowledge/:id
  const getKnowledgeByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const kb = await knowledgeService.getKnowledgeById(tenantId, params.id);
    if (!kb) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'KNOWLEDGE_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Bilgi bankası bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(kb);
  };

  // POST /knowledge/:id/update
  const updateKnowledgeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const parseResult = knowledgeUpdateSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
          retryable: false
        })
      );
    }

    const updateDto: { name?: string; description?: string; data?: Record<string, unknown>; meta?: Record<string, unknown>; access_grants?: Array<Record<string, unknown>> } = {};
    if (parseResult.data.name !== undefined) updateDto.name = parseResult.data.name;
    if (parseResult.data.description !== undefined) updateDto.description = parseResult.data.description;
    if (parseResult.data.data !== undefined) updateDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
    if (parseResult.data.access_grants !== undefined) updateDto.access_grants = parseResult.data.access_grants;

    const updated = await knowledgeService.updateKnowledge(tenantId, params.id, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'KNOWLEDGE_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Bilgi bankası bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // DELETE /knowledge/:id
  const deleteKnowledgeHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await knowledgeService.deleteKnowledge(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Bilgi bankası silindi.' : 'Bulunamadı.' });
  };

  // External connections endpoints
  app.get('/knowledge/external/connections', async (_req, reply) => reply.code(200).send([]));
  app.post('/knowledge/external/connections', async (_req, reply) => reply.code(200).send({ status: true }));
  app.post('/knowledge/external/connections/:id/test', async (_req, reply) => reply.code(200).send({ status: true }));

  // Register routes
  app.get('/knowledge', listKnowledgeHandler);
  app.get('/knowledge/', listKnowledgeHandler);
  app.post('/knowledge/create', createKnowledgeHandler);
  app.get('/knowledge/search', searchKnowledgeHandler);
  app.get('/knowledge/search/files', searchKnowledgeFilesHandler);
  app.get('/knowledge/:id', getKnowledgeByIdHandler);
  app.post('/knowledge/:id/update', updateKnowledgeHandler);
  app.delete('/knowledge/:id', deleteKnowledgeHandler);
}
