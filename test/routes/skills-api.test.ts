import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('skills API endpoints', () => {
  it('lists default skills, paginates skills, creates custom skill, fetches and deletes skill', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. List skills (contains built-in scraping skills)
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/skills/'
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(1);

    // 2. Paginated list
    const paginatedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/skills/list?page=1'
    });
    expect(paginatedRes.statusCode).toBe(200);
    expect(paginatedRes.json().items.length).toBeGreaterThanOrEqual(1);
    expect(paginatedRes.json().total).toBeGreaterThanOrEqual(1);

    // 3. Create custom skill
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/skills/create',
      payload: {
        name: 'JSON-LD ve Schema.org Çıkarıcı',
        description: 'E-ticaret sitelerindeki gizli JSON-LD mikro verilerini çeker.',
        content: 'def extract_json_ld(html): return []'
      }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('JSON-LD ve Schema.org Çıkarıcı');

    // 4. Get skill by id
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/skills/id/${created.id}`
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('JSON-LD ve Schema.org Çıkarıcı');

    // 5. Delete skill
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/skills/id/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
