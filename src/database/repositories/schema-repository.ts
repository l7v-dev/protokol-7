import type { Database } from '../client.js';

export type SchemaStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';

export type SchemaRecord = {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  version: number;
  definition: Record<string, unknown>;
  status: SchemaStatus;
  createdBy: string;
  createdAt: Date;
};

export type CreateSchemaInput = {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  version: number;
  definition: Record<string, unknown>;
  createdBy: string;
};

type SchemaRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  version: number;
  definition_json: Record<string, unknown>;
  status: SchemaStatus;
  created_by: string;
  created_at: Date;
};

function toSchemaRecord(row: SchemaRow): SchemaRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    name: row.name,
    version: row.version,
    definition: row.definition_json,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export class SchemaRepository {
  public constructor(private readonly database: Database) {}

  public async create(input: CreateSchemaInput): Promise<SchemaRecord> {
    const result = await this.database.query<SchemaRow>(
      `
        INSERT INTO schemas (
          id, tenant_id, project_id, name, version, definition_json, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'DRAFT', $7)
        RETURNING id, tenant_id, project_id, name, version, definition_json, status, created_by, created_at
      `,
      [
        input.id,
        input.tenantId,
        input.projectId,
        input.name,
        input.version,
        JSON.stringify(input.definition),
        input.createdBy
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Schema insert returned no row.');
    }

    return toSchemaRecord(row);
  }

  public async findById(tenantId: string, schemaId: string): Promise<SchemaRecord | null> {
    const result = await this.database.query<SchemaRow>(
      `
        SELECT id, tenant_id, project_id, name, version, definition_json, status, created_by, created_at
        FROM schemas
        WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, schemaId]
    );

    const row = result.rows[0];
    return row ? toSchemaRecord(row) : null;
  }

  public async listByProject(tenantId: string, projectId: string, limit = 50): Promise<SchemaRecord[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    const result = await this.database.query<SchemaRow>(
      `
        SELECT id, tenant_id, project_id, name, version, definition_json, status, created_by, created_at
        FROM schemas
        WHERE tenant_id = $1 AND project_id = $2
        ORDER BY name ASC, version DESC
        LIMIT $3
      `,
      [tenantId, projectId, boundedLimit]
    );

    return result.rows.map(toSchemaRecord);
  }

  public async publish(tenantId: string, schemaId: string): Promise<SchemaRecord | null> {
    const result = await this.database.query<SchemaRow>(
      `
        UPDATE schemas
        SET status = 'PUBLISHED'
        WHERE tenant_id = $1 AND id = $2 AND status = 'DRAFT'
        RETURNING id, tenant_id, project_id, name, version, definition_json, status, created_by, created_at
      `,
      [tenantId, schemaId]
    );

    const row = result.rows[0];
    return row ? toSchemaRecord(row) : null;
  }
}
