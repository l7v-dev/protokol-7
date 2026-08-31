import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

describe('job command routes', () => {
  it('requires Idempotency-Key for job create', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      payload: {
        projectId: 'project_1',
        targetId: 'target_1',
        schemaId: 'schema_1'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        category: 'VALIDATION'
      }
    });

    await app.close();
  });

  it('validates job create resource references before persistence', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { 'idempotency-key': 'idem_job_1' },
      payload: {
        projectId: 'project_1',
        targetId: 'target_1'
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION'
      }
    });

    await app.close();
  });

  it('enforces job command scope for header-authenticated actors', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'header' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: {
        'x-actor-id': 'actor_1',
        'x-tenant-id': 'tenant_1',
        'x-scopes': 'project:read'
      },
      payload: {
        projectId: 'project_1',
        targetId: 'target_1',
        schemaId: 'schema_1'
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'FORBIDDEN',
        category: 'AUTH'
      }
    });

    await app.close();
  });

  it('requires Idempotency-Key for cancel command', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs/job_1/cancel'
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'IDEMPOTENCY_KEY_REQUIRED'
      }
    });

    await app.close();
  });
});
