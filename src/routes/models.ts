import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { ModelService, CreateModelDto, UpdateModelDto } from '../services/model-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const createModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  base_model_id: z.string().nullable().optional(),
  meta: z.record(z.unknown()).optional(),
  params: z.record(z.unknown()).optional(),
  access_control: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional()
});

const updateModelSchema = z.object({
  name: z.string().min(1).optional(),
  base_model_id: z.string().nullable().optional(),
  meta: z.record(z.unknown()).optional(),
  params: z.record(z.unknown()).optional(),
  access_control: z.record(z.unknown()).optional(),
  is_active: z.boolean().optional()
});

export function registerModelRoutes(app: FastifyInstance, modelService: ModelService): void {
  // GET /models or /api/v1/models or /api/models
  const listModelsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const query = request.query as { query?: string; search?: string; tag?: string };
    const search = query.query || query.search;

    const searchOptions: { search?: string; tag?: string } = {};
    if (search !== undefined) searchOptions.search = search;
    if (query.tag !== undefined) searchOptions.tag = query.tag;

    const models = await modelService.getAllModels(tenantId, searchOptions);
    return reply.code(200).send({ data: models });
  };

  // GET /models/base
  const getBaseModelsHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    const models = await modelService.getBaseModels();
    return reply.code(200).send(models);
  };

  // GET /models/tags
  const getModelTagsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const tags = await modelService.getModelTags(tenantId);
    return reply.code(200).send(tags);
  };

  // GET /models/list
  const getModelItemsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const query = request.query as { query?: string; tag?: string };

    const searchOptions: { search?: string; tag?: string } = {};
    if (query.query !== undefined) searchOptions.search = query.query;
    if (query.tag !== undefined) searchOptions.tag = query.tag;

    const models = await modelService.getAllModels(tenantId, searchOptions);
    return reply.code(200).send(models);
  };

  // POST /models/create
  const createModelHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const userId = request.authContext?.actorId || null;

    const parseResult = createModelSchema.safeParse(request.body);
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
      const createDto: CreateModelDto = {
        id: parseResult.data.id,
        name: parseResult.data.name
      };
      if (parseResult.data.base_model_id !== undefined) createDto.base_model_id = parseResult.data.base_model_id;
      if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
      if (parseResult.data.params !== undefined) createDto.params = parseResult.data.params;
      if (parseResult.data.access_control !== undefined) createDto.access_control = parseResult.data.access_control;
      if (parseResult.data.is_active !== undefined) createDto.is_active = parseResult.data.is_active;

      const created = await modelService.createModel(tenantId, userId, createDto);
      return reply.code(200).send(created);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // GET /models/model?id=...
  const getModelByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const query = request.query as { id?: string };
    const params = request.params as { id?: string };
    const modelId = query.id || params.id;

    if (!modelId) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: 'Model kimliği belirtilmelidir.',
          retryable: false
        })
      );
    }

    const model = await modelService.getModelById(tenantId, modelId);
    if (!model) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'MODEL_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Model bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(model);
  };

  // POST /models/model/update?id=...
  const updateModelHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const query = request.query as { id?: string };
    const params = request.params as { id?: string };
    const modelId = query.id || params.id;

    if (!modelId) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: 'Güncellenecek model kimliği belirtilmelidir.',
          retryable: false
        })
      );
    }

    const parseResult = updateModelSchema.safeParse(request.body);
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
      const updateDto: UpdateModelDto = {};
      if (parseResult.data.name !== undefined) updateDto.name = parseResult.data.name;
      if (parseResult.data.base_model_id !== undefined) updateDto.base_model_id = parseResult.data.base_model_id;
      if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
      if (parseResult.data.params !== undefined) updateDto.params = parseResult.data.params;
      if (parseResult.data.access_control !== undefined) updateDto.access_control = parseResult.data.access_control;
      if (parseResult.data.is_active !== undefined) updateDto.is_active = parseResult.data.is_active;

      const updated = await modelService.updateModel(tenantId, modelId, updateDto);
      return reply.code(200).send(updated);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // DELETE /models/model/delete?id=...
  const deleteModelHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const query = request.query as { id?: string };
    const params = request.params as { id?: string };
    const modelId = query.id || params.id;

    if (!modelId) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: 'Silinecek model kimliği belirtilmelidir.',
          retryable: false
        })
      );
    }

    try {
      await modelService.deleteModel(tenantId, modelId);
      return reply.code(200).send({ status: true, message: 'Model başarıyla silindi.' });
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // POST /models/import
  const importModelsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.authContext?.tenantId || 'tenant_default';
    const userId = request.authContext?.actorId || null;
    const body = request.body as { models?: CreateModelDto[] };
    const models = body.models || [];

    const imported = [];
    for (const m of models) {
      if (m.id && m.name) {
        const item = await modelService.createModel(tenantId, userId, m);
        imported.push(item);
      }
    }

    return reply.code(200).send({ status: true, count: imported.length });
  };

  // GET /models/model/profile/image?id=...
  const getModelProfileImageHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query as { id?: string }) || {};
    const modelId = query.id || 'default';
    
    let bgStart = '#0284c7';
    let bgEnd = '#0369a1';
    let label = 'AI';

    if (modelId.includes('extractor') || modelId.includes('protokol7')) {
      bgStart = '#6366f1';
      bgEnd = '#4338ca';
      label = 'P7';
    } else if (modelId.includes('gpt') || modelId.includes('openai') || modelId.includes('o1') || modelId.includes('o3')) {
      bgStart = '#10a37f';
      bgEnd = '#0d8063';
      label = 'GPT';
    } else if (modelId.includes('claude') || modelId.includes('anthropic')) {
      bgStart = '#d97706';
      bgEnd = '#b45309';
      label = 'CL';
    } else if (modelId.includes('gemini') || modelId.includes('google')) {
      bgStart = '#3b82f6';
      bgEnd = '#1d4ed8';
      label = 'GEM';
    } else if (modelId.includes('deepseek')) {
      bgStart = '#0ea5e9';
      bgEnd = '#0284c7';
      label = 'DS';
    } else if (modelId.includes('llama') || modelId.includes('meta')) {
      bgStart = '#8b5cf6';
      bgEnd = '#6d28d9';
      label = 'LL';
    } else if (modelId.includes('qwen') || modelId.includes('alibaba')) {
      bgStart = '#f97316';
      bgEnd = '#ea580c';
      label = 'QW';
    } else if (modelId.includes('mistral')) {
      bgStart = '#ef4444';
      bgEnd = '#b91c1c';
      label = 'MIS';
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${bgStart};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${bgEnd};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="24" fill="url(#grad)" />
  <text x="50" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${label}</text>
</svg>`;

    return reply
      .header('Content-Type', 'image/svg+xml')
      .header('Cache-Control', 'public, max-age=86400')
      .code(200)
      .send(svg);
  };

  // Register routes with standard prefix
  app.get('/models', listModelsHandler);
  app.get('/models/base', getBaseModelsHandler);
  app.get('/models/tags', getModelTagsHandler);
  app.get('/models/base/tags', getModelTagsHandler);
  app.get('/models/list', getModelItemsHandler);
  app.post('/models/create', createModelHandler);
  app.get('/models/model', getModelByIdHandler);
  app.get('/models/model/profile/image', getModelProfileImageHandler);
  app.post('/models/model/update', updateModelHandler);
  app.delete('/models/model/delete', deleteModelHandler);
  app.post('/models/model/delete', deleteModelHandler);
  app.post('/models/import', importModelsHandler);
}
