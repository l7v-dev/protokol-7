import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type MemoryRecord = {
  id: string;
  userId: string;
  tenantId: string;
  content: string;
  type: string;
  path: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMemoryInput = {
  id?: string;
  userId: string;
  tenantId: string;
  content: string;
  type?: string;
  path?: string;
};

export class MemoryRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateMemoryInput): Promise<MemoryRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<MemoryRecord>(
      `INSERT INTO memories (id, user_id, tenant_id, content, type, path, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         content,
         type,
         path,
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [id, input.userId, input.tenantId, input.content, input.type || 'user', input.path || '']
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<MemoryRecord | null> {
    const result = await this.db.query<MemoryRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         content,
         type,
         path,
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM memories
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async listByUser(userId: string, tenantId: string): Promise<MemoryRecord[]> {
    const result = await this.db.query<MemoryRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         content,
         type,
         path,
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM memories
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [userId, tenantId]
    );

    return result.rows;
  }

  public async update(
    id: string,
    tenantId: string,
    patch: {
      content?: string;
      type?: string;
      path?: string;
    }
  ): Promise<MemoryRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const content = patch.content ?? existing.content;
    const type = patch.type ?? existing.type;
    const path = patch.path ?? existing.path;

    const result = await this.db.query<MemoryRecord>(
      `UPDATE memories
       SET content = $1, type = $2, path = $3, updated_at = NOW()
       WHERE id = $4 AND tenant_id = $5
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         content,
         type,
         path,
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [content, type, path, id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM memories WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  public async deleteAllByUser(userId: string, tenantId: string): Promise<number> {
    const result = await this.db.query(`DELETE FROM memories WHERE user_id = $1 AND tenant_id = $2`, [userId, tenantId]);
    return result.rowCount ?? 0;
  }
}
