import { ApiError } from '../shared/http.js';
import type { ChatRepository, ChatRecord, ChatMessageRecord } from '../database/repositories/chat-repository.js';
import type { AgentOrchestrator, ChatMessage } from '../agent/orchestrator.js';

export type ChatSummaryDto = {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  pinned?: boolean;
  archived?: boolean;
  chat?: Record<string, unknown>;
};

export type ChatDetailDto = {
  id: string;
  user_id: string;
  title: string;
  chat: Record<string, unknown>;
  meta: Record<string, unknown>;
  pinned: boolean;
  archived: boolean;
  created_at: number;
  updated_at: number;
  messages?: ChatMessageRecord[];
};

export type CreateChatDto = {
  id?: string;
  title?: string;
  chat?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  pinned?: boolean;
};

export type UpdateChatDto = {
  title?: string;
  chat?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  pinned?: boolean;
  archived?: boolean;
};

export type ChatCompletionForm = {
  model?: string;
  messages: ChatMessage[];
  chat_id?: string;
  stream?: boolean;
  params?: Record<string, unknown>;
};

export class ChatService {
  public constructor(
    private readonly chatRepository: ChatRepository,
    private readonly agentOrchestrator: AgentOrchestrator
  ) {}

  public async listChats(
    userId: string,
    tenantId: string,
    options?: { search?: string; limit?: number; page?: number; isPinned?: boolean; isArchived?: boolean }
  ): Promise<ChatSummaryDto[]> {
    try {
      const records = await this.chatRepository.listChats(userId, tenantId, options);
      return records.map((r) => ({
        id: r.id,
        title: r.title,
        created_at: Math.floor(r.createdAt.getTime() / 1000),
        updated_at: Math.floor(r.updatedAt.getTime() / 1000),
        pinned: r.isPinned,
        archived: r.isArchived,
        chat: r.chatDataJson
      }));
    } catch {
      return [];
    }
  }

  public async getChatById(userId: string, tenantId: string, chatId: string): Promise<ChatDetailDto | null> {
    try {
      const record = await this.chatRepository.findById(userId, tenantId, chatId);
      if (!record) return null;

      const messages = await this.chatRepository.listMessages(chatId, tenantId);

      return {
        id: record.id,
        user_id: record.userId,
        title: record.title,
        chat: record.chatDataJson,
        meta: record.metaJson,
        pinned: record.isPinned,
        archived: record.isArchived,
        created_at: Math.floor(record.createdAt.getTime() / 1000),
        updated_at: Math.floor(record.updatedAt.getTime() / 1000),
        messages
      };
    } catch {
      return null;
    }
  }

  public async createChat(userId: string, tenantId: string, input: CreateChatDto): Promise<ChatDetailDto> {
    const chatInput: {
      id?: string;
      title?: string;
      chatDataJson?: Record<string, unknown>;
      metaJson?: Record<string, unknown>;
      isPinned?: boolean;
    } = {};

    if (input.id !== undefined) chatInput.id = input.id;
    if (input.title !== undefined) chatInput.title = input.title;
    if (input.chat !== undefined) chatInput.chatDataJson = input.chat;
    if (input.meta !== undefined) chatInput.metaJson = input.meta;
    if (input.pinned !== undefined) chatInput.isPinned = input.pinned;

    const created = await this.chatRepository.create(userId, tenantId, chatInput);
    return {
      id: created.id,
      user_id: created.userId,
      title: created.title,
      chat: created.chatDataJson,
      meta: created.metaJson,
      pinned: created.isPinned,
      archived: created.isArchived,
      created_at: Math.floor(created.createdAt.getTime() / 1000),
      updated_at: Math.floor(created.updatedAt.getTime() / 1000)
    };
  }

  public async updateChat(
    userId: string,
    tenantId: string,
    chatId: string,
    patch: UpdateChatDto
  ): Promise<ChatDetailDto> {
    const updateInput: {
      title?: string;
      chatDataJson?: Record<string, unknown>;
      metaJson?: Record<string, unknown>;
      isPinned?: boolean;
      isArchived?: boolean;
    } = {};

    if (patch.title !== undefined) updateInput.title = patch.title;
    if (patch.chat !== undefined) updateInput.chatDataJson = patch.chat;
    if (patch.meta !== undefined) updateInput.metaJson = patch.meta;
    if (patch.pinned !== undefined) updateInput.isPinned = patch.pinned;
    if (patch.archived !== undefined) updateInput.isArchived = patch.archived;

    const updated = await this.chatRepository.update(userId, tenantId, chatId, updateInput);
    if (!updated) {
      throw new ApiError({
        statusCode: 404,
        code: 'CHAT_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Sohbet bulunamadı.',
        retryable: false
      });
    }

    return {
      id: updated.id,
      user_id: updated.userId,
      title: updated.title,
      chat: updated.chatDataJson,
      meta: updated.metaJson,
      pinned: updated.isPinned,
      archived: updated.isArchived,
      created_at: Math.floor(updated.createdAt.getTime() / 1000),
      updated_at: Math.floor(updated.updatedAt.getTime() / 1000)
    };
  }

  public async deleteChat(userId: string, tenantId: string, chatId: string): Promise<boolean> {
    return this.chatRepository.delete(userId, tenantId, chatId);
  }

  public async cloneChat(userId: string, tenantId: string, chatId: string): Promise<ChatDetailDto> {
    const existing = await this.getChatById(userId, tenantId, chatId);
    if (!existing) {
      throw new ApiError({
        statusCode: 404,
        code: 'CHAT_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Klonlanacak sohbet bulunamadı.',
        retryable: false
      });
    }

    return this.createChat(userId, tenantId, {
      title: `${existing.title} (Kopya)`,
      chat: existing.chat,
      meta: existing.meta
    });
  }

  public async setChatPinned(
    userId: string,
    tenantId: string,
    chatId: string,
    isPinned: boolean
  ): Promise<ChatDetailDto> {
    return this.updateChat(userId, tenantId, chatId, { pinned: isPinned });
  }

  public async processChatCompletion(
    userId: string,
    tenantId: string,
    form: ChatCompletionForm,
    callbacks?: {
      onStatus?: (status: string) => void;
      onDelta?: (content: string) => void;
    }
  ): Promise<{ content: string; tokensUsed: { prompt: number; completion: number } }> {
    const modelId = form.model || 'protokol7/extractor-ai';
    const messages = form.messages || [];
    const streamCallbacks: { onStatus?: (status: string) => void; onDelta?: (content: string) => void } = {};
    if (callbacks?.onStatus !== undefined) streamCallbacks.onStatus = callbacks.onStatus;
    if (callbacks?.onDelta !== undefined) streamCallbacks.onDelta = callbacks.onDelta;

    const result = await this.agentOrchestrator.run(messages, modelId, streamCallbacks);

    // Record assistant message audit in background
    if (form.chat_id) {
      try {
        await this.chatRepository.recordMessage({
          chatId: form.chat_id,
          tenantId,
          userId,
          role: 'assistant',
          content: result.content,
          modelId,
          toolCallsJson: result.toolCalls,
          promptTokens: result.tokensUsed.prompt,
          completionTokens: result.tokensUsed.completion,
          costUsd: (result.tokensUsed.prompt * 0.0000015) + (result.tokensUsed.completion * 0.000002)
        });
      } catch {
        // Safe logging
      }
    }

    return result;
  }
}
