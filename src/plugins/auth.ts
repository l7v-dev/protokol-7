import type { FastifyInstance } from 'fastify';

import type { AuthContext, AuthContextResolver } from '../shared/auth.js';
import { ApiError, sendApiError } from '../shared/http.js';

const publicPaths = [
  '/health',
  '/config',
  '/api/config',
  '/api/v1/config'
];

const publicPrefixes = [
  '/health/',
  '/auth/signin',
  '/auth/signup',
  '/auths/signin',
  '/auths/signup',
  '/api/v1/auth/signin',
  '/api/v1/auth/signup',
  '/api/v1/auths/signin',
  '/api/v1/auths/signup'
];

export async function registerAuth(
  app: FastifyInstance,
  resolver: AuthContextResolver
): Promise<void> {
  app.decorateRequest('authContext', null);

  app.addHook('onRequest', async (request, reply) => {
    const url = request.url.split('?')[0] || request.url;
    const isPublic = publicPaths.includes(url) || publicPrefixes.some((prefix) => url.startsWith(prefix));

    const context = resolver.resolve(request);
    request.authContext = context;

    if (!context && !isPublic) {
      sendApiError(
        request,
        reply,
        new ApiError({
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          category: 'AUTH',
          message: 'Kimlik doğrulama gerekli.',
          retryable: false
        })
      );
      return;
    }
  });
}

declare module 'fastify' {
  interface FastifyRequest {
    authContext: AuthContext | null;
  }
}
