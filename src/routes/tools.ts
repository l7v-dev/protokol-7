import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { ToolService } from '../services/tool-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const toolFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  content: z.string().optional(),
  specs: z.array(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
  valves: z.record(z.unknown()).optional(),
  access_grants: z.array(z.unknown()).optional()
});

const toolUpdateSchema = z.object({
  name: z.string().optional(),
  content: z.string().optional(),
  specs: z.array(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
  valves: z.record(z.unknown()).optional(),
  access_grants: z.array(z.unknown()).optional()
});

export function registerToolRoutes(app: FastifyInstance, toolService: ToolService): void {
  // GET /tools or /tools/
  const listToolsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';

    const tools = await toolService.listTools(tenantId);
    return reply.code(200).send(tools);
  };

  // POST /tools/create
  const createToolHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = toolFormSchema.safeParse(request.body || {});
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

    try {
      const createDto: { id?: string; name: string; content?: string; specs?: unknown[]; meta?: Record<string, unknown>; valves?: Record<string, unknown>; access_grants?: unknown[] } = {
        name: parseResult.data.name
      };
      if (parseResult.data.id !== undefined) createDto.id = parseResult.data.id;
      if (parseResult.data.content !== undefined) createDto.content = parseResult.data.content;
      if (parseResult.data.specs !== undefined) createDto.specs = parseResult.data.specs;
      if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
      if (parseResult.data.valves !== undefined) createDto.valves = parseResult.data.valves;
      if (parseResult.data.access_grants !== undefined) createDto.access_grants = parseResult.data.access_grants;

      const created = await toolService.createTool(userId, tenantId, createDto);
      return reply.code(200).send(created);
    } catch (error) {
      if (error instanceof ApiError) return sendApiError(request, reply, error);
      throw error;
    }
  };

  // GET /tools/id/:id
  const getToolByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const tool = await toolService.getToolById(tenantId, params.id);
    if (!tool) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'TOOL_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Araç bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(tool);
  };

  // POST /tools/id/:id/update
  const updateToolHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const parseResult = toolUpdateSchema.safeParse(request.body || {});
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

    const updateDto: { name?: string; content?: string; specs?: unknown[]; meta?: Record<string, unknown>; valves?: Record<string, unknown>; access_grants?: unknown[] } = {};
    if (parseResult.data.name !== undefined) updateDto.name = parseResult.data.name;
    if (parseResult.data.content !== undefined) updateDto.content = parseResult.data.content;
    if (parseResult.data.specs !== undefined) updateDto.specs = parseResult.data.specs;
    if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
    if (parseResult.data.valves !== undefined) updateDto.valves = parseResult.data.valves;
    if (parseResult.data.access_grants !== undefined) updateDto.access_grants = parseResult.data.access_grants;

    const updated = await toolService.updateTool(tenantId, params.id, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'TOOL_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Güncellenecek araç bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // DELETE /tools/id/:id/delete
  const deleteToolHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await toolService.deleteTool(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Araç silindi.' : 'Araç bulunamadı.' });
  };

  // POST /tools/load/url
  const loadToolByUrlHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { url?: string };
    if (!body?.url) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: 'URL adresi gereklidir.',
          retryable: false
        })
      );
    }

    // Return mockup response for remote tool import
    return reply.code(200).send({
      name: 'remote_tool',
      content: `# Remote tool loaded from ${body.url}`,
      specs: []
    });
  };

  // Register routes
  app.get('/tools', listToolsHandler);
  app.get('/tools/', listToolsHandler);
  app.get('/tools/list', listToolsHandler);
  app.post('/tools/create', createToolHandler);
  app.get('/tools/id/:id', getToolByIdHandler);
  app.post('/tools/id/:id/update', updateToolHandler);
  app.delete('/tools/id/:id/delete', deleteToolHandler);
  app.post('/tools/load/url', loadToolByUrlHandler);
}
