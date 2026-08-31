import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type NoteRecord = {
  id: string;
  userId: string;
  tenantId: string;
  title: string;
  dataJson: Record<string, unknown>;
  metaJson: Record<string, unknown>;
  accessGrantsJson: Array<Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateNoteInput = {
  id?: string;
  userId: string;
  tenantId: string;
  title: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  accessGrants?: Array<Record<string, unknown>>;
};

export class NoteRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateNoteInput): Promise<NoteRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<NoteRecord>(
      `INSERT INTO notes (id, user_id, tenant_id, title, data_json, meta_json, access_grants_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         title,
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        id,
        input.userId,
        input.tenantId,
        input.title,
        JSON.stringify(input.data ?? {}),
        JSON.stringify(input.meta ?? {}),
        JSON.stringify(input.accessGrants ?? [])
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<NoteRecord | null> {
    const result = await this.db.query<NoteRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         title,
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM notes
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async listByUser(userId: string, tenantId: string): Promise<NoteRecord[]> {
    const result = await this.db.query<NoteRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         title,
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM notes
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC`,
      [userId, tenantId]
    );

    return result.rows;
  }

  public async update(
    id: string,
    tenantId: string,
    patch: {
      title?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      accessGrants?: Array<Record<string, unknown>>;
    }
  ): Promise<NoteRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const title = patch.title ?? existing.title;
    const data = patch.data ?? existing.dataJson;
    const meta = patch.meta ?? existing.metaJson;
    const accessGrants = patch.accessGrants ?? existing.accessGrantsJson;

    const result = await this.db.query<NoteRecord>(
      `UPDATE notes
       SET title = $1, data_json = $2, meta_json = $3, access_grants_json = $4, updated_at = NOW()
       WHERE id = $5 AND tenant_id = $6
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         title,
         data_json as "dataJson",
         meta_json as "metaJson",
         access_grants_json as "accessGrantsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [title, JSON.stringify(data), JSON.stringify(meta), JSON.stringify(accessGrants), id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM notes WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
