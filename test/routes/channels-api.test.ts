import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('channels API endpoints', () => {
  it('lists default channels, creates custom channel, posts messages, fetches messages and deletes channel', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. List channels (contains default general channel)
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/channels/'
    });
    expect(listRes.statusCode).toBe(200);
    const list = listRes.json();
    expect(list.length).toBeGreaterThanOrEqual(1);

    // 2. Create custom channel
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/create',
      payload: {
        name: 'E-Ticaret Kazıma Alarmları',
        type: 'alerts'
      }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.id).toBeDefined();
    expect(created.name).toBe('E-Ticaret Kazıma Alarmları');

    // 3. Post message to channel
    const msgRes = await app.inject({
      method: 'POST',
      url: `/api/v1/channels/${created.id}/messages`,
      payload: {
        content: 'Trendyol üzerinde 1.200 ürün başarıyla çekildi.'
      }
    });
    expect(msgRes.statusCode).toBe(200);
    expect(msgRes.json().content).toBe('Trendyol üzerinde 1.200 ürün başarıyla çekildi.');

    // 4. Get channel messages
    const getMsgsRes = await app.inject({
      method: 'GET',
      url: `/api/v1/channels/${created.id}/messages`
    });
    expect(getMsgsRes.statusCode).toBe(200);
    const messages = getMsgsRes.json();
    expect(messages.length).toBe(1);

    // 5. Delete channel
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/channels/${created.id}`
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe(true);

    await app.close();
  });
});
