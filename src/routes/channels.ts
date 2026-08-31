import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { ChannelService } from '../services/channel-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const channelCreateSchema = z.object({
  name: z.string().min(1, 'Kanal adı zorunludur.'),
  type: z.string().optional(),
  is_private: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  access_grants: z.array(z.record(z.string(), z.unknown())).optional()
});

const messagePostSchema = z.object({
  content: z.string().min(1, 'Mesaj içeriği zorunludur.'),
  data: z.record(z.string(), z.unknown()).optional()
});

export function registerChannelRoutes(app: FastifyInstance, channelService: ChannelService): void {
  // GET /channels/ or /channels
  const listChannelsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';

    const channels = await channelService.listChannels(tenantId);
    return reply.code(200).send(channels);
  };

  // POST /channels/create
  const createChannelHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = channelCreateSchema.safeParse(request.body || {});
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
      type?: string;
      is_private?: boolean;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    } = {
      name: parseResult.data.name
    };
    if (parseResult.data.type !== undefined) createDto.type = parseResult.data.type;
    if (parseResult.data.is_private !== undefined) createDto.is_private = parseResult.data.is_private;
    if (parseResult.data.data !== undefined) createDto.data = parseResult.data.data;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.access_grants !== undefined) createDto.access_grants = parseResult.data.access_grants;

    const created = await channelService.createChannel(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /channels/:id
  const getChannelByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const channel = await channelService.getChannelById(tenantId, params.id);
    if (!channel) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'CHANNEL_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Kanal bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(channel);
  };

  // POST /channels/:id/messages/post
  const postMessageHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const params = request.params as { id: string };

    const parseResult = messagePostSchema.safeParse(request.body || {});
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

    const posted = await channelService.postMessage(
      params.id,
      userId,
      parseResult.data.content,
      parseResult.data.data || {}
    );
    return reply.code(200).send(posted);
  };

  // GET /channels/:id/messages
  const getMessagesHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { id: string };
    const query = (request.query as { limit?: string }) || {};
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    const messages = await channelService.getMessages(params.id, limit);
    return reply.code(200).send(messages);
  };

  // DELETE /channels/:id
  const deleteChannelHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await channelService.deleteChannel(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Kanal silindi.' : 'Bulunamadı.' });
  };

  // Register routes
  app.get('/channels', listChannelsHandler);
  app.get('/channels/', listChannelsHandler);
  app.post('/channels/create', createChannelHandler);
  app.get('/channels/:id', getChannelByIdHandler);
  app.post('/channels/:id/messages/post', postMessageHandler);
  app.post('/channels/:id/messages', postMessageHandler);
  app.get('/channels/:id/messages', getMessagesHandler);
  app.delete('/channels/:id', deleteChannelHandler);
}
