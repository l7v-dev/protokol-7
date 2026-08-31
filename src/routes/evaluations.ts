import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { EvaluationService } from '../services/evaluation-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const evaluationCreateSchema = z.object({
  model_id: z.string().min(1, 'Model kimliği zorunludur.'),
  rating: z.number().optional(),
  feedback: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional()
});

export function registerEvaluationRoutes(app: FastifyInstance, evaluationService: EvaluationService): void {
  // GET /evaluations/config
  app.get('/evaluations/config', async (_req: FastifyRequest, reply: FastifyReply) => {
    const config = await evaluationService.getConfig();
    return reply.code(200).send(config);
  });

  // POST /evaluations/config
  app.post('/evaluations/config', async (request: FastifyRequest, reply: FastifyReply) => {
    const updated = await evaluationService.updateConfig((request.body as Record<string, unknown>) || {});
    return reply.code(200).send(updated);
  });

  // GET /evaluations/leaderboard
  app.get('/evaluations/leaderboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';

    const leaderboard = await evaluationService.getLeaderboard(tenantId);
    return reply.code(200).send(leaderboard);
  });

  // POST /evaluations/feedback or /evaluations/create
  const submitFeedbackHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = evaluationCreateSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          category: 'VALIDATION',
          message: parseResult.error.issues.map((i) => i.message).join('; '),
          retryable: false
        })
      );
    }

    const evalDto: { model_id: string; rating?: number; feedback?: string; data?: Record<string, unknown> } = {
      model_id: parseResult.data.model_id
    };
    if (parseResult.data.rating !== undefined) evalDto.rating = parseResult.data.rating;
    if (parseResult.data.feedback !== undefined) evalDto.feedback = parseResult.data.feedback;
    if (parseResult.data.data !== undefined) evalDto.data = parseResult.data.data;

    const created = await evaluationService.submitEvaluation(userId, tenantId, evalDto);
    return reply.code(200).send(created);
  };

  app.post('/evaluations/feedback', submitFeedbackHandler);
  app.post('/evaluations/create', submitFeedbackHandler);
}
