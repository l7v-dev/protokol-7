import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

describe('resource routes', () => {
  it('rejects invalid project input before persistence', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { description: 'missing name' }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        retryable: false
      }
    });

    await app.close();
  });

  it('rejects non-http target URLs by policy before persistence', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/project_1/targets',
      payload: {
        name: 'Unsupported target',
        seedUrl: 'ftp://example.com/file.txt'
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: 'TARGET_PROTOCOL_NOT_ALLOWED',
        category: 'POLICY',
        retryable: false
      }
    });

    await app.close();
  });

  it.each([
    ['http://127.0.0.1:8080/admin', 'PRIVATE_TARGET_BLOCKED'],
    ['http://10.0.0.10/internal', 'PRIVATE_TARGET_BLOCKED'],
    ['http://169.254.169.254/latest/meta-data', 'PRIVATE_TARGET_BLOCKED'],
    ['https://user:password@example.com/data', 'TARGET_CREDENTIALS_IN_URL']
  ])('rejects unsafe target %s before persistence', async (seedUrl, code) => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/project_1/targets',
      payload: {
        name: 'Unsafe target',
        seedUrl
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code,
        category: 'POLICY',
        retryable: false
      }
    });

    await app.close();
  });

  it('rejects schema input without fields', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/project_1/schemas',
      payload: { name: 'product' }
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

  it('rejects invalid schema field contracts before persistence', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/project_1/schemas',
      payload: {
        name: 'product',
        fields: { access_token: { type: 'string', required: true } }
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'SCHEMA_DEFINITION_INVALID', category: 'VALIDATION', retryable: false }
    });

    await app.close();
  });
});
