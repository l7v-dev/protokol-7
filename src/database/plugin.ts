import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config/env.js';
import { Database } from './client.js';

export async function registerDatabase(
  app: FastifyInstance,
  config: Pick<AppConfig, 'databaseUrl' | 'dbPoolMax' | 'dbConnectTimeoutMs'>
): Promise<void> {
  const database = new Database(config);
  app.decorate('database', database);

  app.addHook('onClose', async () => {
    await database.close();
  });

  app.get('/health/database', async (request, reply) => {
    try {
      await database.healthCheck();
      return reply.code(200).send({
        data: {
          status: 'ready',
          check: 'postgres'
        }
      });
    } catch (error) {
      request.log.error({ err: error }, 'Database health check failed');
      return reply.code(503).send({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          category: 'DEPENDENCY',
          message: 'Database kullanılamıyor.',
          requestId: request.id,
          retryable: true,
          severity: 'ERROR'
        }
      });
    }
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    database: Database;
  }
}
