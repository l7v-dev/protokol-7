import { describe, expect, it } from 'vitest';

import { buildDiagnosticsReport } from '../../src/extraction/diagnostics.js';
import { ExtractionNormalizer } from '../../src/extraction/normalize.js';
import { ExtractionPlanRegistry } from '../../src/extraction/plan.js';
import { buildSchemaQualityReport, SchemaQualityError } from '../../src/schema/quality.js';
import { validateNormalizedRecord } from '../../src/schema/validator.js';
import { SchemaVersionRegistry } from '../../src/schema/versioning.js';

const createdAt = new Date('2026-08-27T00:00:00.000Z');
const checksum = 'a'.repeat(64);

function schema() {
  const registry = new SchemaVersionRegistry(() => createdAt);
  return registry.register({
    tenantId: 'tenant_1',
    projectId: 'project_1',
    schemaId: 'schema_product',
    name: 'product',
    createdBy: 'user_1',
    createdAt,
    definition: {
      additionalProperties: false,
      fields: {
        product_name: { type: 'string', required: true, minLength: 3 },
        price: { type: 'number', required: true, minimum: 0 },
        brand: { type: 'string', required: false }
      }
    }
  });
}

function extractionDiagnostics() {
  const plan = new ExtractionPlanRegistry(() => createdAt).register({
    tenantId: 'tenant_1',
    projectId: 'project_1',
    planId: 'plan_product',
    sourceKind: 'HTML',
    createdBy: 'user_1',
    createdAt,
    fields: [
      { fieldId: 'product_name', outputKey: 'product_name', selectorKind: 'CSS', selector: '.name', required: true, multiple: false },
      { fieldId: 'price', outputKey: 'price', selectorKind: 'CSS', selector: '.price', required: true, multiple: false },
      { fieldId: 'brand', outputKey: 'brand', selectorKind: 'CSS', selector: '.brand', required: false, multiple: false }
    ]
  });
  return buildDiagnosticsReport({
    scope: { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' },
    plan,
    sourceChecksumSha256: checksum,
    artifact: { artifactType: 'raw-http-response', contentType: 'text/html', sizeBytes: 100, checksumSha256: checksum, storageKey: 'tenant_1/job_1/task_1/attempt_1/raw.html' },
    fields: [
      { output: { fieldId: 'product_name', values: ['Acme Widget'], status: 'EXTRACTED' } },
      { output: { fieldId: 'price', values: [], status: 'ERROR', errorCode: 'REQUIRED_FIELD_MISSING' } },
      { output: { fieldId: 'brand', values: [], status: 'EMPTY' } }
    ]
  });
}

describe('buildSchemaQualityReport', () => {
  it('scores valid, invalid and optional-missing fields deterministically without leaking values', () => {
    const normalized = new ExtractionNormalizer().normalize([' Acme Widget '], [{ kind: 'TRIM' }]).values[0]!;
    const validation = validateNormalizedRecord({
      schema: schema(),
      record: { product_name: normalized.normalizedValue, price: -5 },
      normalizedLineage: { product_name: normalized }
    });
    const report = buildSchemaQualityReport({ validation, fieldWeights: { product_name: 2, price: 2, brand: 1 } });

    expect(report.validationValid).toBe(false);
    expect(report.qualityScorePercent).toBe(50);
    expect(report.summary).toMatchObject({ validFields: 1, optionalMissingFields: 1, invalidFields: 1 });
    expect(report.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldKey: 'product_name', weight: 2, status: 'VALID', score: 1 }),
      expect.objectContaining({ fieldKey: 'price', weight: 2, status: 'INVALID', score: 0, validationErrorCodes: ['NUMBER_BELOW_MINIMUM'] }),
      expect.objectContaining({ fieldKey: 'brand', weight: 1, status: 'OPTIONAL_MISSING', score: 0.5 })
    ]));
    expect(JSON.stringify(report)).not.toContain('Acme Widget');
  });

  it('prioritizes extraction error and redaction outcomes while preserving safe evidence only', () => {
    const validation = validateNormalizedRecord({
      schema: schema(),
      record: { product_name: 'Acme Widget', price: 20 }
    });
    const evidence = extractionDiagnostics();
    const report = buildSchemaQualityReport({ validation, extractionDiagnostics: evidence });

    expect(report.qualityScorePercent).toBe(50);
    expect(report.summary).toMatchObject({ validFields: 1, optionalMissingFields: 1, extractionErrorFields: 1 });
    expect(report.extractionEvidence).toEqual({ attemptId: 'attempt_1', planFingerprintSha256: evidence.plan.fingerprintSha256, artifactChecksumSha256: checksum });
    expect(report.fields.find((field) => field.fieldKey === 'price')).toMatchObject({ status: 'EXTRACTION_ERROR', extractionErrorCodes: ['REQUIRED_FIELD_MISSING'] });
    expect(JSON.stringify(report)).not.toContain('Acme Widget');
    expect(JSON.stringify(report)).not.toContain('raw.html');
    expect(JSON.stringify(report)).not.toContain('.price');

    const redactedEvidence = {
      ...evidence,
      fields: evidence.fields.map((field) => field.outputKey === 'brand' ? { ...field, status: 'REDACTED' as const } : field)
    };
    const redactedReport = buildSchemaQualityReport({ validation, extractionDiagnostics: redactedEvidence });
    expect(redactedReport.fields.find((field) => field.fieldKey === 'brand')).toMatchObject({ status: 'REDACTED', score: 0 });
  });

  it('rejects cross-tenant evidence and unsafe field weight configuration', () => {
    const validation = validateNormalizedRecord({ schema: schema(), record: { product_name: 'Acme Widget', price: 20 } });
    const evidence = extractionDiagnostics();
    expect(() => buildSchemaQualityReport({
      validation,
      extractionDiagnostics: { ...evidence, scope: { ...evidence.scope, tenantId: 'tenant_2' } }
    })).toThrow(SchemaQualityError);
    expect(() => buildSchemaQualityReport({ validation, fieldWeights: { missing_field: 1 } })).toThrow(SchemaQualityError);
  });
});
