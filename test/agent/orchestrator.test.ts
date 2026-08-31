import { describe, expect, it } from 'vitest';
import { AgentOrchestrator } from '../../src/agent/orchestrator.js';

describe('autonomous agent orchestrator', () => {
  it('autonomously plans, selects tools, and extracts data when given a URL request', async () => {
    const orchestrator = new AgentOrchestrator();
    const statuses: string[] = [];
    const deltas: string[] = [];

    const result = await orchestrator.run(
      [
        {
          role: 'user',
          content: 'Lütfen https://example.com/products adresindeki ürünleri ve fiyatları topla.'
        }
      ],
      'protokol7/extractor-ai',
      {
        onStatus: (status) => statuses.push(status),
        onDelta: (delta) => deltas.push(delta)
      }
    );

    expect(statuses.length).toBeGreaterThanOrEqual(2);
    expect(deltas.length).toBeGreaterThan(0);
    expect(result.toolCalls.length).toBeGreaterThanOrEqual(3);

    const toolNames = result.toolCalls.map((tc) => tc.name);
    expect(toolNames).toContain('analyze_target');
    expect(toolNames).toContain('extract_structured_data');
    expect(toolNames).toContain('export_dataset');

    expect(result.content).toContain('Görev Başarıyla Tamamlandı');
    expect(result.tokensUsed.prompt).toBeGreaterThan(0);
    expect(result.tokensUsed.completion).toBeGreaterThan(0);
  });

  it('answers conversational questions explaining agent capabilities', async () => {
    const orchestrator = new AgentOrchestrator();
    const result = await orchestrator.run([
      {
        role: 'user',
        content: 'Merhaba, bana nasıl yardımcı olabilirsin?'
      }
    ]);

    expect(result.content).toContain('Protokol-7 Otonom Kazıma');
    expect(result.toolCalls.length).toBe(0);
  });
});
