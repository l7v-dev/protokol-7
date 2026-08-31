import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type KnowledgeRecord = {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  description: string;
  dataJson: Record<string, unknown>;
  metaJson: Record<string, unknown>;
  accessGrantsJson: Array<Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateKnowledgeInput = {
  id?: string;
  userId: string;
  tenantId: string;
  name: string;
  description?: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  accessGrants?: Array<Record<string, unknown>>;
};

export class KnowledgeRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateKnowledgeInput): Promise<KnowledgeRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<KnowledgeRecord>(
      `INSERT INTO knowledge (id, user_id, tenant_id, name, description, data_json, meta_json, access_grants_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         description,
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
        input.description || '',
        JSON.stringify(input.data ?? {}),
        JSON.stringify(input.meta ?? {}),
        JSON.stringify(input.accessGrants ?? [])
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<KnowledgeRecord | null> {
    const result = await this.db.query<KnowledgeRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         description,
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM knowledge
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async list(tenantId: string): Promise<KnowledgeRecord[]> {
    const result = await this.db.query<KnowledgeRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         description,
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM knowledge
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
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      accessGrants?: Array<Record<string, unknown>>;
    }
  ): Promise<KnowledgeRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const description = patch.description ?? existing.description;
    const data = patch.data ?? existing.dataJson;
    const meta = patch.meta ?? existing.metaJson;
    const accessGrants = patch.accessGrants ?? existing.accessGrantsJson;

    const result = await this.db.query<KnowledgeRecord>(
      `UPDATE knowledge
       SET name = $1, description = $2, data_json = $3, meta_json = $4, access_grants_json = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         description,
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [name, description, JSON.stringify(data), JSON.stringify(meta), JSON.stringify(accessGrants), id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM knowledge WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
