import type { Database } from '../client.js';

export type ProjectRecord = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED' | 'DELETED';
  defaultPolicy: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateProjectInput = {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  defaultPolicy?: Record<string, unknown>;
  createdBy: string;
};

type ProjectRow = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: ProjectRecord['status'];
  default_policy_json: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

function toProjectRecord(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    status: row.status,
    defaultPolicy: row.default_policy_json,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ProjectRepository {
  public constructor(private readonly database: Database) {}

  public async create(input: CreateProjectInput): Promise<ProjectRecord> {
    const result = await this.database.query<ProjectRow>(
      `
        INSERT INTO projects (
          id, tenant_id, name, description, status, default_policy_json, created_by
        ) VALUES ($1, $2, $3, $4, 'ACTIVE', $5::jsonb, $6)
        RETURNING id, tenant_id, name, description, status, default_policy_json, created_by, created_at, updated_at
      `,
      [
        input.id,
        input.tenantId,
        input.name,
        input.description ?? null,
        JSON.stringify(input.defaultPolicy ?? {}),
        input.createdBy
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Project insert returned no row.');
    }

    return toProjectRecord(row);
  }

  public async findById(tenantId: string, projectId: string): Promise<ProjectRecord | null> {
    const result = await this.database.query<ProjectRow>(
      `
        SELECT id, tenant_id, name, description, status, default_policy_json, created_by, created_at, updated_at
        FROM projects
        WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, projectId]
    );

    const row = result.rows[0];
    return row ? toProjectRecord(row) : null;
  }

  public async listByTenant(tenantId: string, limit = 50): Promise<ProjectRecord[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    const result = await this.database.query<ProjectRow>(
      `
        SELECT id, tenant_id, name, description, status, default_policy_json, created_by, created_at, updated_at
        FROM projects
        WHERE tenant_id = $1 AND status <> 'DELETED'
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [tenantId, boundedLimit]
    );

    return result.rows.map(toProjectRecord);
  }
}
