import type { FastifyInstance } from 'fastify';

export function registerAuthContextRoute(app: FastifyInstance): void {
  app.get('/auth/context', async (request, reply) => {
    const context = request.authContext;

    if (!context) {
      return reply.code(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Kimlik doğrulama gerekli.',
          requestId: request.id,
          retryable: false
        }
      });
    }

    return reply.code(200).send({
      data: {
        actorId: context.actorId,
        actorType: context.actorType,
        tenantId: context.tenantId,
        roles: context.roles,
        scopes: context.scopes
      }
    });
  });
}
