import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('folders API endpoints', () => {
  it('creates, lists, updates and deletes a folder', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. Create folder
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/folders/',
      payload: {
        name: 'E-Ticaret Projeleri',
        is_expanded: true
      }
    });

    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('E-Ticaret Projeleri');
    expect(created.isExpanded).toBe(true);

    // 2. List folders
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/folders/'
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.some((f: { id: string }) => f.id === created.id)).toBe(true);

    // 3. Update folder name
    const updateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/folders/${created.id}/update`,
      payload: {
        name: 'E-Ticaret Projeleri (Güncel)'
      }
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().name).toBe('E-Ticaret Projeleri (Güncel)');

    // 4. Delete folder
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/folders/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
