import { describe, expect, it } from 'vitest';
import { AgentToolExecutor } from '../../src/agent/executor.js';

describe('agent tool executor', () => {
  const executor = new AgentToolExecutor();

  it('analyzes target website and recommends appropriate engine and proxy', async () => {
    const res = await executor.execute('analyze_target', {
      url: 'https://www.trendyol.com/kadin-ayakkabi-c-103'
    });

    expect(res.success).toBe(true);
    expect(res.output['is_spa']).toBe(true);
    expect(res.output['recommended_engine']).toBe('browser');
    expect(res.output['recommended_proxy_tier']).toBe('residential');
  });

  it('analyzes standard target and recommends fast HTTP engine', async () => {
    const res = await executor.execute('analyze_target', {
      url: 'https://example.com/blog/article'
    });

    expect(res.success).toBe(true);
    expect(res.output['is_spa']).toBe(false);
    expect(res.output['recommended_engine']).toBe('http');
  });

  it('executes browser scrape simulation and returns rendered DOM', async () => {
    const res = await executor.execute('scrape_browser', {
      url: 'https://example.com/products',
      wait_for_selector: '.product-card'
    });

    expect(res.success).toBe(true);
    expect(res.output['engine']).toBe('playwright_chromium');
    expect(String(res.output['html_content'])).toContain('product-card');
  });

  it('extracts structured data from HTML content', async () => {
    const html = `
      <div class="product-card">
        <h2 class="title">Laptop Çantası</h2>
        <span class="price">₺450,00</span>
        <span class="rating">4.7</span>
      </div>
    `;

    const res = await executor.execute('extract_structured_data', {
      html,
      fields: [{ name: 'title' }, { name: 'price' }, { name: 'rating' }]
    });

    expect(res.success).toBe(true);
    const items = res.output['items'] as Record<string, unknown>[];
    expect(items.length).toBe(1);
    expect(items[0]?.title).toBe('Laptop Çantası');
    expect(items[0]?.price).toBe('₺450,00');
  });

  it('exports extracted data to CSV and JSON formats', async () => {
    const data = [
      { name: 'Ürün 1', price: 100 },
      { name: 'Ürün 2', price: 200 }
    ];

    const jsonRes = await executor.execute('export_dataset', { data, format: 'json' });
    expect(jsonRes.success).toBe(true);
    expect(jsonRes.output['row_count']).toBe(2);

    const csvRes = await executor.execute('export_dataset', { data, format: 'csv' });
    expect(csvRes.success).toBe(true);
    expect(csvRes.output['format']).toBe('csv');
    expect(String(csvRes.output['preview_table'])).toContain('Ürün 1');
  });
});
