import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config/env.js';

export function registerHealthRoutes(app: FastifyInstance, config: AppConfig): void {
  app.get('/health/live', async (_request, reply) => {
    return reply.code(200).send({
      data: {
        status: 'ok',
        service: config.serviceName,
        environment: config.nodeEnv
      }
    });
  });

  app.get('/health/ready', async (_request, reply) => {
    return reply.code(200).send({
      data: {
        status: 'ready',
        checks: {
          process: 'ok'
        }
      }
    });
  });
}
