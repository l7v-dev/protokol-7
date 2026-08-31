import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type AutomationRecord = {
  id: string;
  userId: string;
  tenantId: string;
  folderId: string | null;
  name: string;
  dataJson: Record<string, unknown>;
  metaJson: Record<string, unknown>;
  isActive: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AutomationRunRecord = {
  id: string;
  automationId: string;
  chatId: string | null;
  status: string;
  error: string | null;
  createdAt: Date;
};

export type CreateAutomationInput = {
  id?: string;
  userId: string;
  tenantId: string;
  folderId?: string | null;
  name: string;
  data?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  isActive?: boolean;
};

export class AutomationRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateAutomationInput): Promise<AutomationRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<AutomationRecord>(
      `INSERT INTO automations (id, user_id, tenant_id, folder_id, name, data_json, meta_json, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         folder_id as "folderId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_active as "isActive",
         last_run_at as "lastRunAt",
         next_run_at as "nextRunAt",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        id,
        input.userId,
        input.tenantId,
        input.folderId ?? null,
        input.name,
        JSON.stringify(input.data ?? {}),
        JSON.stringify(input.meta ?? {}),
        input.isActive ?? true
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<AutomationRecord | null> {
    const result = await this.db.query<AutomationRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         folder_id as "folderId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_active as "isActive",
         last_run_at as "lastRunAt",
         next_run_at as "nextRunAt",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM automations
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async listByUser(userId: string, tenantId: string): Promise<AutomationRecord[]> {
    const result = await this.db.query<AutomationRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         folder_id as "folderId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_active as "isActive",
         last_run_at as "lastRunAt",
         next_run_at as "nextRunAt",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM automations
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
      folderId?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      isActive?: boolean;
      lastRunAt?: Date | null;
      nextRunAt?: Date | null;
    }
  ): Promise<AutomationRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const folderId = patch.folderId !== undefined ? patch.folderId : existing.folderId;
    const data = patch.data ?? existing.dataJson;
    const meta = patch.meta ?? existing.metaJson;
    const isActive = patch.isActive !== undefined ? patch.isActive : existing.isActive;
    const lastRunAt = patch.lastRunAt !== undefined ? patch.lastRunAt : existing.lastRunAt;
    const nextRunAt = patch.nextRunAt !== undefined ? patch.nextRunAt : existing.nextRunAt;

    const result = await this.db.query<AutomationRecord>(
      `UPDATE automations
       SET name = $1, folder_id = $2, data_json = $3, meta_json = $4, is_active = $5, last_run_at = $6, next_run_at = $7, updated_at = NOW()
       WHERE id = $8 AND tenant_id = $9
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         folder_id as "folderId",
         name,
         data_json as "dataJson",
         meta_json as "metaJson",
         is_active as "isActive",
         last_run_at as "lastRunAt",
         next_run_at as "nextRunAt",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [name, folderId, JSON.stringify(data), JSON.stringify(meta), isActive, lastRunAt, nextRunAt, id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM automations WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }

  public async addRun(automationId: string, status = 'completed', error: string | null = null, chatId: string | null = null): Promise<AutomationRunRecord> {
    const id = randomUUID();
    const result = await this.db.query<AutomationRunRecord>(
      `INSERT INTO automation_runs (id, automation_id, chat_id, status, error, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING 
         id,
         automation_id as "automationId",
         chat_id as "chatId",
         status,
         error,
         created_at as "createdAt"`,
      [id, automationId, chatId, status, error]
    );
    return result.rows[0]!;
  }

  public async listRuns(automationId: string, limit = 50, skip = 0): Promise<AutomationRunRecord[]> {
    const result = await this.db.query<AutomationRunRecord>(
      `SELECT 
         id,
         automation_id as "automationId",
         chat_id as "chatId",
         status,
         error,
         created_at as "createdAt"
       FROM automation_runs
       WHERE automation_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [automationId, limit, skip]
    );
    return result.rows;
  }
}
