import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type GroupRecord = {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description: string;
  dataJson: Record<string, unknown>;
  metaJson: Record<string, unknown>;
  permissionsJson: Record<string, unknown>;
  userIdsJson: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type CreateGroupInput = {
  id?: string;
  tenantId: string;
  userId: string;
  name: string;
  description?: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  userIds?: string[];
};

export class GroupRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateGroupInput): Promise<GroupRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<GroupRecord>(
      `INSERT INTO groups (id, tenant_id, user_id, name, description, data_json, meta_json, permissions_json, user_ids_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         data_json as "dataJson",
         meta_json as "metaJson",
         permissions_json as "permissionsJson",
         user_ids_json as "userIdsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        id,
        input.tenantId,
        input.userId,
        input.name,
        input.description || '',
        JSON.stringify(input.data ?? {}),
        JSON.stringify(input.meta ?? {}),
        JSON.stringify(input.permissions ?? {}),
        JSON.stringify(input.userIds ?? [])
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<GroupRecord | null> {
    const result = await this.db.query<GroupRecord>(
      `SELECT 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         data_json as "dataJson",
         meta_json as "metaJson",
         permissions_json as "permissionsJson",
         user_ids_json as "userIdsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM groups
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async list(tenantId: string): Promise<GroupRecord[]> {
    const result = await this.db.query<GroupRecord>(
      `SELECT 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         data_json as "dataJson",
         meta_json as "metaJson",
         permissions_json as "permissionsJson",
         user_ids_json as "userIdsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM groups
       WHERE tenant_id = $1
       ORDER BY created_at ASC`,
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
      permissions?: Record<string, unknown>;
      userIds?: string[];
    }
  ): Promise<GroupRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const description = patch.description ?? existing.description;
    const data = patch.data ?? existing.dataJson;
    const meta = patch.meta ?? existing.metaJson;
    const permissions = patch.permissions ?? existing.permissionsJson;
    const userIds = patch.userIds ?? existing.userIdsJson;

    const result = await this.db.query<GroupRecord>(
      `UPDATE groups
       SET name = $1, description = $2, data_json = $3, meta_json = $4, permissions_json = $5, user_ids_json = $6, updated_at = NOW()
       WHERE id = $7 AND tenant_id = $8
       RETURNING 
         id,
         tenant_id as "tenantId",
         user_id as "userId",
         name,
         description,
         data_json as "dataJson",
         meta_json as "metaJson",
         permissions_json as "permissionsJson",
         user_ids_json as "userIdsJson",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [name, description, JSON.stringify(data), JSON.stringify(meta), JSON.stringify(permissions), JSON.stringify(userIds), id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM groups WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
