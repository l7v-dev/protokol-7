import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { FolderService } from '../services/folder-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const folderCreateSchema = z.object({
  name: z.string().min(1, 'Klasör adı zorunludur.').optional(),
  parent_id: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  is_expanded: z.boolean().optional()
});

const folderUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  parent_id: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  is_expanded: z.boolean().optional()
});

export function registerFolderRoutes(app: FastifyInstance, folderService: FolderService): void {
  // GET /folders/
  const listFoldersHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const folders = await folderService.listFolders(userId, tenantId);
    return reply.code(200).send(folders);
  };

  // POST /folders/
  const createFolderHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = folderCreateSchema.safeParse(request.body || {});
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

    const createDto: { name?: string; parent_id?: string | null; data?: Record<string, unknown>; meta?: Record<string, unknown>; is_expanded?: boolean } = {};
    if (parseResult.data.name !== undefined) createDto.name = parseResult.data.name;
    if (parseResult.data.parent_id !== undefined) createDto.parent_id = parseResult.data.parent_id;
    if (parseResult.data.data !== undefined) createDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.is_expanded !== undefined) createDto.is_expanded = parseResult.data.is_expanded;

    const created = await folderService.createFolder(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /folders/:id
  const getFolderByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const folder = await folderService.getFolderById(tenantId, params.id);
    if (!folder) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'FOLDER_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Klasör bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(folder);
  };

  // POST /folders/:id/update
  const updateFolderHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const parseResult = folderUpdateSchema.safeParse(request.body || {});
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

    const updateDto: { name?: string; parent_id?: string | null; data?: Record<string, unknown>; meta?: Record<string, unknown>; is_expanded?: boolean } = {};
    if (parseResult.data.name !== undefined) updateDto.name = parseResult.data.name;
    if (parseResult.data.parent_id !== undefined) updateDto.parent_id = parseResult.data.parent_id;
    if (parseResult.data.data !== undefined) updateDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
    if (parseResult.data.is_expanded !== undefined) updateDto.is_expanded = parseResult.data.is_expanded;

    const updated = await folderService.updateFolder(tenantId, params.id, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'FOLDER_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Klasör bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // POST /folders/:id/update/expanded
  const updateFolderExpandedHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };
    const body = (request.body as { is_expanded?: boolean }) || {};

    const updated = await folderService.updateFolder(tenantId, params.id, {
      is_expanded: body.is_expanded ?? true
    });
    return reply.code(200).send(updated);
  };

  // POST /folders/:id/update/parent
  const updateFolderParentHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };
    const body = (request.body as { parent_id?: string | null }) || {};

    const updated = await folderService.updateFolder(tenantId, params.id, {
      parent_id: body.parent_id ?? null
    });
    return reply.code(200).send(updated);
  };

  // DELETE /folders/:id
  const deleteFolderHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await folderService.deleteFolder(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Klasör silindi.' : 'Klasör bulunamadı.' });
  };

  // GET /folders/shared
  const listSharedFoldersHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send([]);
  };

  // Register routes
  app.get('/folders', listFoldersHandler);
  app.get('/folders/', listFoldersHandler);
  app.get('/folders/shared', listSharedFoldersHandler);
  app.post('/folders', createFolderHandler);
  app.post('/folders/', createFolderHandler);
  app.get('/folders/:id', getFolderByIdHandler);
  app.post('/folders/:id/update', updateFolderHandler);
  app.post('/folders/:id/update/expanded', updateFolderExpandedHandler);
  app.post('/folders/:id/update/parent', updateFolderParentHandler);
  app.delete('/folders/:id', deleteFolderHandler);
}
