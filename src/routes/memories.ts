import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { MemoryService } from '../services/memory-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const memoryAddSchema = z.object({
  content: z.string().min(1, 'Hafıza içeriği zorunludur.'),
  type: z.string().optional(),
  path: z.string().optional()
});

const memoryUpdateSchema = z.object({
  content: z.string().min(1, 'Hafıza içeriği zorunludur.'),
  type: z.string().optional(),
  path: z.string().optional()
});

const memoryQuerySchema = z.object({
  content: z.string().optional()
});

export function registerMemoryRoutes(app: FastifyInstance, memoryService: MemoryService): void {
  // GET /memories/
  const listMemoriesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const list = await memoryService.listMemories(userId, tenantId);
    return reply.code(200).send(list);
  };

  // POST /memories/add
  const addMemoryHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = memoryAddSchema.safeParse(request.body || {});
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

    const createDto: { content: string; type?: string; path?: string } = {
      content: parseResult.data.content
    };
    if (parseResult.data.type !== undefined) createDto.type = parseResult.data.type;
    if (parseResult.data.path !== undefined) createDto.path = parseResult.data.path;

    const created = await memoryService.addMemory(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // POST /memories/query
  const queryMemoryHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = memoryQuerySchema.safeParse(request.body || {});
    const query = parseResult.success ? parseResult.data.content || '' : '';

    const results = await memoryService.queryMemories(userId, tenantId, query);
    return reply.code(200).send(results);
  };

  // POST /memories/:id/update
  const updateMemoryHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const parseResult = memoryUpdateSchema.safeParse(request.body || {});
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

    const updateDto: { content?: string; type?: string; path?: string } = {};
    if (parseResult.data.content !== undefined) updateDto.content = parseResult.data.content;
    if (parseResult.data.type !== undefined) updateDto.type = parseResult.data.type;
    if (parseResult.data.path !== undefined) updateDto.path = parseResult.data.path;

    const updated = await memoryService.updateMemory(tenantId, params.id, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'MEMORY_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Hafıza kaydı bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // POST /memories/reindex
  const reindexMemoryHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ status: true, message: 'Hafıza indeksleri güncellendi.' });
  };

  // POST /memories/reset or DELETE /memories/delete/user
  const deleteUserMemoriesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    await memoryService.deleteMemoriesByUser(userId, tenantId);
    return reply.code(200).send({ status: true, message: 'Tüm hafıza kayıtları temizlendi.' });
  };

  // DELETE /memories/:id
  const deleteMemoryByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await memoryService.deleteMemory(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Hafıza kaydı silindi.' : 'Bulunamadı.' });
  };

  // Register routes
  app.get('/memories', listMemoriesHandler);
  app.get('/memories/', listMemoriesHandler);
  app.post('/memories/add', addMemoryHandler);
  app.post('/memories/query', queryMemoryHandler);
  app.post('/memories/reindex', reindexMemoryHandler);
  app.post('/memories/reset', deleteUserMemoriesHandler);
  app.post('/memories/:id/update', updateMemoryHandler);
  app.delete('/memories/delete/user', deleteUserMemoriesHandler);
  app.delete('/memories/user', deleteUserMemoriesHandler);
  app.delete('/memories/:id', deleteMemoryByIdHandler);
}
