import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type ChatRecord = {
  id: string;
  userId: string;
  tenantId: string;
  title: string;
  chatDataJson: Record<string, unknown>;
  metaJson: Record<string, unknown>;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type ChatMessageRecord = {
  id: string;
  chatId: string;
  tenantId: string;
  userId: string;
  role: string;
  content: string;
  modelId: string;
  toolCallsJson: unknown[];
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  createdAt: Date;
};

export type CreateChatInput = {
  id?: string;
  title?: string;
  chatDataJson?: Record<string, unknown>;
  metaJson?: Record<string, unknown>;
  isPinned?: boolean;
};

export type UpdateChatInput = {
  title?: string;
  chatDataJson?: Record<string, unknown>;
  metaJson?: Record<string, unknown>;
  isPinned?: boolean;
  isArchived?: boolean;
};

export type CreateChatMessageInput = {
  id?: string;
  chatId: string;
  tenantId: string;
  userId: string;
  role: string;
  content: string;
  modelId: string;
  toolCallsJson?: unknown[];
  promptTokens?: number;
  completionTokens?: number;
  costUsd?: number;
};

type DbChatRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  title: string;
  chat_data_json: Record<string, unknown>;
  meta_json: Record<string, unknown>;
  is_pinned: boolean;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

type DbChatMessageRow = {
  id: string;
  chat_id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  content: string;
  model_id: string;
  tool_calls_json: unknown[];
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: string;
  created_at: Date;
};

function mapChatRow(row: DbChatRow): ChatRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    title: row.title,
    chatDataJson: row.chat_data_json || {},
    metaJson: row.meta_json || {},
    isPinned: row.is_pinned,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

function mapMessageRow(row: DbChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    modelId: row.model_id,
    toolCallsJson: row.tool_calls_json || [],
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    costUsd: Number.parseFloat(row.cost_usd || '0'),
    createdAt: row.created_at
  };
}

export class ChatRepository {
  public constructor(private readonly db: Database) {}

  public async listChats(
    userId: string,
    tenantId: string,
    options?: { search?: string; limit?: number; page?: number; isPinned?: boolean; isArchived?: boolean }
  ): Promise<ChatRecord[]> {
    const conditions: string[] = ['user_id = $1', 'tenant_id = $2', 'deleted_at IS NULL'];
    const values: unknown[] = [userId, tenantId];
    let idx = 3;

    if (options?.isPinned !== undefined) {
      conditions.push(`is_pinned = $${idx++}`);
      values.push(options.isPinned);
    }

    if (options?.isArchived !== undefined) {
      conditions.push(`is_archived = $${idx++}`);
      values.push(options.isArchived);
    }

    if (options?.search) {
      conditions.push(`title ILIKE $${idx++}`);
      values.push(`%${options.search}%`);
    }

    const limit = Math.min(options?.limit || 50, 100);
    const offset = Math.max(0, ((options?.page || 1) - 1) * limit);

    const query = `
      SELECT * FROM chats
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_pinned DESC, updated_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    values.push(limit, offset);

    const res = await this.db.query<DbChatRow>(query, values);
    return res.rows.map(mapChatRow);
  }

  public async findById(userId: string, tenantId: string, chatId: string): Promise<ChatRecord | null> {
    const res = await this.db.query<DbChatRow>(
      'SELECT * FROM chats WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND deleted_at IS NULL LIMIT 1',
      [chatId, userId, tenantId]
    );

    const row = res.rows[0];
    return row ? mapChatRow(row) : null;
  }

  public async create(userId: string, tenantId: string, input: CreateChatInput): Promise<ChatRecord> {
    const id = input.id || randomUUID();
    const title = input.title || 'Yeni Sohbet';
    const chatDataJson = input.chatDataJson || {};
    const metaJson = input.metaJson || {};
    const isPinned = input.isPinned || false;

    const query = `
      INSERT INTO chats (id, user_id, tenant_id, title, chat_data_json, meta_json, is_pinned)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const res = await this.db.query<DbChatRow>(query, [
      id,
      userId,
      tenantId,
      title,
      JSON.stringify(chatDataJson),
      JSON.stringify(metaJson),
      isPinned
    ]);

    const row = res.rows[0];
    if (!row) {
      throw new Error('Chat creation failed to return row');
    }

    return mapChatRow(row);
  }

  public async update(
    userId: string,
    tenantId: string,
    chatId: string,
    patch: UpdateChatInput
  ): Promise<ChatRecord | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [chatId, userId, tenantId];
    let idx = 4;

    if (patch.title !== undefined) {
      updates.push(`title = $${idx++}`);
      values.push(patch.title);
    }

    if (patch.chatDataJson !== undefined) {
      updates.push(`chat_data_json = $${idx++}`);
      values.push(JSON.stringify(patch.chatDataJson));
    }

    if (patch.metaJson !== undefined) {
      updates.push(`meta_json = $${idx++}`);
      values.push(JSON.stringify(patch.metaJson));
    }

    if (patch.isPinned !== undefined) {
      updates.push(`is_pinned = $${idx++}`);
      values.push(patch.isPinned);
    }

    if (patch.isArchived !== undefined) {
      updates.push(`is_archived = $${idx++}`);
      values.push(patch.isArchived);
    }

    const query = `
      UPDATE chats
      SET ${updates.join(', ')}
      WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND deleted_at IS NULL
      RETURNING *
    `;

    const res = await this.db.query<DbChatRow>(query, values);
    const row = res.rows[0];
    return row ? mapChatRow(row) : null;
  }

  public async delete(userId: string, tenantId: string, chatId: string): Promise<boolean> {
    const res = await this.db.query(
      'UPDATE chats SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND user_id = $2 AND tenant_id = $3 AND deleted_at IS NULL',
      [chatId, userId, tenantId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async recordMessage(input: CreateChatMessageInput): Promise<ChatMessageRecord> {
    const id = input.id || randomUUID();
    const query = `
      INSERT INTO chat_messages (
        id, chat_id, tenant_id, user_id, role, content,
        model_id, tool_calls_json, prompt_tokens, completion_tokens, cost_usd
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const res = await this.db.query<DbChatMessageRow>(query, [
      id,
      input.chatId,
      input.tenantId,
      input.userId,
      input.role,
      input.content,
      input.modelId,
      JSON.stringify(input.toolCallsJson || []),
      input.promptTokens || 0,
      input.completionTokens || 0,
      input.costUsd || 0
    ]);

    const row = res.rows[0];
    if (!row) {
      throw new Error('Message creation failed to return row');
    }

    return mapMessageRow(row);
  }

  public async listMessages(chatId: string, tenantId: string): Promise<ChatMessageRecord[]> {
    const res = await this.db.query<DbChatMessageRow>(
      'SELECT * FROM chat_messages WHERE chat_id = $1 AND tenant_id = $2 ORDER BY created_at ASC',
      [chatId, tenantId]
    );
    return res.rows.map(mapMessageRow);
  }
}
