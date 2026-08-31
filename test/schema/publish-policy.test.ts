import { describe, expect, it } from 'vitest';

import { evaluateSchemaPublishPolicy, SchemaPublishPolicyError } from '../../src/schema/publish-policy.js';
import type { SchemaQualityReport } from '../../src/schema/quality.js';

function report(overrides: Partial<SchemaQualityReport> = {}): SchemaQualityReport {
  return {
    tenantId: 'tenant_1',
    projectId: 'project_1',
    schemaId: 'schema_product',
    schemaName: 'product',
    schemaVersion: 1,
    schemaFingerprintSha256: 'a'.repeat(64),
    validationValid: true,
    qualityScorePercent: 90,
    totalWeight: 3,
    earnedWeight: 2.7,
    summary: { totalFields: 3, validFields: 3, optionalMissingFields: 0, invalidFields: 0, extractionErrorFields: 0, redactedFields: 0 },
    fields: [],
    ...overrides
  };
}

const strictPolicy = {
  minimumQualityScorePercent: 80,
  minimumValidRecords: 2,
  maxInvalidRatioPercent: 25,
  allowPartialResults: false
};

describe('evaluateSchemaPublishPolicy', () => {
  it('allows publish only when valid-record, invalid-ratio and per-record quality thresholds all pass', () => {
    const decision = evaluateSchemaPublishPolicy([report(), report({ qualityScorePercent: 80 })], strictPolicy);

    expect(decision.status).toBe('PUBLISH_ALLOWED');
    expect(decision.reasons).toEqual([]);
    expect(decision.summary).toEqual({
      totalRecords: 2,
      validRecords: 2,
      invalidRecords: 0,
      invalidRatioPercent: 0,
      averageQualityScorePercent: 85,
      recordsAtOrAboveQualityThreshold: 2
    });
  });

  it('allows a clearly labeled partial result only when enough valid high-quality records remain', () => {
    const decision = evaluateSchemaPublishPolicy([
      report(),
      report({ validationValid: false, qualityScorePercent: 25 })
    ], { ...strictPolicy, minimumValidRecords: 1, maxInvalidRatioPercent: 0, allowPartialResults: true });

    expect(decision.status).toBe('PARTIAL_ALLOWED');
    expect(decision.reasons).toEqual(['INVALID_RATIO_EXCEEDED']);
    expect(decision.summary).toMatchObject({ validRecords: 1, invalidRecords: 1, invalidRatioPercent: 50, recordsAtOrAboveQualityThreshold: 1 });
  });

  it('blocks empty, insufficient or policy-disabled partial result sets without exposing records', () => {
    expect(evaluateSchemaPublishPolicy([], strictPolicy)).toMatchObject({ status: 'PUBLISH_BLOCKED', reasons: ['NO_RECORDS'] });
    const belowThreshold = evaluateSchemaPublishPolicy([report({ qualityScorePercent: 79 })], strictPolicy);
    expect(belowThreshold).toMatchObject({
      status: 'PUBLISH_BLOCKED',
      reasons: expect.arrayContaining(['MINIMUM_VALID_RECORDS_NOT_MET', 'QUALITY_BELOW_THRESHOLD', 'PARTIAL_RESULTS_DISABLED'])
    });
    expect(JSON.stringify(belowThreshold)).not.toContain('rawValue');
  });

  it('rejects invalid policy input and quality reports from different schema snapshots', () => {
    expect(() => evaluateSchemaPublishPolicy([report()], { ...strictPolicy, minimumQualityScorePercent: 101 })).toThrow(SchemaPublishPolicyError);
    expect(() => evaluateSchemaPublishPolicy([report(), report({ schemaFingerprintSha256: 'b'.repeat(64) })], strictPolicy)).toThrow(SchemaPublishPolicyError);
  });
});
