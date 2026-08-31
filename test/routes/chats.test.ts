import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('chats API endpoints', () => {
  it('handles chat list and graceful fallback when DB is offline', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/chats'
    });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);

    await app.close();
  });

  it('rejects invalid chat creation payload with 400 validation error', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chats/new',
      payload: {
        title: 123 // invalid type
      }
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
