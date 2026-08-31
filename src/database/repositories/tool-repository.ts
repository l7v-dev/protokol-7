import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type ToolRecord = {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  content: string;
  specsJson: unknown[];
  metaJson: Record<string, unknown>;
  valvesJson: Record<string, unknown>;
  accessGrantsJson: unknown[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateToolInput = {
  id?: string;
  userId: string;
  tenantId: string;
  name: string;
  content?: string;
  specsJson?: unknown[];
  metaJson?: Record<string, unknown>;
  valvesJson?: Record<string, unknown>;
  accessGrantsJson?: unknown[];
  isActive?: boolean;
};

export type UpdateToolInput = {
  name?: string;
  content?: string;
  specsJson?: unknown[];
  metaJson?: Record<string, unknown>;
  valvesJson?: Record<string, unknown>;
  accessGrantsJson?: unknown[];
  isActive?: boolean;
};

type DbToolRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  name: string;
  content: string;
  specs_json: unknown[];
  meta_json: Record<string, unknown>;
  valves_json: Record<string, unknown>;
  access_grants_json: unknown[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function mapToolRow(row: DbToolRow): ToolRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    name: row.name,
    content: row.content || '',
    specsJson: row.specs_json || [],
    metaJson: row.meta_json || {},
    valvesJson: row.valves_json || {},
    accessGrantsJson: row.access_grants_json || [],
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export class ToolRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateToolInput): Promise<ToolRecord> {
    const id = input.id || randomUUID();
    const query = `
      INSERT INTO tools (id, user_id, tenant_id, name, content, specs_json, meta_json, valves_json, access_grants_json, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const res = await this.db.query<DbToolRow>(query, [
      id,
      input.userId,
      input.tenantId,
      input.name,
      input.content || '',
      JSON.stringify(input.specsJson || []),
      JSON.stringify(input.metaJson || {}),
      JSON.stringify(input.valvesJson || {}),
      JSON.stringify(input.accessGrantsJson || []),
      input.isActive ?? true
    ]);

    const row = res.rows[0];
    if (!row) throw new Error('Failed to create tool record');
    return mapToolRow(row);
  }

  public async findById(tenantId: string, id: string): Promise<ToolRecord | null> {
    const res = await this.db.query<DbToolRow>(
      'SELECT * FROM tools WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL LIMIT 1',
      [tenantId, id]
    );
    const row = res.rows[0];
    return row ? mapToolRow(row) : null;
  }

  public async listByTenant(tenantId: string): Promise<ToolRecord[]> {
    const res = await this.db.query<DbToolRow>(
      'SELECT * FROM tools WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [tenantId]
    );
    return res.rows.map(mapToolRow);
  }

  public async updateById(tenantId: string, id: string, patch: UpdateToolInput): Promise<ToolRecord | null> {
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [tenantId, id];
    let idx = 3;

    if (patch.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(patch.name);
    }
    if (patch.content !== undefined) {
      updates.push(`content = $${idx++}`);
      values.push(patch.content);
    }
    if (patch.specsJson !== undefined) {
      updates.push(`specs_json = $${idx++}`);
      values.push(JSON.stringify(patch.specsJson));
    }
    if (patch.metaJson !== undefined) {
      updates.push(`meta_json = $${idx++}`);
      values.push(JSON.stringify(patch.metaJson));
    }
    if (patch.valvesJson !== undefined) {
      updates.push(`valves_json = $${idx++}`);
      values.push(JSON.stringify(patch.valvesJson));
    }
    if (patch.accessGrantsJson !== undefined) {
      updates.push(`access_grants_json = $${idx++}`);
      values.push(JSON.stringify(patch.accessGrantsJson));
    }
    if (patch.isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(patch.isActive);
    }

    const query = `
      UPDATE tools
      SET ${updates.join(', ')}
      WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const res = await this.db.query<DbToolRow>(query, values);
    const row = res.rows[0];
    return row ? mapToolRow(row) : null;
  }

  public async deleteById(tenantId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      'UPDATE tools SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL',
      [tenantId, id]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
