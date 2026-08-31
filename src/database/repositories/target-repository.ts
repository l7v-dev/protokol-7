import type { Database } from '../client.js';

export type TargetStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';

export type TargetRecord = {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  seedUrl: string;
  host: string;
  allowedHosts: string[];
  allowedPorts: number[];
  executionPolicy: Record<string, unknown>;
  crawlPolicy: Record<string, unknown>;
  accessPolicy: Record<string, unknown>;
  status: TargetStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTargetInput = {
  id: string;
  tenantId: string;
  projectId: string;
  name: string;
  seedUrl: string;
  host: string;
  allowedHosts: string[];
  allowedPorts: number[];
  executionPolicy?: Record<string, unknown>;
  crawlPolicy?: Record<string, unknown>;
  accessPolicy?: Record<string, unknown>;
};

type TargetRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  name: string;
  seed_url: string;
  host: string;
  allowed_hosts: string[];
  allowed_ports: number[];
  execution_policy_json: Record<string, unknown>;
  crawl_policy_json: Record<string, unknown>;
  access_policy_json: Record<string, unknown>;
  status: TargetStatus;
  created_at: Date;
  updated_at: Date;
};

function toTargetRecord(row: TargetRow): TargetRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    name: row.name,
    seedUrl: row.seed_url,
    host: row.host,
    allowedHosts: row.allowed_hosts,
    allowedPorts: row.allowed_ports,
    executionPolicy: row.execution_policy_json,
    crawlPolicy: row.crawl_policy_json,
    accessPolicy: row.access_policy_json,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TargetRepository {
  public constructor(private readonly database: Database) {}

  public async create(input: CreateTargetInput): Promise<TargetRecord> {
    const result = await this.database.query<TargetRow>(
      `
        INSERT INTO targets (
          id, tenant_id, project_id, name, seed_url, host, allowed_hosts, allowed_ports,
          execution_policy_json, crawl_policy_json, access_policy_json, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, 'ACTIVE')
        RETURNING id, tenant_id, project_id, name, seed_url, host, allowed_hosts, allowed_ports,
          execution_policy_json, crawl_policy_json, access_policy_json, status, created_at, updated_at
      `,
      [
        input.id,
        input.tenantId,
        input.projectId,
        input.name,
        input.seedUrl,
        input.host,
        JSON.stringify(input.allowedHosts),
        JSON.stringify(input.allowedPorts),
        JSON.stringify(input.executionPolicy ?? {}),
        JSON.stringify(input.crawlPolicy ?? {}),
        JSON.stringify(input.accessPolicy ?? {})
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Target insert returned no row.');
    }

    return toTargetRecord(row);
  }

  public async findById(tenantId: string, targetId: string): Promise<TargetRecord | null> {
    const result = await this.database.query<TargetRow>(
      `
        SELECT id, tenant_id, project_id, name, seed_url, host, allowed_hosts, allowed_ports,
          execution_policy_json, crawl_policy_json, access_policy_json, status, created_at, updated_at
        FROM targets
        WHERE tenant_id = $1 AND id = $2
      `,
      [tenantId, targetId]
    );

    const row = result.rows[0];
    return row ? toTargetRecord(row) : null;
  }

  public async listByProject(tenantId: string, projectId: string, limit = 50): Promise<TargetRecord[]> {
    const boundedLimit = Math.min(Math.max(limit, 1), 200);
    const result = await this.database.query<TargetRow>(
      `
        SELECT id, tenant_id, project_id, name, seed_url, host, allowed_hosts, allowed_ports,
          execution_policy_json, crawl_policy_json, access_policy_json, status, created_at, updated_at
        FROM targets
        WHERE tenant_id = $1 AND project_id = $2 AND status <> 'DELETED'
        ORDER BY created_at DESC, id DESC
        LIMIT $3
      `,
      [tenantId, projectId, boundedLimit]
    );

    return result.rows.map(toTargetRecord);
  }
}
