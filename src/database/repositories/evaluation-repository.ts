import { randomUUID } from 'node:crypto';
import type { Database } from '../client.js';

export type EvaluationRecord = {
  id: string;
  userId: string;
  tenantId: string;
  modelId: string;
  rating: number;
  feedback: string;
  dataJson: Record<string, unknown>;
  createdAt: Date;
};

export type CreateEvaluationInput = {
  id?: string;
  userId: string;
  tenantId: string;
  modelId: string;
  rating?: number;
  feedback?: string;
  data?: Record<string, unknown>;
};

export class EvaluationRepository {
  public constructor(private readonly db: Database) {}

  public async create(input: CreateEvaluationInput): Promise<EvaluationRecord> {
    const id = input.id || randomUUID();
    const result = await this.db.query<EvaluationRecord>(
      `INSERT INTO evaluations (id, user_id, tenant_id, model_id, rating, feedback, data_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         model_id as "modelId",
         rating,
         feedback,
         data_json as "dataJson",
         created_at as "createdAt"`,
      [
        id,
        input.userId,
        input.tenantId,
        input.modelId,
        input.rating ?? 5,
        input.feedback || '',
        JSON.stringify(input.data ?? {})
      ]
    );

    return result.rows[0]!;
  }

  public async listByTenant(tenantId: string): Promise<EvaluationRecord[]> {
    const result = await this.db.query<EvaluationRecord>(
      `SELECT 
         id,
         user_id as "userId",
         tenant_id as "tenantId",
         model_id as "modelId",
         rating,
         feedback,
         data_json as "dataJson",
         created_at as "createdAt"
       FROM evaluations
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    );

    return result.rows;
  }
}
