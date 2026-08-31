import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

describe('chat completions API endpoints', () => {
  it('handles non-streaming chat completions with autonomous tool execution', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/completions',
      payload: {
        model: 'protokol7/extractor-ai',
        messages: [
          {
            role: 'user',
            content: 'https://example.com/items adresindeki ürünleri topla'
          }
        ],
        stream: false
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toMatch(/^chatcmpl-/);
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0].message.role).toBe('assistant');
    expect(body.choices[0].message.content).toContain('Görev Başarıyla Tamamlandı');
    expect(body.usage.total_tokens).toBeGreaterThan(0);

    await app.close();
  });

  it('handles streaming SSE chat completions with status and delta chunks', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'test' }));

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chat/completions',
      payload: {
        model: 'protokol7/extractor-ai',
        messages: [
          {
            role: 'user',
            content: 'Merhaba, Protokol-7 ajanları neler yapabilir?'
          }
        ],
        stream: true
      }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const sseBody = res.body;
    expect(sseBody).toContain('data:');
    expect(sseBody).toContain('[DONE]');
    expect(sseBody).toContain('chat.completion.chunk');

    await app.close();
  });
});
