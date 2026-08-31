import type { FastifyInstance } from 'fastify';

import type { MetricsRegistry } from '../shared/metrics.js';

export async function registerObservability(
  app: FastifyInstance,
  metrics: MetricsRegistry
): Promise<void> {
  app.decorateRequest('startedAtMs', 0);

  app.addHook('onRequest', async (request) => {
    request.startedAtMs = Date.now();
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unknown';
    const statusClass = `${Math.floor(reply.statusCode / 100)}xx`;
    const durationMs = Date.now() - request.startedAtMs;

    metrics.increment('http_requests_total', `${request.method}:${route}:${statusClass}`);
    if (reply.statusCode >= 500) {
      metrics.increment('http_request_errors_total', `${request.method}:${route}:${statusClass}`);
    }

    request.log.info(
      {
        requestId: request.id,
        route,
        method: request.method,
        statusCode: reply.statusCode,
        statusClass,
        durationMs,
        tenantId: request.authContext?.tenantId
      },
      'request completed'
    );
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    startedAtMs: number;
  }
}
