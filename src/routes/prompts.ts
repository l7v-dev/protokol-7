import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { PromptService } from '../services/prompt-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const promptFormSchema = z.object({
  command: z.string().min(1),
  name: z.string().min(1),
  content: z.string().min(1),
  meta: z.record(z.unknown()).optional(),
  data: z.record(z.unknown()).optional(),
  access_grants: z.array(z.unknown()).optional()
});

const promptUpdateSchema = z.object({
  command: z.string().optional(),
  name: z.string().optional(),
  content: z.string().optional(),
  meta: z.record(z.unknown()).optional(),
  data: z.record(z.unknown()).optional(),
  access_grants: z.array(z.unknown()).optional()
});

export function registerPromptRoutes(app: FastifyInstance, promptService: PromptService): void {
  // GET /prompts or /prompts/
  const listPromptsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';

    const prompts = await promptService.listPrompts(tenantId);
    return reply.code(200).send(prompts);
  };

  // POST /prompts/create
  const createPromptHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = promptFormSchema.safeParse(request.body || {});
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
      const createDto: { command: string; name: string; content: string; meta?: Record<string, unknown>; data?: Record<string, unknown>; access_grants?: unknown[] } = {
        command: parseResult.data.command,
        name: parseResult.data.name,
        content: parseResult.data.content
      };
      if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
      if (parseResult.data.data !== undefined) createDto.data = parseResult.data.data;
      if (parseResult.data.access_grants !== undefined) createDto.access_grants = parseResult.data.access_grants;

      const created = await promptService.createPrompt(userId, tenantId, createDto);
      return reply.code(200).send(created);
    } catch (error) {
      if (error instanceof ApiError) return sendApiError(request, reply, error);
      throw error;
    }
  };

  // GET /prompts/command/:command
  const getPromptByCommandHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { command: string };

    const prompt = await promptService.getPromptByCommand(tenantId, params.command);
    if (!prompt) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'PROMPT_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Prompt şablonu bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(prompt);
  };

  // POST /prompts/command/:command/update
  const updatePromptHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { command: string };

    const parseResult = promptUpdateSchema.safeParse(request.body || {});
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

    const updateDto: { command?: string; name?: string; content?: string; meta?: Record<string, unknown>; data?: Record<string, unknown>; access_grants?: unknown[] } = {};
    if (parseResult.data.command !== undefined) updateDto.command = parseResult.data.command;
    if (parseResult.data.name !== undefined) updateDto.name = parseResult.data.name;
    if (parseResult.data.content !== undefined) updateDto.content = parseResult.data.content;
    if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
    if (parseResult.data.data !== undefined) updateDto.data = parseResult.data.data;
    if (parseResult.data.access_grants !== undefined) updateDto.access_grants = parseResult.data.access_grants;

    const updated = await promptService.updatePrompt(tenantId, params.command, updateDto);
    if (!updated) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'PROMPT_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Güncellenecek prompt bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(updated);
  };

  // DELETE /prompts/command/:command/delete
  const deletePromptHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { command: string };

    const deleted = await promptService.deletePrompt(tenantId, params.command);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Prompt silindi.' : 'Prompt bulunamadı.' });
  };

  // GET /prompts/tags
  const getPromptTagsHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send([
      { name: 'scraping' },
      { name: 'ecommerce' },
      { name: 'crawler' },
      { name: 'schema' },
      { name: 'anti-bot' }
    ]);
  };

  // Register routes
  app.get('/prompts', listPromptsHandler);
  app.get('/prompts/', listPromptsHandler);
  app.get('/prompts/list', listPromptsHandler);
  app.get('/prompts/tags', getPromptTagsHandler);
  app.post('/prompts/create', createPromptHandler);
  app.get('/prompts/command/:command', getPromptByCommandHandler);
  app.post('/prompts/command/:command/update', updatePromptHandler);
  app.delete('/prompts/command/:command/delete', deletePromptHandler);
}
