import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type FileRecord = {
  id: string;
  userId: string;
  tenantId: string;
  filename: string;
  hash: string | null;
  path: string | null;
  metaJson: Record<string, unknown>;
  dataJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type CreateFileInput = {
  id?: string;
  userId: string;
  tenantId: string;
  filename: string;
  hash?: string;
  path?: string;
  metaJson?: Record<string, unknown>;
  dataJson?: Record<string, unknown>;
};

type DbFileRow = {
  id: string;
  user_id: string;
  tenant_id: string;
  filename: string;
  hash: string | null;
  path: string | null;
  meta_json: Record<string, unknown>;
  data_json: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

function mapFileRow(row: DbFileRow): FileRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tenantId: row.tenant_id,
    filename: row.filename,
    hash: row.hash,
    path: row.path,
    metaJson: row.meta_json || {},
    dataJson: row.data_json || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at
  };
}

export class FileRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateFileInput): Promise<FileRecord> {
    const id = input.id || randomUUID();
    const hash = input.hash || null;
    const path = input.path || null;
    const metaJson = input.metaJson || {};
    const dataJson = input.dataJson || {};

    const query = `
      INSERT INTO files (id, user_id, tenant_id, filename, hash, path, meta_json, data_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const res = await this.db.query<DbFileRow>(query, [
      id,
      input.userId,
      input.tenantId,
      input.filename,
      hash,
      path,
      JSON.stringify(metaJson),
      JSON.stringify(dataJson)
    ]);

    const row = res.rows[0];
    if (!row) {
      throw new Error('Failed to create file record');
    }

    return mapFileRow(row);
  }

  public async findById(tenantId: string, id: string): Promise<FileRecord | null> {
    const res = await this.db.query<DbFileRow>(
      'SELECT * FROM files WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1',
      [id, tenantId]
    );
    const row = res.rows[0];
    return row ? mapFileRow(row) : null;
  }

  public async listByTenant(
    tenantId: string,
    userId?: string,
    options?: { skip?: number; limit?: number; search?: string }
  ): Promise<FileRecord[]> {
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (userId) {
      conditions.push(`user_id = $${idx++}`);
      values.push(userId);
    }

    if (options?.search) {
      conditions.push(`filename ILIKE $${idx++}`);
      values.push(`%${options.search}%`);
    }

    const limit = Math.min(options?.limit || 50, 100);
    const offset = Math.max(0, options?.skip || 0);

    const query = `
      SELECT * FROM files
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;

    values.push(limit, offset);

    const res = await this.db.query<DbFileRow>(query, values);
    return res.rows.map(mapFileRow);
  }

  public async countByTenant(tenantId: string, userId?: string): Promise<number> {
    const conditions: string[] = ['tenant_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [tenantId];
    let idx = 2;

    if (userId) {
      conditions.push(`user_id = $${idx++}`);
      values.push(userId);
    }

    const query = `SELECT COUNT(*) AS total FROM files WHERE ${conditions.join(' AND ')}`;
    const res = await this.db.query<{ total: string }>(query, values);
    return Number.parseInt(res.rows[0]?.total || '0', 10);
  }

  public async delete(tenantId: string, userId: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      'UPDATE files SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND deleted_at IS NULL',
      [id, tenantId, userId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async deleteAll(tenantId: string, userId: string): Promise<number> {
    const res = await this.db.query(
      'UPDATE files SET deleted_at = NOW(), updated_at = NOW() WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [tenantId, userId]
    );
    return res.rowCount ?? 0;
  }
}
