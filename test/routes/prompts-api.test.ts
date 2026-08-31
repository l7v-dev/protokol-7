import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('prompts API endpoints', () => {
  it('lists built-in scraping prompts and creates custom prompt', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. List prompts
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/prompts'
    });

    expect(listRes.statusCode).toBe(200);
    const prompts = listRes.json();
    expect(prompts.length).toBeGreaterThanOrEqual(4);

    const commands = prompts.map((p: { command: string }) => p.command);
    expect(commands).toContain('scrape');
    expect(commands).toContain('analyze');
    expect(commands).toContain('crawler');
    expect(commands).toContain('schema');

    // 2. Get prompt by command
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/prompts/command/scrape'
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('Web Kazıma ve Veri Çıkarıcı');

    await app.close();
  });
});
