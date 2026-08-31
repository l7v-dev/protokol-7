import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type SkillRecord = {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description: string;
  content: string;
  metaJson: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateSkillInput = {
  id?: string;
  tenantId: string;
  userId: string;
  name: string;
  description?: string;
  content?: string;
  meta?: Record<string, unknown>;
  isActive?: boolean;
};

export class SkillRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateSkillInput): Promise<SkillRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<SkillRecord>(
      `INSERT INTO skills (id, tenant_id, user_id, name, description, content, meta_json, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         content,
         meta_json as "metaJson",
         is_active as "isActive",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        id,
        input.tenantId,
        input.userId,
        input.name,
        input.description || '',
        input.content || '',
        JSON.stringify(input.meta ?? {}),
        input.isActive ?? true
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<SkillRecord | null> {
    const result = await this.db.query<SkillRecord>(
      `SELECT 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         content,
         meta_json as "metaJson",
         is_active as "isActive",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM skills
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async list(tenantId: string): Promise<SkillRecord[]> {
    const result = await this.db.query<SkillRecord>(
      `SELECT 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         content,
         meta_json as "metaJson",
         is_active as "isActive",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM skills
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows;
  }

  public async update(
    id: string,
    tenantId: string,
    patch: {
      name?: string;
      description?: string;
      content?: string;
      meta?: Record<string, unknown>;
      isActive?: boolean;
    }
  ): Promise<SkillRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const description = patch.description ?? existing.description;
    const content = patch.content ?? existing.content;
    const meta = patch.meta ?? existing.metaJson;
    const isActive = patch.isActive !== undefined ? patch.isActive : existing.isActive;

    const result = await this.db.query<SkillRecord>(
      `UPDATE skills
       SET name = $1, description = $2, content = $3, meta_json = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         content,
         meta_json as "metaJson",
         is_active as "isActive",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [name, description, content, JSON.stringify(meta), isActive, id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM skills WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
