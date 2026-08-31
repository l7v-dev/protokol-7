import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type PromptRecord = {
  id: string;
  userId: string;
  tenantId: string;
  command: string;
  name: string;
  content: string;
  metaJson: Record<string, unknown>;
  dataJson: Record<string, unknown>;
  accessGrantsJson: unknown[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreatePromptInput = {
  id?: string;
  userId: string;
  tenantId: string;
  command: string;
  name: string;
  content: string;
  metaJson?: Record<string, unknown>;
  dataJson?: Record<string, unknown>;
  accessGrantsJson?: unknown[];
};

export type UpdatePromptInput = {
  command?: string;
  name?: string;
  content?: string;
  metaJson?: Record<string, unknown>;
  dataJson?: Record<string, unknown>;
  accessGrantsJson?: unknown[];
};

type DbPromptRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  command: string;
  name: string;
  content: string;
  meta_json: Record<string, unknown>;
  data_json: Record<string, unknown>;
  access_grants_json: unknown[];
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function mapPromptRow(row: DbPromptRow): PromptRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    command: row.command,
    name: row.name,
    content: row.content,
    metaJson: row.meta_json || {},
    dataJson: row.data_json || {},
    accessGrantsJson: row.access_grants_json || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export class PromptRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreatePromptInput): Promise<PromptRecord> {
    const id = input.id || randomUUID();
    const cleanCommand = input.command.replace(/^\//, '').trim();

    const query = `
      INSERT INTO prompts (id, user_id, tenant_id, command, name, content, meta_json, data_json, access_grants_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const res = await this.db.query<DbPromptRow>(query, [
      id,
      input.userId,
      input.tenantId,
      cleanCommand,
      input.name,
      input.content,
      JSON.stringify(input.metaJson || {}),
      JSON.stringify(input.dataJson || {}),
      JSON.stringify(input.accessGrantsJson || [])
    ]);

    const row = res.rows[0];
    if (!row) throw new Error('Failed to create prompt record');
    return mapPromptRow(row);
  }

  public async findByCommand(tenantId: string, command: string): Promise<PromptRecord | null> {
    const cleanCommand = command.replace(/^\//, '').trim();
    const res = await this.db.query<DbPromptRow>(
      'SELECT * FROM prompts WHERE tenant_id = $1 AND command = $2 AND deleted_at IS NULL LIMIT 1',
      [tenantId, cleanCommand]
    );
    const row = res.rows[0];
    return row ? mapPromptRow(row) : null;
  }

  public async listByTenant(tenantId: string): Promise<PromptRecord[]> {
    const res = await this.db.query<DbPromptRow>(
      'SELECT * FROM prompts WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name ASC',
      [tenantId]
    );
    return res.rows.map(mapPromptRow);
  }

  public async updateByCommand(
    tenantId: string,
    command: string,
    patch: UpdatePromptInput
  ): Promise<PromptRecord | null> {
    const cleanCommand = command.replace(/^\//, '').trim();
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [tenantId, cleanCommand];
    let idx = 3;

    if (patch.name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(patch.name);
    }
    if (patch.content !== undefined) {
      updates.push(`content = $${idx++}`);
      values.push(patch.content);
    }
    if (patch.command !== undefined) {
      updates.push(`command = $${idx++}`);
      values.push(patch.command.replace(/^\//, '').trim());
    }
    if (patch.metaJson !== undefined) {
      updates.push(`meta_json = $${idx++}`);
      values.push(JSON.stringify(patch.metaJson));
    }
    if (patch.dataJson !== undefined) {
      updates.push(`data_json = $${idx++}`);
      values.push(JSON.stringify(patch.dataJson));
    }
    if (patch.accessGrantsJson !== undefined) {
      updates.push(`access_grants_json = $${idx++}`);
      values.push(JSON.stringify(patch.accessGrantsJson));
    }

    const query = `
      UPDATE prompts
      SET ${updates.join(', ')}
      WHERE tenant_id = $1 AND command = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const res = await this.db.query<DbPromptRow>(query, values);
    const row = res.rows[0];
    return row ? mapPromptRow(row) : null;
  }

  public async deleteByCommand(tenantId: string, command: string): Promise<boolean> {
    const cleanCommand = command.replace(/^\//, '').trim();
    const res = await this.db.query(
      'UPDATE prompts SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND command = $2 AND deleted_at IS NULL',
      [tenantId, cleanCommand]
    );
    return (res.rowCount ?? 0) > 0;
  }
}
