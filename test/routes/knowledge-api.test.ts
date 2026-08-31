import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('knowledge API endpoints', () => {
  it('lists default knowledge bases, creates, searches, updates and deletes knowledge base', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. List knowledge bases (contains default e-commerce schemas)
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/'
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((k: { name: string }) => k.name.includes('E-Ticaret'))).toBe(true);

    // 2. Create new knowledge base
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/knowledge/create',
      payload: {
        name: 'Haber Siteleri Kazıma Kuralları',
        description: 'En popüler haber portalları için makale gövdesi ve yazar ayrıştırma şablonları.'
      }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Haber Siteleri Kazıma Kuralları');

    // 3. Search knowledge bases
    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/v1/knowledge/search?query=Haber'
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().items.length).toBeGreaterThanOrEqual(1);

    // 4. Update knowledge base
    const updateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/knowledge/${created.id}/update`,
      payload: {
        description: 'Güncellenmiş haber şablonları.'
      }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().description).toBe('Güncellenmiş haber şablonları.');

    // 5. Delete knowledge base
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/knowledge/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
