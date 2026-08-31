import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('groups API endpoints', () => {
  it('lists default groups, creates custom group, fetches by id and deletes group', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. List groups (contains default groups)
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/groups/'
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(1);

    // 2. Create custom group
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/groups/create',
      payload: {
        name: 'Veri Kazıma Mühendisleri',
        description: 'Büyük ölçekli e-ticaret sitelerini kazıyan mühendislik grubu'
      }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Veri Kazıma Mühendisleri');

    // 3. Get group by id
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/groups/id/${created.id}`
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('Veri Kazıma Mühendisleri');

    // 4. Delete group
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/groups/id/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
