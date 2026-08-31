import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { ChatService, CreateChatDto, UpdateChatDto } from '../services/chat-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const createChatSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  chat: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
  pinned: z.boolean().optional()
});

const updateChatSchema = z.object({
  title: z.string().optional(),
  chat: z.record(z.unknown()).optional(),
  meta: z.record(z.unknown()).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional()
});

export function registerChatRoutes(app: FastifyInstance, chatService: ChatService): void {
  // GET /chats or /api/v1/chats
  const listChatsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const query = request.query as { search?: string; page?: string; limit?: string; pinned?: string };
    const search = query.search;
    const page = query.page ? Number.parseInt(query.page, 10) : undefined;
    const limit = query.limit ? Number.parseInt(query.limit, 10) : undefined;
    const isPinned = query.pinned !== undefined ? query.pinned === 'true' : undefined;

    const listOptions: { search?: string; page?: number; limit?: number; isPinned?: boolean } = {};
    if (search !== undefined) listOptions.search = search;
    if (page !== undefined) listOptions.page = page;
    if (limit !== undefined) listOptions.limit = limit;
    if (isPinned !== undefined) listOptions.isPinned = isPinned;

    const chats = await chatService.listChats(userId, tenantId, listOptions);
    return reply.code(200).send(chats);
  };

  // POST /chats/new or /chats
  const createChatHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = createChatSchema.safeParse(request.body || {});
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
      const createDto: CreateChatDto = {};
      if (parseResult.data.id !== undefined) createDto.id = parseResult.data.id;
      if (parseResult.data.title !== undefined) createDto.title = parseResult.data.title;
      if (parseResult.data.chat !== undefined) createDto.chat = parseResult.data.chat;
      if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
      if (parseResult.data.pinned !== undefined) createDto.pinned = parseResult.data.pinned;

      const created = await chatService.createChat(userId, tenantId, createDto);
      return reply.code(200).send(created);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // GET /chats/:id
  const getChatByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const params = request.params as { id: string };
    const chat = await chatService.getChatById(userId, tenantId, params.id);

    if (!chat) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'CHAT_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Sohbet bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(chat);
  };

  // POST /chats/:id
  const updateChatHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const params = request.params as { id: string };
    const parseResult = updateChatSchema.safeParse(request.body || {});
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
      const updateDto: UpdateChatDto = {};
      if (parseResult.data.title !== undefined) updateDto.title = parseResult.data.title;
      if (parseResult.data.chat !== undefined) updateDto.chat = parseResult.data.chat;
      if (parseResult.data.meta !== undefined) updateDto.meta = parseResult.data.meta;
      if (parseResult.data.pinned !== undefined) updateDto.pinned = parseResult.data.pinned;
      if (parseResult.data.archived !== undefined) updateDto.archived = parseResult.data.archived;

      const updated = await chatService.updateChat(userId, tenantId, params.id, updateDto);
      return reply.code(200).send(updated);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // DELETE /chats/:id
  const deleteChatHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const params = request.params as { id: string };
    const deleted = await chatService.deleteChat(userId, tenantId, params.id);

    return reply.code(200).send({ status: deleted, message: deleted ? 'Sohbet silindi.' : 'Sohbet bulunamadı.' });
  };

  // POST /chats/:id/pinned
  const togglePinnedHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const params = request.params as { id: string };
    const body = request.body as { pinned?: boolean } | undefined;
    const isPinned = body?.pinned !== undefined ? body.pinned : true;

    try {
      const updated = await chatService.setChatPinned(userId, tenantId, params.id, isPinned);
      return reply.code(200).send(updated);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // POST /chats/:id/clone
  const cloneChatHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const params = request.params as { id: string };
    try {
      const cloned = await chatService.cloneChat(userId, tenantId, params.id);
      return reply.code(200).send(cloned);
    } catch (error) {
      if (error instanceof ApiError) {
        return sendApiError(request, reply, error);
      }
      throw error;
    }
  };

  // GET /chats/pinned
  const listPinnedChatsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const pinnedChats = await chatService.listChats(userId, tenantId, { isPinned: true });
    return reply.code(200).send(pinnedChats);
  };

  // GET /chats/all/tags or /chats/tags
  const listChatTagsHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send([]);
  };

  // Register routes
  app.get('/chats', listChatsHandler);
  app.get('/chats/', listChatsHandler);
  app.get('/chats/all', listChatsHandler);
  app.get('/chats/pinned', listPinnedChatsHandler);
  app.get('/chats/all/tags', listChatTagsHandler);
  app.get('/chats/tags', listChatTagsHandler);
  app.post('/chats', createChatHandler);
  app.post('/chats/new', createChatHandler);
  app.get('/chats/:id', getChatByIdHandler);
  app.post('/chats/:id', updateChatHandler);
  app.delete('/chats/:id', deleteChatHandler);
  app.post('/chats/:id/pinned', togglePinnedHandler);
  app.post('/chats/:id/clone', cloneChatHandler);
}
