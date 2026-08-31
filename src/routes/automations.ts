import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AutomationService } from '../services/automation-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const automationCreateSchema = z.object({
  name: z.string().min(1, 'Otomasyon adı zorunludur.'),
  folder_id: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional()
});

const automationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  folder_id: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional()
});

export function registerAutomationRoutes(app: FastifyInstance, automationService: AutomationService): void {
  // GET /automations/list or /automations
  const listAutomationsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const query = (request.query as {
      query?: string;
      status?: string;
      folder_id?: string;
      page?: string;
    }) || {};

    const page = query.page ? parseInt(query.page, 10) : 1;

    const filterInput: {
      query?: string | null;
      status?: string | null;
      folder_id?: string | null;
      page?: number;
    } = { page };
    if (query.query !== undefined) filterInput.query = query.query;
    if (query.status !== undefined) filterInput.status = query.status;
    if (query.folder_id !== undefined) filterInput.folder_id = query.folder_id;

    const result = await automationService.listAutomations(userId, tenantId, filterInput);

    return reply.code(200).send(result);
  };

  // POST /automations/create
  const createAutomationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = automationCreateSchema.safeParse(request.body || {});
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
      folder_id?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      is_active?: boolean;
    } = {
      name: parseResult.data.name
    };
    if (parseResult.data.folder_id !== undefined) createDto.folder_id = parseResult.data.folder_id;
    if (parseResult.data.data !== undefined) createDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.is_active !== undefined) createDto.is_active = parseResult.data.is_active;

    const created = await automationService.createAutomation(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /automations/:id
  const getAutomationByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const automation = await automationService.getAutomationById(tenantId, params.id);
    if (!automation) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'AUTOMATION_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Otomasyon bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(automation);
  };

  // POST /automations/:id/update
  const updateAutomationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const parseResult = automationUpdateSchema.safeParse(request.body || {});
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
      folder_id?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      is_active?: boolean;
    } = {};
    if (parseResult.data.name !== undefined) updateDto.name = parseResult.data.name;
    if (parseResult.data.folder_id !== undefined) updateDto.folder_id = parseResult.data.folder_id;
    if (parseResult.data.data !== undefined) updateDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
    if (parseResult.data.is_active !== undefined) updateDto.is_active = parseResult.data.is_active;

    const updated = await automationService.updateAutomation(tenantId, params.id, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'AUTOMATION_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Otomasyon bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // POST /automations/:id/toggle
  const toggleAutomationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const toggled = await automationService.toggleAutomation(tenantId, params.id);
    if (!toggled) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'AUTOMATION_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Otomasyon bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(toggled);
  };

  // POST /automations/:id/run
  const runAutomationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const result = await automationService.runAutomation(tenantId, params.id);
    return reply.code(200).send(result);
  };

  // GET /automations/:id/runs
  const getAutomationRunsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const query = (request.query as { limit?: string; skip?: string }) || {};
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const skip = query.skip ? parseInt(query.skip, 10) : 0;

    const runs = await automationService.getAutomationRuns(params.id, limit, skip);
    return reply.code(200).send(runs);
  };

  // DELETE /automations/:id/delete or /automations/:id
  const deleteAutomationHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await automationService.deleteAutomation(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Otomasyon silindi.' : 'Bulunamadı.' });
  };

  // Register routes
  app.get('/automations/list', listAutomationsHandler);
  app.get('/automations', listAutomationsHandler);
  app.get('/automations/', listAutomationsHandler);
  app.post('/automations/create', createAutomationHandler);
  app.get('/automations/:id', getAutomationByIdHandler);
  app.post('/automations/:id/update', updateAutomationHandler);
  app.post('/automations/:id/toggle', toggleAutomationHandler);
  app.post('/automations/:id/run', runAutomationHandler);
  app.get('/automations/:id/runs', getAutomationRunsHandler);
  app.delete('/automations/:id/delete', deleteAutomationHandler);
  app.delete('/automations/:id', deleteAutomationHandler);
}
