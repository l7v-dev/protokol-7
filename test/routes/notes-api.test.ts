import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('notes API endpoints', () => {
  it('creates, lists, searches, updates and deletes research notes', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. Create note
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/notes/create',
      payload: {
        title: 'Amazon Scraping Araştırma Notları',
        data: {
          content: 'Bot korumasını geçmek için Playwright + Residential Proxy şart.'
        }
      }
    });

    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Amazon Scraping Araştırma Notları');

    // 2. List notes
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/notes/'
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.some((n: { id: string }) => n.id === created.id)).toBe(true);

    // 3. Search notes
    const searchRes = await app.inject({
      method: 'GET',
      url: '/api/v1/notes/search?query=Amazon'
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json().items.length).toBeGreaterThanOrEqual(1);

    // 4. Update note
    const updateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/notes/${created.id}/update`,
      payload: {
        title: 'Amazon Scraping Araştırma Notları (Tamamlandı)'
      }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().title).toBe('Amazon Scraping Araştırma Notları (Tamamlandı)');

    // 5. Delete note
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/notes/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
