import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('models API endpoints', () => {
  it('returns default Protokol-7 built-in agents on GET /api/v1/models and GET /api/models', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res1 = await app.inject({
      method: 'GET',
      url: '/api/v1/models'
    });

    expect(res1.statusCode).toBe(200);
    const body1 = res1.json();
    expect(body1.data).toBeDefined();
    expect(body1.data.length).toBeGreaterThanOrEqual(4);

    const modelIds = body1.data.map((m: { id: string }) => m.id);
    expect(modelIds).toContain('protokol7/extractor-ai');
    expect(modelIds).toContain('protokol7/crawler-agent');
    expect(modelIds).toContain('protokol7/browser-playwright');
    expect(modelIds).toContain('protokol7/schema-validator');

    // Test direct /api/models alias
    const res2 = await app.inject({
      method: 'GET',
      url: '/api/models'
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().data.length).toBeGreaterThanOrEqual(4);

    await app.close();
  });

  it('returns base models and tags for workspace configuration', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const baseRes = await app.inject({
      method: 'GET',
      url: '/api/v1/models/base'
    });
    expect(baseRes.statusCode).toBe(200);
    expect(Array.isArray(baseRes.json())).toBe(true);

    const tagsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/models/tags'
    });
    expect(tagsRes.statusCode).toBe(200);
    const tags = tagsRes.json() as { name: string }[];
    const tagNames = tags.map((t) => t.name);
    expect(tagNames).toContain('extractor');
    expect(tagNames).toContain('crawler');

    await app.close();
  });

  it('retrieves single model by id', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/models/model?id=protokol7/extractor-ai'
    });

    expect(res.statusCode).toBe(200);
    const model = res.json();
    expect(model.id).toBe('protokol7/extractor-ai');
    expect(model.name).toBe('Protokol-7 AI Extractor');
    expect(model.info.meta.capabilities.scraping).toBe(true);

    await app.close();
  });
});
