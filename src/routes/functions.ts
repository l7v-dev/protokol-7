import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { FunctionService } from '../services/function-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const functionCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Fonksiyon adı zorunludur.'),
  type: z.string().optional(),
  content: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  valves: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
  is_global: z.boolean().optional()
});

const functionUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  content: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  valves: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional(),
  is_global: z.boolean().optional()
});

export function registerFunctionRoutes(app: FastifyInstance, functionService: FunctionService): void {
  // GET /functions/ or /functions/list
  const listFunctionsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';

    const functions = await functionService.listFunctions(tenantId);
    return reply.code(200).send(functions);
  };

  // POST /functions/create
  const createFunctionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = functionCreateSchema.safeParse(request.body || {});
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
      id?: string;
      name: string;
      type?: string;
      content?: string;
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      is_active?: boolean;
      is_global?: boolean;
    } = {
      name: parseResult.data.name
    };
    if (parseResult.data.id !== undefined) createDto.id = parseResult.data.id;
    if (parseResult.data.type !== undefined) createDto.type = parseResult.data.type;
    if (parseResult.data.content !== undefined) createDto.content = parseResult.data.content;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.valves !== undefined) createDto.valves = parseResult.data.valves;
    if (parseResult.data.is_active !== undefined) createDto.is_active = parseResult.data.is_active;
    if (parseResult.data.is_global !== undefined) createDto.is_global = parseResult.data.is_global;

    const created = await functionService.createFunction(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /functions/id/:id
  const getFunctionByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const func = await functionService.getFunctionById(tenantId, params.id);
    if (!func) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'FUNCTION_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Fonksiyon bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(func);
  };

  // POST /functions/id/:id/update
  const updateFunctionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const parseResult = functionUpdateSchema.safeParse(request.body || {});
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

    const updateDto: {
      name?: string;
      type?: string;
      content?: string;
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      is_active?: boolean;
      is_global?: boolean;
    } = {};
    if (parseResult.data.name !== undefined) updateDto.name = parseResult.data.name;
    if (parseResult.data.type !== undefined) updateDto.type = parseResult.data.type;
    if (parseResult.data.content !== undefined) updateDto.content = parseResult.data.content;
    if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
    if (parseResult.data.valves !== undefined) updateDto.valves = parseResult.data.valves;
    if (parseResult.data.is_active !== undefined) updateDto.is_active = parseResult.data.is_active;
    if (parseResult.data.is_global !== undefined) updateDto.is_global = parseResult.data.is_global;

    const updated = await functionService.updateFunction(tenantId, params.id, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'FUNCTION_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Fonksiyon bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // POST /functions/id/:id/toggle
  const toggleFunctionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const toggled = await functionService.toggleFunction(tenantId, params.id);
    return reply.code(200).send(toggled);
  };

  // POST /functions/id/:id/toggle/global
  const toggleGlobalHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const toggled = await functionService.toggleGlobal(tenantId, params.id);
    return reply.code(200).send(toggled);
  };

  // GET /functions/id/:id/valves
  const getValvesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const valves = await functionService.getValves(tenantId, params.id);
    return reply.code(200).send(valves);
  };

  // GET /functions/id/:id/valves/spec
  const getValvesSpecHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ properties: {}, required: [], type: 'object' });
  };

  // POST /functions/id/:id/valves/update
  const updateValvesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) || {};

    const updated = await functionService.updateValves(tenantId, params.id, body);
    return reply.code(200).send(updated);
  };

  // GET /functions/id/:id/valves/user
  const getUserValvesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const params = request.params as { id: string };

    const userValves = await functionService.getUserValves(userId, params.id);
    return reply.code(200).send(userValves);
  };

  // POST /functions/id/:id/valves/user/update
  const updateUserValvesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const params = request.params as { id: string };
    const body = (request.body as Record<string, unknown>) || {};

    const updated = await functionService.updateUserValves(userId, params.id, body);
    return reply.code(200).send(updated);
  };

  // DELETE /functions/id/:id or /functions/id/:id/delete
  const deleteFunctionHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await functionService.deleteFunction(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Fonksiyon silindi.' : 'Bulunamadı.' });
  };

  // Register routes
  app.get('/functions', listFunctionsHandler);
  app.get('/functions/', listFunctionsHandler);
  app.get('/functions/list', listFunctionsHandler);
  app.post('/functions/create', createFunctionHandler);
  app.get('/functions/export', async (_req, reply) => reply.code(200).send([]));
  app.post('/functions/load/url', async (_req, reply) => reply.code(200).send({ status: true }));
  app.get('/functions/id/:id', getFunctionByIdHandler);
  app.post('/functions/id/:id/update', updateFunctionHandler);
  app.post('/functions/id/:id/toggle', toggleFunctionHandler);
  app.post('/functions/id/:id/toggle/global', toggleGlobalHandler);
  app.get('/functions/id/:id/valves', getValvesHandler);
  app.get('/functions/id/:id/valves/spec', getValvesSpecHandler);
  app.post('/functions/id/:id/valves/update', updateValvesHandler);
  app.get('/functions/id/:id/valves/user', getUserValvesHandler);
  app.post('/functions/id/:id/valves/user/update', updateUserValvesHandler);
  app.delete('/functions/id/:id/delete', deleteFunctionHandler);
  app.delete('/functions/id/:id', deleteFunctionHandler);
}
