import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type FolderRecord = {
  id: string;
  parentId: string | null;
  userId: string;
  tenantId: string;
  name: string;
  dataJson: Record<string, unknown>;
  metaJson: Record<string, unknown>;
  isExpanded: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateFolderInput = {
  id?: string;
  parentId?: string | null;
  userId: string;
  tenantId: string;
  name: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  isExpanded?: boolean;
};

export class FolderRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateFolderInput): Promise<FolderRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<FolderRecord>(
      `INSERT INTO folders (id, parent_id, user_id, tenant_id, name, data_json, meta_json, is_expanded, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING 
         id,
         parent_id as "parentId",
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_expanded as "isExpanded",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        id,
        input.parentId ?? null,
        input.userId,
        input.tenantId,
        input.name,
        JSON.stringify(input.data ?? {}),
        JSON.stringify(input.meta ?? {}),
        input.isExpanded ?? false
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<FolderRecord | null> {
    const result = await this.db.query<FolderRecord>(
      `SELECT 
         id,
         parent_id as "parentId",
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_expanded as "isExpanded",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM folders
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async listByUser(userId: string, tenantId: string): Promise<FolderRecord[]> {
    const result = await this.db.query<FolderRecord>(
      `SELECT 
         id,
         parent_id as "parentId",
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_expanded as "isExpanded",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM folders
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
      name?: string;
      parentId?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      isExpanded?: boolean;
    }
  ): Promise<FolderRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const parentId = patch.parentId !== undefined ? patch.parentId : existing.parentId;
    const data = patch.data ?? existing.dataJson;
    const meta = patch.meta ?? existing.metaJson;
    const isExpanded = patch.isExpanded !== undefined ? patch.isExpanded : existing.isExpanded;

    const result = await this.db.query<FolderRecord>(
      `UPDATE folders
       SET name = $1, parent_id = $2, data_json = $3, meta_json = $4, is_expanded = $5, updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7
       RETURNING 
         id,
         parent_id as "parentId",
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_expanded as "isExpanded",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [name, parentId, JSON.stringify(data), JSON.stringify(meta), isExpanded, id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM folders WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
