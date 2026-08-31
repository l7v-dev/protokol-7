import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { HeaderAuthResolver, TestAuthResolver } from '../src/shared/auth.js';

describe('auth foundation', () => {
  it('resolves the development header identity without exposing a secret', () => {
    const resolver = new HeaderAuthResolver();
    const request = {
      headers: {
        'x-actor-id': 'actor_1',
        'x-tenant-id': 'tenant_1',
        'x-roles': 'operator,viewer',
        'x-scopes': 'job:create,job:read'
      }
    } as never;

    expect(resolver.resolve(request)).toEqual({
      actorId: 'actor_1',
      actorType: 'user',
      tenantId: 'tenant_1',
      roles: ['operator', 'viewer'],
      scopes: ['job:create', 'job:read']
    });
  });

  it('returns the deterministic test identity for local tests', () => {
    expect(new TestAuthResolver().resolve({} as never)).toMatchObject({
      actorId: 'actor_test',
      tenantId: 'tenant_test',
      roles: ['owner']
    });
  });

  it('rejects API requests without the configured header identity', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'header' }));
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/context' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'UNAUTHENTICATED',
        category: 'AUTH',
        retryable: false
      }
    });

    await app.close();
  });
});
