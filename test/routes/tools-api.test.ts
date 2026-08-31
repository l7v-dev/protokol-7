import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('tools API endpoints', () => {
  it('lists built-in agent tools and retrieves single tool by id', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. List tools
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tools'
    });

    expect(listRes.statusCode).toBe(200);
    const tools = listRes.json();
    expect(tools.length).toBeGreaterThanOrEqual(5);

    const toolIds = tools.map((t: { id: string }) => t.id);
    expect(toolIds).toContain('analyze_target');
    expect(toolIds).toContain('scrape_http');
    expect(toolIds).toContain('scrape_browser');
    expect(toolIds).toContain('extract_structured_data');
    expect(toolIds).toContain('export_dataset');

    // 2. Get tool by id
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/v1/tools/id/analyze_target'
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().name).toBe('analyze_target');

    await app.close();
  });
});
