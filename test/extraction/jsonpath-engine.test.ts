import { describe, expect, it } from 'vitest';

import { JSONPATH_SELECTOR_ENGINE_EXECUTION_BOUNDARY, JsonPathSelectorEngine, JsonPathSelectorError } from '../../src/extraction/jsonpath-engine.js';
import { ExtractionPlanRegistry, type ExtractionPlanDraft } from '../../src/extraction/plan.js';

const apiFixture = {
  data: {
    products: [
      { id: 'p_1', name: 'Trail Jacket', price: 129.99, tags: ['outdoor', 'waterproof'] },
      { id: 'p_2', name: 'Rain Shell', price: 89.5, tags: ['outdoor'] }
    ],
    note: 'Bearer should-be-redacted'
  }
};

function plan(fields: ExtractionPlanDraft['fields']) {
  return new ExtractionPlanRegistry(() => new Date('2026-08-26T00:00:00.000Z')).register({
    tenantId: 'tenant_1', projectId: 'project_1', planId: 'api_plan', sourceKind: 'JSON', createdBy: 'user_1', fields
  });
}

describe('JsonPathSelectorEngine', () => {
  it('declares a local-fixture execution boundary and rejects unsafe engine limits before evaluating source', () => {
    const engine = new JsonPathSelectorEngine();
    expect(engine.executionBoundary).toEqual(JSONPATH_SELECTOR_ENGINE_EXECUTION_BOUNDARY);
    expect(engine.executionBoundary).not.toBe(JSONPATH_SELECTOR_ENGINE_EXECUTION_BOUNDARY);
    expect(() => new JsonPathSelectorEngine({ maxSourceBytes: 0 })).toThrow(JsonPathSelectorError);
    expect(() => new JsonPathSelectorEngine({ maxMatchesPerField: 1.5 })).toThrow(JsonPathSelectorError);
    try {
      new JsonPathSelectorEngine({ maxSourceBytes: 0 });
    } catch (error) {
      expect((error as JsonPathSelectorError).code).toBe('JSONPATH_SELECTOR_ENGINE_OPTIONS_INVALID');
    }
  });

  it('extracts deterministic API fields, indexes and wildcard values', () => {
    const result = new JsonPathSelectorEngine().extract(plan([
      { fieldId: 'firstName', outputKey: 'firstName', selectorKind: 'JSONPATH', selector: '$.data.products[0].name', required: true, multiple: false },
      { fieldId: 'prices', outputKey: 'prices', selectorKind: 'JSONPATH', selector: '$.data.products[*].price', required: true, multiple: true },
      { fieldId: 'ids', outputKey: 'ids', selectorKind: 'JSONPATH', selector: "$.data.products[*]['id']", required: true, multiple: true }
    ]), apiFixture);

    expect(result.fields).toEqual([
      { fieldId: 'firstName', outputKey: 'firstName', values: ['Trail Jacket'], status: 'EXTRACTED' },
      { fieldId: 'prices', outputKey: 'prices', values: ['129.99', '89.5'], status: 'EXTRACTED' },
      { fieldId: 'ids', outputKey: 'ids', values: ['p_1', 'p_2'], status: 'EXTRACTED' }
    ]);
  });

  it('bounds matching and returns safe field-level errors for missing or unsafe paths', () => {
    const result = new JsonPathSelectorEngine({ maxMatchesPerField: 1 }).extract(plan([
      { fieldId: 'missing', outputKey: 'missing', selectorKind: 'JSONPATH', selector: '$.data.absent', required: true, multiple: false },
      { fieldId: 'many', outputKey: 'many', selectorKind: 'JSONPATH', selector: '$.data.products[*].name', required: false, multiple: true },
      { fieldId: 'privateSource', outputKey: 'privateSource', selectorKind: 'JSONPATH', selector: "$.data['accessToken']", required: false, multiple: false },
      { fieldId: 'filter', outputKey: 'filter', selectorKind: 'JSONPATH', selector: '$.data.products[?(@.price > 100)]', required: false, multiple: true }
    ]), apiFixture);

    expect(result.fields).toEqual([
      { fieldId: 'missing', outputKey: 'missing', values: [], status: 'ERROR', errorCode: 'REQUIRED_FIELD_MISSING' },
      { fieldId: 'many', outputKey: 'many', values: [], status: 'ERROR', errorCode: 'MAX_MATCHES_EXCEEDED' },
      { fieldId: 'privateSource', outputKey: 'privateSource', values: [], status: 'ERROR', errorCode: 'UNSAFE_JSONPATH' },
      { fieldId: 'filter', outputKey: 'filter', values: [], status: 'ERROR', errorCode: 'UNSAFE_JSONPATH' }
    ]);
  });

  it('redacts secret-like values and rejects non-JSON plans or oversized source input', () => {
    const redacted = new JsonPathSelectorEngine().extract(plan([
      { fieldId: 'note', outputKey: 'note', selectorKind: 'JSONPATH', selector: '$.data.note', required: false, multiple: false }
    ]), apiFixture);
    expect(redacted.fields[0]).toMatchObject({ values: ['[REDACTED]'], status: 'REDACTED' });

    const htmlPlan = new ExtractionPlanRegistry().register({
      tenantId: 'tenant_1', projectId: 'project_1', planId: 'html_plan', sourceKind: 'HTML', createdBy: 'user_1',
      fields: [{ fieldId: 'name', outputKey: 'name', selectorKind: 'CSS', selector: 'h1', required: false, multiple: false }]
    });
    expect(() => new JsonPathSelectorEngine().extract(htmlPlan, apiFixture)).toThrow('JSONPath selector engine yalnız JSON plan kabul eder.');
    expect(() => new JsonPathSelectorEngine({ maxSourceBytes: 8 }).extract(plan([
      { fieldId: 'name', outputKey: 'name', selectorKind: 'JSONPATH', selector: '$.data.products[0].name', required: false, multiple: false }
    ]), apiFixture)).toThrow('JSON source boyutu extraction limitini aşıyor.');
  });
});
