import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('automations API endpoints', () => {
  it('creates, lists, runs, toggles, fetches runs and deletes scheduled scraping automations', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. Create automation
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/automations/create',
      payload: {
        name: 'Günlük Trendyol Fiyat Takibi',
        data: {
          prompt: 'Trendyol üzerinde akıllı saat fiyatlarını tara ve özet çıkar.',
          model_id: 'default',
          rrule: 'FREQ=DAILY;BYHOUR=8;BYMINUTE=30'
        },
        meta: {
          system_prompt: 'Fiyat değişikliklerini özellikle vurgula.'
        },
        is_active: true
      }
    });

    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('Günlük Trendyol Fiyat Takibi');
    expect(created.is_active).toBe(true);

    // 2. List automations
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/automations/list'
    });
    expect(listRes.statusCode).toBe(200);
    const listData = listRes.json();
    expect(listData.total).toBeGreaterThanOrEqual(1);
    expect(listData.items.some((a: { id: string }) => a.id === created.id)).toBe(true);

    // 3. Toggle automation
    const toggleRes = await app.inject({
      method: 'POST',
      url: `/api/v1/automations/${created.id}/toggle`
    });
    expect(toggleRes.statusCode).toBe(200);
    expect(toggleRes.json().is_active).toBe(false);

    // 4. Run automation
    const runRes = await app.inject({
      method: 'POST',
      url: `/api/v1/automations/${created.id}/run`
    });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().status).toBe(true);
    expect(runRes.json().run).toBeDefined();

    // 5. Get runs
    const runsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/automations/${created.id}/runs`
    });
    expect(runsRes.statusCode).toBe(200);
    const runs = runsRes.json();
    expect(runs.length).toBeGreaterThanOrEqual(1);

    // 6. Delete automation
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/automations/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
