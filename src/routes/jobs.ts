import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import {
  IdempotencyConflictError,
  JobResourceMismatchError,
  JobResourceNotFoundError,
  JobResourceNotReadyError,
  type JobService
} from '../services/job-service.js';
import { requireScope } from '../shared/authz.js';
import { ApiError } from '../shared/http.js';

const idSchema = z.string().trim().min(1).max(200);
const jobInputSchema = z.record(z.unknown()).default({});

function requiredIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const value = request.headers['idempotency-key']?.toString().trim();
  if (!value) {
    throw new ApiError({
      statusCode: 400,
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      category: 'VALIDATION',
      message: 'Bu command için Idempotency-Key zorunludur.',
      retryable: false
    });
  }

  return value;
}

function jobResponse(job: Awaited<ReturnType<JobService['find']>>) {
  if (!job) {
    return null;
  }

  return {
    type: 'job',
    id: job.id,
    attributes: {
      tenantId: job.tenantId,
      projectId: job.projectId,
      targetId: job.targetId,
      schemaId: job.schemaId,
      status: job.status,
      triggerType: job.triggerType,
      input: job.input,
      targetSnapshot: job.targetSnapshot,
      schemaSnapshot: job.schemaSnapshot,
      progress: job.progress,
      qualitySummary: job.qualitySummary,
      costSummary: job.costSummary,
      createdBy: job.createdBy,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt
    }
  };
}

function mapJobError(error: unknown): never {
  if (error instanceof IdempotencyConflictError) {
    throw new ApiError({
      statusCode: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      category: 'DATA',
      message: 'Idempotency-Key farklı bir request ile daha önce kullanılmış.',
      retryable: false
    });
  }

  if (error instanceof JobResourceMismatchError) {
    throw new ApiError({
      statusCode: 422,
      code: 'JOB_RESOURCE_MISMATCH',
      category: 'VALIDATION',
      message: 'Project, Target ve Schema aynı tenant/project scope içinde değil.',
      retryable: false
    });
  }

  if (error instanceof JobResourceNotReadyError) {
    throw new ApiError({
      statusCode: 422,
      code: error.resource === 'target' ? 'TARGET_NOT_ACTIVE' : 'SCHEMA_NOT_PUBLISHED',
      category: 'VALIDATION',
      message: error.message,
      retryable: false,
      details: [{ reason: `actual_status:${error.actualStatus};required_status:${error.requiredStatus}` }]
    });
  }

  if (error instanceof JobResourceNotFoundError) {
    throw new ApiError({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      category: 'VALIDATION',
      message: 'Job için gereken kaynak bulunamadı.',
      retryable: false,
      details: [{ reason: error.message }]
    });
  }

  throw error;
}

export function registerJobRoutes(app: FastifyInstance, service: JobService): void {
  app.post('/jobs', async (request, reply) => {
    const context = requireScope(request.authContext, 'job:create');
    const idempotencyKey = requiredIdempotencyKey(request);
    const parsed = z.object({
      projectId: idSchema,
      targetId: idSchema,
      schemaId: idSchema,
      input: jobInputSchema
    }).safeParse(request.body);

    if (!parsed.success) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Job create request doğrulanamadı.',
        retryable: false,
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'request',
          reason: issue.code
        }))
      });
    }

    try {
      const result = await service.create({
        tenantId: context.tenantId,
        projectId: parsed.data.projectId,
        targetId: parsed.data.targetId,
        schemaId: parsed.data.schemaId,
        triggerType: 'API',
        input: parsed.data.input ?? {},
        createdBy: context.actorId,
        idempotencyKey,
        correlationId: request.id
      });

      return reply.code(result.replayed ? 200 : 202).send({
        data: jobResponse(result.job),
        meta: {
          requestId: request.id,
          replayed: result.replayed,
          commandAccepted: true
        }
      });
    } catch (error) {
      mapJobError(error);
    }
  });

  app.get('/jobs/:jobId', async (request, reply) => {
    const context = requireScope(request.authContext, 'job:read');
    const params = z.object({ jobId: idSchema }).safeParse(request.params);
    if (!params.success) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Job ID doğrulanamadı.',
        retryable: false
      });
    }

    const job = await service.find(context.tenantId, params.data.jobId);
    if (!job) {
      throw new ApiError({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Job bulunamadı.',
        retryable: false
      });
    }

    return reply.send({ data: jobResponse(job), meta: { requestId: request.id } });
  });

  app.post('/jobs/:jobId/cancel', async (request, reply) => {
    const context = requireScope(request.authContext, 'job:cancel');
    const idempotencyKey = requiredIdempotencyKey(request);
    const params = z.object({ jobId: idSchema }).safeParse(request.params);
    if (!params.success) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Job ID doğrulanamadı.',
        retryable: false
      });
    }

    const result = await service.cancel(context.tenantId, params.data.jobId, request.id, idempotencyKey);
    if (!result) {
      throw new ApiError({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Job bulunamadı.',
        retryable: false
      });
    }

    if (!result.transitioned) {
      throw new ApiError({
        statusCode: 409,
        code: 'INVALID_STATE_TRANSITION',
        category: 'EXECUTION',
        message: `Job ${result.job.status} durumundan CANCEL_REQUESTED durumuna geçirilemez.`,
        retryable: false
      });
    }

    return reply.code(result.replayed ? 200 : 202).send({
      data: jobResponse(result.job),
      meta: { requestId: request.id, replayed: result.replayed, commandAccepted: true }
    });
  });

  app.post('/jobs/:jobId/retry', async (request, reply) => {
    const context = requireScope(request.authContext, 'job:retry');
    const idempotencyKey = requiredIdempotencyKey(request);
    const params = z.object({ jobId: idSchema }).safeParse(request.params);
    if (!params.success) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Job ID doğrulanamadı.',
        retryable: false
      });
    }

    const result = await service.retry(context.tenantId, params.data.jobId, request.id, idempotencyKey);
    if (!result) {
      throw new ApiError({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Job bulunamadı.',
        retryable: false
      });
    }

    if (!result.transitioned) {
      throw new ApiError({
        statusCode: 409,
        code: 'INVALID_STATE_TRANSITION',
        category: 'EXECUTION',
        message: `Job ${result.job.status} durumundan RETRYING durumuna geçirilemez.`,
        retryable: false
      });
    }

    return reply.code(result.replayed ? 200 : 202).send({
      data: jobResponse(result.job),
      meta: { requestId: request.id, replayed: result.replayed, commandAccepted: true }
    });
  });
}
