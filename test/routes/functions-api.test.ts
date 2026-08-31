import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('functions API endpoints', () => {
  it('lists built-in pipeline filters, creates, updates, toggles valves and deletes custom function', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. List functions (should contain built-in PII and currency normalizer filters)
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/functions/'
    });

    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((f: { id: string }) => f.id === 'filter_pii_masker')).toBe(true);

    // 2. Create custom function
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/functions/create',
      payload: {
        name: 'HTML DOM Gürültü Temizleyici',
        type: 'pipe',
        content: '# Noise Reducer\ndef pipe(body):\n    return body\n',
        valves: {
          remove_ads: true,
          remove_footers: true
        },
        is_active: true
      }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('HTML DOM Gürültü Temizleyici');

    // 3. Get function by ID
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/functions/id/${created.id}`
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('HTML DOM Gürültü Temizleyici');

    // 4. Update function valves
    const updateValvesRes = await app.inject({
      method: 'POST',
      url: `/api/v1/functions/id/${created.id}/valves/update`,
      payload: {
        remove_ads: false,
        remove_footers: true,
        remove_scripts: true
      }
    });
    expect(updateValvesRes.statusCode).toBe(200);
    expect(updateValvesRes.json().remove_scripts).toBe(true);

    // 5. Toggle function
    const toggleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/functions/id/${created.id}/toggle`
    });
    expect(toggleRes.statusCode).toBe(200);
    expect(toggleRes.json().isActive).toBe(false);

    // 6. Delete function
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/functions/id/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
