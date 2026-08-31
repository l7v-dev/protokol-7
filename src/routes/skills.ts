import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { SkillService } from '../services/skill-service.js';
import { ApiError, sendApiError } from '../shared/http.js';

const skillCreateSchema = z.object({
  name: z.string().min(1, 'Beceri adı zorunludur.'),
  description: z.string().optional(),
  content: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  is_active: z.boolean().optional()
});

export function registerSkillRoutes(app: FastifyInstance, skillService: SkillService): void {
  // GET /skills/ or /skills
  const listSkillsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const query = (request.query as { query?: string }) || {};

    const skills = await skillService.listSkills(tenantId, query.query);
    return reply.code(200).send(skills);
  };

  // GET /skills/list (paginated format)
  const listSkillsPaginatedHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const query = (request.query as { query?: string }) || {};

    const skills = await skillService.listSkills(tenantId, query.query);
    return reply.code(200).send({ items: skills, total: skills.length });
  };

  // POST /skills/create
  const createSkillHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_anonymous';
    const tenantId = context?.tenantId || 'tenant_default';

    const parseResult = skillCreateSchema.safeParse(request.body || {});
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

    const createDto: {
      name: string;
      description?: string;
      content?: string;
      meta?: Record<string, unknown>;
      is_active?: boolean;
    } = {
      name: parseResult.data.name
    };
    if (parseResult.data.description !== undefined) createDto.description = parseResult.data.description;
    if (parseResult.data.content !== undefined) createDto.content = parseResult.data.content;
    if (parseResult.data.meta !== undefined) createDto.meta = parseResult.data.meta;
    if (parseResult.data.is_active !== undefined) createDto.is_active = parseResult.data.is_active;

    const created = await skillService.createSkill(userId, tenantId, createDto);
    return reply.code(200).send(created);
  };

  // GET /skills/id/:id
  const getSkillByIdHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const skill = await skillService.getSkillById(tenantId, params.id);
    if (!skill) {
      return sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 404,
          code: 'SKILL_NOT_FOUND',
          category: 'VALIDATION',
          message: 'Beceri bulunamadı.',
          retryable: false
        })
      );
    }

    return reply.code(200).send(skill);
  };

  // DELETE /skills/id/:id
  const deleteSkillHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const tenantId = context?.tenantId || 'tenant_default';
    const params = request.params as { id: string };

    const deleted = await skillService.deleteSkill(tenantId, params.id);
    return reply.code(200).send({ status: deleted, message: deleted ? 'Beceri silindi.' : 'Bulunamadı.' });
  };

  // Register routes
  app.get('/skills', listSkillsHandler);
  app.get('/skills/', listSkillsHandler);
  app.get('/skills/list', listSkillsPaginatedHandler);
  app.post('/skills/create', createSkillHandler);
  app.get('/skills/id/:id', getSkillByIdHandler);
  app.delete('/skills/id/:id', deleteSkillHandler);
  app.delete('/skills/id/:id/delete', deleteSkillHandler);
}
