import { randomUUID } from 'node:crypto';
import type { EvaluationRepository, EvaluationRecord } from '../database/repositories/evaluation-repository.js';
import { ApiError } from '../shared/http.js';

export class EvaluationService {
  private readonly memoryEvaluations = new Map<string, EvaluationRecord>();
  private configJson: Record<string, unknown> = {
    enable_evaluations: true,
    enable_leaderboard: true
  };

  public constructor(private readonly evaluationRepository: EvaluationRepository) {}

  public async getConfig(): Promise<Record<string, unknown>> {
    return this.configJson;
  }

  public async updateConfig(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.configJson = { ...this.configJson, ...patch };
    return this.configJson;
  }

  public async submitEvaluation(
    userId: string,
    tenantId: string,
    input: {
      model_id: string;
      rating?: number;
      feedback?: string;
      data?: Record<string, unknown>;
    }
  ): Promise<EvaluationRecord> {
    const modelId = input.model_id?.trim();
    if (!modelId) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Model kimliği zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        modelId: string;
        rating?: number;
        feedback?: string;
        data?: Record<string, unknown>;
      } = {
        userId,
        tenantId,
        modelId
      };
      if (input.rating !== undefined) repoInput.rating = input.rating;
      if (input.feedback !== undefined) repoInput.feedback = input.feedback;
      if (input.data !== undefined) repoInput.data = input.data;

      const record = await this.evaluationRepository.create(repoInput);
      this.memoryEvaluations.set(record.id, record);
      return record;
    } catch {
      const id = `eval_${randomUUID()}`;
      const record: EvaluationRecord = {
        id,
        userId,
        tenantId,
        modelId,
        rating: input.rating ?? 5,
        feedback: input.feedback || '',
        dataJson: input.data ?? {},
        createdAt: new Date()
      };
      this.memoryEvaluations.set(id, record);
      return record;
    }
  }

  public async getLeaderboard(tenantId: string): Promise<Array<{ model_id: string; score: number; count: number }>> {
    let list: EvaluationRecord[] = [];
    try {
      list = await this.evaluationRepository.listByTenant(tenantId);
      for (const e of list) {
        this.memoryEvaluations.set(e.id, e);
      }
    } catch {
      list = Array.from(this.memoryEvaluations.values()).filter((e) => e.tenantId === tenantId);
    }

    const map = new Map<string, { total: number; count: number }>();
    for (const item of list) {
      const existing = map.get(item.modelId) || { total: 0, count: 0 };
      existing.total += item.rating;
      existing.count += 1;
      map.set(item.modelId, existing);
    }

    const leaderboard: Array<{ model_id: string; score: number; count: number }> = [];
    for (const [modelId, stat] of map.entries()) {
      leaderboard.push({
        model_id: modelId,
        score: parseFloat((stat.total / stat.count).toFixed(2)),
        count: stat.count
      });
    }

    return leaderboard.sort((a, b) => b.score - a.score);
  }
}
