import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('files API endpoints', () => {
  it('uploads, parses seed URLs, retrieves and deletes a file', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    // 1. Upload file with seed URLs
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/v1/files',
      payload: {
        filename: 'seed_targets.txt',
        text: 'https://example.com/page1\nhttps://example.com/page2\nhttps://example.com/page3',
        metadata: { purpose: 'crawler_seed' }
      }
    });

    expect(uploadRes.statusCode).toBe(200);
    const uploaded = uploadRes.json();
    expect(uploaded.id).toBeDefined();
    expect(uploaded.filename).toBe('seed_targets.txt');
    expect(uploaded.data.total_seed_urls).toBe(3);
    expect(uploaded.data.seed_urls).toContain('https://example.com/page1');

    const fileId = uploaded.id;

    // 2. List files
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/files?content=true'
    });
    expect(listRes.statusCode).toBe(200);
    const fileList = listRes.json();
    expect(fileList.length).toBeGreaterThanOrEqual(1);

    // 3. Count files
    const countRes = await app.inject({
      method: 'GET',
      url: '/api/v1/files/count'
    });
    expect(countRes.statusCode).toBe(200);
    expect(countRes.json().count).toBeGreaterThanOrEqual(1);

    // 4. Get file by id
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}`
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().filename).toBe('seed_targets.txt');

    // 5. Get file raw content
    const contentRes = await app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/content`
    });
    expect(contentRes.statusCode).toBe(200);
    expect(contentRes.body).toContain('https://example.com/page1');

    // 6. Get file process status (SSE)
    const statusRes = await app.inject({
      method: 'GET',
      url: `/api/v1/files/${fileId}/process/status`
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.headers['content-type']).toContain('text/event-stream');
    expect(statusRes.body).toContain('[DONE]');

    // 7. Delete file
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${fileId}`
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().status).toBe(true);

    await app.close();
  });
});
