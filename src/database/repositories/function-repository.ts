import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type FunctionRecord = {
  id: string;
  userId: string;
  tenantId: string;
  name: string;
  type: string;
  content: string;
  metaJson: Record<string, unknown>;
  valvesJson: Record<string, unknown>;
  isActive: boolean;
  isGlobal: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateFunctionInput = {
  id?: string;
  userId: string;
  tenantId: string;
  name: string;
  type?: string;
  content?: string;
  meta?: Record<string, unknown>;
  valves?: Record<string, unknown>;
  isActive?: boolean;
  isGlobal?: boolean;
};

export class FunctionRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateFunctionInput): Promise<FunctionRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<FunctionRecord>(
      `INSERT INTO functions (id, user_id, tenant_id, name, type, content, meta_json, valves_json, is_active, is_global, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         type,
         content,
         meta_json as "metaJson",
         valves_json as "valvesJson",
         is_active as "isActive",
         is_global as "isGlobal",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [
        id,
        input.userId,
        input.tenantId,
        input.name,
        input.type || 'pipe',
        input.content || '',
        JSON.stringify(input.meta ?? {}),
        JSON.stringify(input.valves ?? {}),
        input.isActive ?? true,
        input.isGlobal ?? false
      ]
    );

    return result.rows[0]!;
  }

  public async findById(id: string, tenantId: string): Promise<FunctionRecord | null> {
    const result = await this.db.query<FunctionRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         type,
         content,
         meta_json as "metaJson",
         valves_json as "valvesJson",
         is_active as "isActive",
         is_global as "isGlobal",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM functions
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async list(tenantId: string): Promise<FunctionRecord[]> {
    const result = await this.db.query<FunctionRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         type,
         content,
         meta_json as "metaJson",
         valves_json as "valvesJson",
         is_active as "isActive",
         is_global as "isGlobal",
         created_at as "createdAt",
         updated_at as "updatedAt"
       FROM functions
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows;
  }

  public async update(
    id: string,
    tenantId: string,
    patch: {
      name?: string;
      type?: string;
      content?: string;
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      isActive?: boolean;
      isGlobal?: boolean;
    }
  ): Promise<FunctionRecord | null> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return null;

    const name = patch.name ?? existing.name;
    const type = patch.type ?? existing.type;
    const content = patch.content ?? existing.content;
    const meta = patch.meta ?? existing.metaJson;
    const valves = patch.valves ?? existing.valvesJson;
    const isActive = patch.isActive !== undefined ? patch.isActive : existing.isActive;
    const isGlobal = patch.isGlobal !== undefined ? patch.isGlobal : existing.isGlobal;

    const result = await this.db.query<FunctionRecord>(
      `UPDATE functions
       SET name = $1, type = $2, content = $3, meta_json = $4, valves_json = $5, is_active = $6, is_global = $7, updated_at = NOW()
       WHERE id = $8 AND tenant_id = $9
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         name,
         type,
         content,
         meta_json as "metaJson",
         valves_json as "valvesJson",
         is_active as "isActive",
         is_global as "isGlobal",
         created_at as "createdAt",
         updated_at as "updatedAt"`,
      [name, type, content, JSON.stringify(meta), JSON.stringify(valves), isActive, isGlobal, id, tenantId]
    );

    return result.rows[0] ?? null;
  }

  public async delete(id: string, tenantId: string): Promise<boolean> {
    const result = await this.db.query(`DELETE FROM functions WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (result.rowCount ?? 0) > 0;
  }
}
