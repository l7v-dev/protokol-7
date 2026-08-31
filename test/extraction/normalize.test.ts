import { describe, expect, it } from 'vitest';

import { EXTRACTION_NORMALIZER_EXECUTION_BOUNDARY, ExtractionNormalizer, NormalizationError } from '../../src/extraction/normalize.js';
import { ExtractionPlanError, ExtractionPlanRegistry } from '../../src/extraction/plan.js';

describe('ExtractionNormalizer', () => {
  it('declares a local-value execution boundary and rejects invalid options or bounded input before transformation', () => {
    const normalizer = new ExtractionNormalizer({ maxValues: 1, maxValueBytes: 8 });
    expect(normalizer.executionBoundary).toEqual(EXTRACTION_NORMALIZER_EXECUTION_BOUNDARY);
    expect(normalizer.executionBoundary).not.toBe(EXTRACTION_NORMALIZER_EXECUTION_BOUNDARY);
    expect(() => new ExtractionNormalizer({ maxValues: 0 })).toThrow(NormalizationError);
    expect(() => normalizer.normalize(['one', 'two'])).toThrow(NormalizationError);
    expect(() => normalizer.normalize(['too-large'])).toThrow(NormalizationError);
  });

  it('applies a deterministic transform chain and preserves raw-to-normalized lineage', () => {
    const normalizer = new ExtractionNormalizer();
    const transforms = [
      { kind: 'COLLAPSE_WHITESPACE' as const },
      { kind: 'REMOVE_CURRENCY_SYMBOL' as const },
      { kind: 'NORMALIZE_DECIMAL' as const }
    ];
    const result = normalizer.normalize(['  € 1.234,50  '], transforms);

    expect(result.transformFingerprint).toBe('COLLAPSE_WHITESPACE|REMOVE_CURRENCY_SYMBOL|NORMALIZE_DECIMAL');
    expect(result.values[0]).toEqual({
      rawValue: '  € 1.234,50  ',
      normalizedValue: '1234.50',
      redacted: false,
      steps: [
        { kind: 'COLLAPSE_WHITESPACE', input: '  € 1.234,50  ', output: '€ 1.234,50' },
        { kind: 'REMOVE_CURRENCY_SYMBOL', input: '€ 1.234,50', output: '1.234,50' },
        { kind: 'NORMALIZE_DECIMAL', input: '1.234,50', output: '1234.50' }
      ]
    });
  });

  it('is idempotent for every supported transform chain', () => {
    const normalizer = new ExtractionNormalizer();
    const transforms = [{ kind: 'COLLAPSE_WHITESPACE' as const }, { kind: 'LOWERCASE' as const }];
    const once = normalizer.normalize(['  TRAIL   JACKET  '], transforms).values[0]!.normalizedValue;
    const twice = normalizer.normalize([once], transforms).values[0]!.normalizedValue;
    expect(twice).toBe(once);
  });

  it('redacts secret-like values and rejects arbitrary transform definitions', () => {
    const normalizer = new ExtractionNormalizer();
    expect(normalizer.normalize(['Bearer must-not-persist']).values[0]).toMatchObject({
      rawValue: '[REDACTED]', normalizedValue: '[REDACTED]', redacted: true, steps: []
    });
    expect(() => normalizer.normalize(['value'], [{ kind: 'EVAL' } as never])).toThrow(NormalizationError);

    const registry = new ExtractionPlanRegistry();
    try {
      registry.register({
        tenantId: 'tenant_1', projectId: 'project_1', planId: 'invalid_transform', sourceKind: 'HTML', createdBy: 'user_1',
        fields: [{ fieldId: 'title', outputKey: 'title', selectorKind: 'CSS', selector: 'h1', required: false, multiple: false, transforms: [{ kind: 'EVAL' } as never] }]
      });
      throw new Error('Expected invalid extraction transform rejection.');
    } catch (error) {
      expect(error).toBeInstanceOf(ExtractionPlanError);
      expect((error as ExtractionPlanError).code).toBe('EXTRACTION_PLAN_INVALID');
    }
  });

  it('copies plan transform definitions into immutable plan versions', () => {
    const transforms = [{ kind: 'TRIM' as const }];
    const plan = new ExtractionPlanRegistry().register({
      tenantId: 'tenant_1', projectId: 'project_1', planId: 'with_transform', sourceKind: 'HTML', createdBy: 'user_1',
      fields: [{ fieldId: 'title', outputKey: 'title', selectorKind: 'CSS', selector: 'h1', required: true, multiple: false, transforms }]
    });
    transforms[0]!.kind = 'LOWERCASE';
    expect(plan.fields[0]!.transforms).toEqual([{ kind: 'TRIM' }]);
  });
});
