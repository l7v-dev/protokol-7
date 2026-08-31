import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { GroupService } from '../services/group-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const groupCreateSchema = z.object({
  name: z.string().min(1, 'Grup adı zorunludur.'),
  description: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  permissions: z.record(z.string(), z.unknown()).optional(),
  user_ids: z.array(z.string()).optional()
});

export function registerGroupRoutes(app: FastifyInstance, groupService: GroupService): void {
  // GET /groups/ or /groups
  const listGroupsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';

    const groups = await groupService.listGroups(tenantId);
    return reply.code(200).send(groups);
  };

  // POST /groups/create
  const createGroupHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = groupCreateSchema.safeParse(request.body || {});
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

    const createDto: {
      name: string;
      description?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      permissions?: Record<string, unknown>;
      user_ids?: string[];
    } = {
      name: parseResult.data.name
    };
    if (parseResult.data.description !== undefined) createDto.description = parseResult.data.description;
    if (parseResult.data.data !== undefined) createDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.permissions !== undefined) createDto.permissions = parseResult.data.permissions;
    if (parseResult.data.user_ids !== undefined) createDto.user_ids = parseResult.data.user_ids;

    const created = await groupService.createGroup(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /groups/id/:id
  const getGroupByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const group = await groupService.getGroupById(tenantId, params.id);
    if (!group) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'GROUP_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Grup bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(group);
  };

  // DELETE /groups/id/:id
  const deleteGroupHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await groupService.deleteGroup(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Grup silindi.' : 'Bulunamadı.' });
  };

  // Register routes
  app.get('/groups', listGroupsHandler);
  app.get('/groups/', listGroupsHandler);
  app.post('/groups/create', createGroupHandler);
  app.get('/groups/id/:id', getGroupByIdHandler);
  app.delete('/groups/id/:id', deleteGroupHandler);
  app.delete('/groups/id/:id/delete', deleteGroupHandler);
}
