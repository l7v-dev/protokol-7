import type { Database } from '../client.js';

export type ModelRecord = {
  id: string;
  tenantId: string;
  userId: string | null;
  baseModelId: string | null;
  name: string;
  metaJson: Record<string, unknown>;
  paramsJson: Record<string, unknown>;
  accessControlJson: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateModelInput = {
  id: string;
  tenantId: string;
  userId?: string | null;
  baseModelId?: string | null;
  name: string;
  metaJson?: Record<string, unknown>;
  paramsJson?: Record<string, unknown>;
  accessControlJson?: Record<string, unknown>;
  isActive?: boolean;
};

export type UpdateModelInput = {
  baseModelId?: string | null;
  name?: string;
  metaJson?: Record<string, unknown>;
  paramsJson?: Record<string, unknown>;
  accessControlJson?: Record<string, unknown>;
  isActive?: boolean;
};

type DbModelRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  base_model_id: string | null;
  name: string;
  meta_json: Record<string, unknown>;
  params_json: Record<string, unknown>;
  access_control_json: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function mapRow(row: DbModelRow): ModelRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    baseModelId: row.base_model_id,
    name: row.name,
    metaJson: row.meta_json || {},
    paramsJson: row.params_json || {},
    accessControlJson: row.access_control_json || {},
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export class ModelRepository {
  public constructor(private readonly db: Database) {}

  public async listModels(
    tenantId: string,
    options?: { search?: string; isActive?: boolean }
  ): Promise<ModelRecord[]> {
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (options?.isActive !== undefined) {
      conditions.push(`is_active = $${idx++}`);
      values.push(options.isActive);
    }

    if (options?.search) {
      conditions.push(`(name ILIKE $${idx} OR id ILIKE $${idx})`);
      values.push(`%${options.search}%`);
      idx++;
    }

    const query = `
      SELECT * FROM models
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC
    `;

    const res = await this.db.query<DbModelRow>(query, values);
    return res.rows.map(mapRow);
  }

  public async findById(tenantId: string, id: string): Promise<ModelRecord | null> {
    const res = await this.db.query<DbModelRow>(
      'SELECT * FROM models WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL LIMIT 1',
      [tenantId, id]
    );

    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }

  public async create(input: CreateModelInput): Promise<ModelRecord> {
    const query = `
      INSERT INTO models (
        id, tenant_id, user_id, base_model_id, name,
        meta_json, params_json, access_control_json, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id, id) DO UPDATE
      SET base_model_id = EXCLUDED.base_model_id,
          name = EXCLUDED.name,
          meta_json = EXCLUDED.meta_json,
          params_json = EXCLUDED.params_json,
          access_control_json = EXCLUDED.access_control_json,
          is_active = EXCLUDED.is_active,
          updated_at = NOW(),
          deleted_at = NULL
      RETURNING *
    `;

    const res = await this.db.query<DbModelRow>(query, [
      input.id,
      input.tenantId,
      input.userId ?? null,
      input.baseModelId ?? null,
      input.name,
      JSON.stringify(input.metaJson ?? {}),
      JSON.stringify(input.paramsJson ?? {}),
      JSON.stringify(input.accessControlJson ?? {}),
      input.isActive ?? true
    ]);

    const row = res.rows[0];
    if (!row) {
      throw new Error('Model creation failed to return row');
    }

    return mapRow(row);
  }

  public async update(
    tenantId: string,
    id: string,
    patch: UpdateModelInput
  ): Promise<ModelRecord | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [tenantId, id];
    let idx = 3;

    if (patch.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(patch.name);
    }

    if (patch.baseModelId !== undefined) {
      updates.push(`base_model_id = $${idx++}`);
      values.push(patch.baseModelId);
    }

    if (patch.metaJson !== undefined) {
      updates.push(`meta_json = $${idx++}`);
      values.push(JSON.stringify(patch.metaJson));
    }

    if (patch.paramsJson !== undefined) {
      updates.push(`params_json = $${idx++}`);
      values.push(JSON.stringify(patch.paramsJson));
    }

    if (patch.accessControlJson !== undefined) {
      updates.push(`access_control_json = $${idx++}`);
      values.push(JSON.stringify(patch.accessControlJson));
    }

    if (patch.isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(patch.isActive);
    }

    const query = `
      UPDATE models
      SET ${updates.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const res = await this.db.query<DbModelRow>(query, values);
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }

  public async delete(tenantId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      'UPDATE models SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL',
      [tenantId, id]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
