import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config/env.js';
import { QueueRuntime } from './runtime.js';

export async function registerQueue(
  app: FastifyInstance,
  config: Pick<AppConfig, 'redisUrl' | 'queuePrefix'>
): Promise<void> {
  const queue = new QueueRuntime(config);
  app.decorate('queueRuntime', queue);

  app.addHook('onClose', async () => {
    await queue.close();
  });

  app.get('/health/queue', async (request, reply) => {
    try {
      await queue.healthCheck();
      return reply.code(200).send({
        data: {
          status: 'ready',
          check: 'redis'
        }
      });
    } catch (error) {
      request.log.error({ err: error }, 'Queue health check failed');
      return reply.code(503).send({
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          category: 'DEPENDENCY',
          message: 'Queue kullanılamıyor.',
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
    queueRuntime: QueueRuntime;
  }
}
