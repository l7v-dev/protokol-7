import { describe, expect, it } from 'vitest';

import { HTML_SELECTOR_ENGINE_EXECUTION_BOUNDARY, HtmlSelectorEngine, HtmlSelectorError } from '../../src/extraction/html-selector-engine.js';
import { ExtractionPlanRegistry, type ExtractionPlanDraft } from '../../src/extraction/plan.js';

const source = `
  <article class="product">
    <h1 class="title"> Trail   Jacket </h1>
    <span data-price="129.00"> $129.00 </span>
    <ul class="tags"><li>outerwear</li><li>waterproof</li></ul>
    <script>window.private = 'never extract'</script>
  </article>
`;

function plan(fields: ExtractionPlanDraft['fields']) {
  const registry = new ExtractionPlanRegistry(() => new Date('2026-08-26T00:00:00.000Z'));
  return registry.register({
    tenantId: 'tenant_1',
    projectId: 'project_1',
    planId: 'plan_1',
    sourceKind: 'HTML',
    createdBy: 'user_1',
    fields
  });
}

describe('HtmlSelectorEngine', () => {
  it('declares a local-fixture execution boundary and rejects unsafe engine limits before parsing source', () => {
    const engine = new HtmlSelectorEngine();
    expect(engine.executionBoundary).toEqual(HTML_SELECTOR_ENGINE_EXECUTION_BOUNDARY);
    expect(engine.executionBoundary).not.toBe(HTML_SELECTOR_ENGINE_EXECUTION_BOUNDARY);
    expect(() => new HtmlSelectorEngine({ maxSourceBytes: 0 })).toThrow(HtmlSelectorError);
    expect(() => new HtmlSelectorEngine({ maxMatchesPerField: 1.5 })).toThrow(HtmlSelectorError);
    try {
      new HtmlSelectorEngine({ maxSourceBytes: 0 });
    } catch (error) {
      expect((error as HtmlSelectorError).code).toBe('HTML_SELECTOR_ENGINE_OPTIONS_INVALID');
    }
  });

  it('extracts deterministic CSS and XPath values from an HTML fixture', () => {
    const result = new HtmlSelectorEngine().extract(plan([
      { fieldId: 'title', outputKey: 'title', selectorKind: 'CSS', selector: 'h1.title', required: true, multiple: false },
      { fieldId: 'price', outputKey: 'price', selectorKind: 'CSS', selector: 'span[data-price]::attr(data-price)', required: true, multiple: false },
      { fieldId: 'tags', outputKey: 'tags', selectorKind: 'XPATH', selector: "//ul[@class='tags']/li", required: true, multiple: true }
    ]), source);

    expect(result.fields).toEqual([
      { fieldId: 'title', outputKey: 'title', values: ['Trail Jacket'], status: 'EXTRACTED' },
      { fieldId: 'price', outputKey: 'price', values: ['129.00'], status: 'EXTRACTED' },
      { fieldId: 'tags', outputKey: 'tags', values: ['outerwear', 'waterproof'], status: 'EXTRACTED' }
    ]);
  });

  it('returns bounded, field-level errors without leaking selector or source content', () => {
    const result = new HtmlSelectorEngine({ maxMatchesPerField: 1 }).extract(plan([
      { fieldId: 'missing', outputKey: 'missing', selectorKind: 'CSS', selector: '.not-found', required: true, multiple: false },
      { fieldId: 'many', outputKey: 'many', selectorKind: 'CSS', selector: 'li', required: false, multiple: true },
      { fieldId: 'script', outputKey: 'scriptValue', selectorKind: 'CSS', selector: 'script', required: false, multiple: false }
    ]), source);

    expect(result.fields).toEqual([
      { fieldId: 'missing', outputKey: 'missing', values: [], status: 'ERROR', errorCode: 'REQUIRED_FIELD_MISSING' },
      { fieldId: 'many', outputKey: 'many', values: [], status: 'ERROR', errorCode: 'MAX_MATCHES_EXCEEDED' },
      { fieldId: 'script', outputKey: 'scriptValue', values: [], status: 'ERROR', errorCode: 'UNSAFE_SELECTOR_TARGET' }
    ]);
    expect(JSON.stringify(result)).not.toContain('never extract');
  });

  it('rejects non-HTML plans and redacts secret-like extracted values', () => {
    const registry = new ExtractionPlanRegistry();
    const jsonPlan = registry.register({
      tenantId: 'tenant_1', projectId: 'project_1', planId: 'json_plan', sourceKind: 'JSON', createdBy: 'user_1',
      fields: [{ fieldId: 'value', outputKey: 'value', selectorKind: 'JSONPATH', selector: '$.value', required: false, multiple: false }]
    });
    expect(() => new HtmlSelectorEngine().extract(jsonPlan, source)).toThrow('HTML selector engine yalnız HTML plan kabul eder.');

    const redacted = new HtmlSelectorEngine().extract(plan([
      { fieldId: 'public', outputKey: 'public', selectorKind: 'CSS', selector: '.token', required: false, multiple: false }
    ]), '<p class="token">Bearer never-store-this</p>');
    expect(redacted.fields[0]).toMatchObject({ values: ['[REDACTED]'], status: 'REDACTED' });
  });
});
