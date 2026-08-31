import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type ChannelRecord = {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  type: string;
  isPrivate: boolean;
  dataJson: Record<string, unknown>;
  metaJson: Record<string, unknown>;
  accessGrantsJson: Array<Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
};

export type ChannelMessageRecord = {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  dataJson: Record<string, unknown>;
  createdAt: Date;
};

export type CreateChannelInput = {
  id?: string;
  userId: string;
  tenantId: string;
  name: string;
  type?: string;
  isPrivate?: boolean;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  accessGrants?: Array<Record<string, unknown>>;
};

export class ChannelRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateChannelInput): Promise<ChannelRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<ChannelRecord>(
      `INSERT INTO channels (id, user_id, tenant_id, name, type, is_private, data_json, meta_json, access_grants_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         type,
         is_private as "isPrivate",
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        id,
        input.userId,
        input.tenantId,
        input.name,
        input.type || 'general',
        input.isPrivate ?? false,
        JSON.stringify(input.data ?? {}),
        JSON.stringify(input.meta ?? {}),
        JSON.stringify(input.accessGrants ?? [])
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<ChannelRecord | null> {
    const result = await this.db.query<ChannelRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         type,
         is_private as "isPrivate",
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM channels
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async list(tenantId: string): Promise<ChannelRecord[]> {
    const result = await this.db.query<ChannelRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         type,
         is_private as "isPrivate",
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM channels
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM channels WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  public async addMessage(channelId: string, userId: string, content: string, data: Record<string, unknown> = {}): Promise<ChannelMessageRecord> {
    const id = randomUUID();
    const result = await this.db.query<ChannelMessageRecord>(
      `INSERT INTO channel_messages (id, channel_id, user_id, content, data_json, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING 
         id,
         channel_id as "channelId",
         user_id as "userId",
         content,
         data_json as "dataJson",
         created_at as "createdAt"`,
      [id, channelId, userId, content, JSON.stringify(data)]
    );
    return result.rows[0]!;
  }

  public async listMessages(channelId: string, limit = 50): Promise<ChannelMessageRecord[]> {
    const result = await this.db.query<ChannelMessageRecord>(
      `SELECT 
         id,
         channel_id as "channelId",
         user_id as "userId",
         content,
         data_json as "dataJson",
         created_at as "createdAt"
       FROM channel_messages
       WHERE channel_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [channelId, limit]
    );
    return result.rows;
  }
}
