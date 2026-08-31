import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('memories API endpoints', () => {
  it('adds, lists, queries, updates and deletes long-term agent memories', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. Add memory
    const addRes = await app.inject({
      method: 'POST',
      url: '/api/v1/memories/add',
      payload: {
        content: 'Trendyol sitesinde sadece 4 yıldız ve üzeri ürünleri filtrele.'
      }
    });

    expect(addRes.statusCode).toBe(200);
    const added = addRes.json();
    expect(added.id).toBeDefined();
    expect(added.content).toBe('Trendyol sitesinde sadece 4 yıldız ve üzeri ürünleri filtrele.');

    // 2. List memories
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/memories/'
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.some((m: { id: string }) => m.id === added.id)).toBe(true);

    // 3. Query memories
    const queryRes = await app.inject({
      method: 'POST',
      url: '/api/v1/memories/query',
      payload: {
        content: 'Trendyol filtreleme'
      }
    });
    expect(queryRes.statusCode).toBe(200);
    const queryResults = queryRes.json();
    expect(queryResults.length).toBeGreaterThanOrEqual(1);
    expect(queryResults[0].id).toBe(added.id);

    // 4. Update memory
    const updateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/memories/${added.id}/update`,
      payload: {
        content: 'Trendyol sitesinde 4.5 ve üzeri ürünleri filtrele.'
      }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().content).toBe('Trendyol sitesinde 4.5 ve üzeri ürünleri filtrele.');

    // 5. Delete memory
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/memories/${added.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
