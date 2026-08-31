import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

describe('backend foundation', () => {
  it('loads typed configuration defaults', () => {
    const config = loadConfig({ NODE_ENV: 'test' });

    expect(config.nodeEnv).toBe('test');
    expect(config.port).toBe(3000);
    expect(config.serviceName).toBe('scraping-platform-api');
  });

  it('rejects invalid port configuration', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', PORT: '70000' })).toThrow('Invalid runtime configuration');
  });

  it('does not allow test or header auth in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('Production requires AUTH_MODE=external');
    expect(() => loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'header' })).toThrow('Production requires AUTH_MODE=external');
    expect(loadConfig({ NODE_ENV: 'production', AUTH_MODE: 'external' }).authMode).toBe('external');
  });

  it('serves liveness and readiness endpoints', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    const ready = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });

    expect(live.statusCode).toBe(200);
    expect(live.headers['x-request-id']).toBeDefined();
    expect(live.json()).toMatchObject({ data: { status: 'ok' } });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ data: { status: 'ready' } });

    await app.close();
  });
});
