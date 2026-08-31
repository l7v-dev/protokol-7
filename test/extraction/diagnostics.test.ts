import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EXTRACTION_DIAGNOSTICS_EXECUTION_BOUNDARY, ExtractionDiagnosticsError, ExtractionDiagnosticsRegistry, buildDiagnosticsReport } from '../../src/extraction/diagnostics.js';
import type { ExtractionArtifactReference, ExtractionScope } from '../../src/extraction/html-cleaner.js';
import { ExtractionNormalizer } from '../../src/extraction/normalize.js';
import { ExtractionPlanRegistry } from '../../src/extraction/plan.js';

const scope: ExtractionScope = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };
const artifact: ExtractionArtifactReference = {
  artifactType: 'raw-http-response', contentType: 'text/html', sizeBytes: 512,
  checksumSha256: 'a'.repeat(64), storageKey: 'tenants/tenant_1/jobs/job_1/tasks/task_1/attempts/attempt_1/response.body'
};

function plan() {
  return new ExtractionPlanRegistry(() => new Date('2026-08-27T00:00:00.000Z')).register({
    tenantId: 'tenant_1', projectId: 'project_1', planId: 'plan_1', sourceKind: 'HTML', createdBy: 'user_1',
    fields: [
      { fieldId: 'title', outputKey: 'title', selectorKind: 'CSS', selector: 'h1.product-title', required: true, multiple: false, transforms: [{ kind: 'COLLAPSE_WHITESPACE' }] },
      { fieldId: 'price', outputKey: 'price', selectorKind: 'XPATH', selector: '//span[@data-price]', required: true, multiple: false }
    ]
  });
}

function input(overrides: Partial<Parameters<typeof buildDiagnosticsReport>[0]> = {}) {
  const normalizer = new ExtractionNormalizer();
  return {
    scope,
    artifact,
    sourceChecksumSha256: createHash('sha256').update('<h1>Trail Jacket</h1>').digest('hex'),
    plan: plan(),
    fields: [
      { output: { fieldId: 'title', values: [' Trail   Jacket '], status: 'EXTRACTED' as const }, normalization: normalizer.normalize([' Trail   Jacket '], [{ kind: 'COLLAPSE_WHITESPACE' }]) },
      { output: { fieldId: 'price', values: [], status: 'ERROR' as const, errorCode: 'REQUIRED_FIELD_MISSING' } }
    ],
    ...overrides
  };
}

describe('ExtractionDiagnosticsRegistry', () => {
  it('declares a local projection execution boundary and protects it from caller mutation', () => {
    const registry = new ExtractionDiagnosticsRegistry();
    expect(registry.executionBoundary).toEqual(EXTRACTION_DIAGNOSTICS_EXECUTION_BOUNDARY);
    expect(registry.executionBoundary).not.toBe(EXTRACTION_DIAGNOSTICS_EXECUTION_BOUNDARY);
  });

  it('creates deterministic, field-level provenance without retaining values or selectors', () => {
    const report = buildDiagnosticsReport(input());
    expect(report.reportId).toHaveLength(64);
    expect(report.summary).toEqual({ totalFields: 2, extractedFields: 1, emptyFields: 0, errorFields: 1, redactedFields: 0, requiredMissingFields: 1 });
    expect(report.fields[0]).toMatchObject({
      fieldId: 'title', status: 'EXTRACTED', selectedValueCount: 1, normalizedValueCount: 1, redactedValueCount: 0,
      evidence: { selectorKind: 'CSS', transformFingerprint: 'COLLAPSE_WHITESPACE' }
    });
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('Trail Jacket');
    expect(serialized).not.toContain('h1.product-title');
    expect(serialized).not.toContain(artifact.storageKey);
  });

  it('counts redaction, validates input completeness, and prevents conflict on the same tenant attempt', () => {
    const normalizer = new ExtractionNormalizer();
    const registry = new ExtractionDiagnosticsRegistry();
    const diagnosticInput = input({ fields: [
      { output: { fieldId: 'title', values: ['Bearer no-leak'], status: 'EXTRACTED' }, normalization: normalizer.normalize(['Bearer no-leak'], [{ kind: 'COLLAPSE_WHITESPACE' }]) },
      { output: { fieldId: 'price', values: [], status: 'EMPTY' } }
    ] });
    const first = registry.record(diagnosticInput);
    expect(first.fields[0]).toMatchObject({ status: 'REDACTED', redactedValueCount: 1 });
    expect(registry.record(diagnosticInput)).toEqual(first);

    const selectorRedacted = buildDiagnosticsReport(input({ fields: [
      { output: { fieldId: 'title', values: ['[REDACTED]'], status: 'REDACTED' } },
      { output: { fieldId: 'price', values: [], status: 'EMPTY' } }
    ] }));
    expect(selectorRedacted.fields[0]).toMatchObject({ status: 'REDACTED', redactedValueCount: 1 });

    expect(() => registry.record({ ...diagnosticInput, fields: [
      ...diagnosticInput.fields.slice(0, 1),
      { output: { fieldId: 'price', values: ['129.00'], status: 'EXTRACTED' } }
    ] })).toThrow(ExtractionDiagnosticsError);
    expect(registry.get({ tenantId: 'tenant_2', attemptId: 'attempt_1' })).toBeUndefined();
  });

  it('rejects unknown fields, inconsistent transform evidence and unsafe error text', () => {
    const base = input();
    expect(() => buildDiagnosticsReport({ ...base, fields: [
      ...base.fields.slice(0, 1),
      { output: { fieldId: 'unknown', values: [], status: 'ERROR', errorCode: 'BAD ERROR' } }
    ] })).toThrow(ExtractionDiagnosticsError);
    expect(() => buildDiagnosticsReport({ ...base, fields: [
      { ...base.fields[0]!, normalization: new ExtractionNormalizer().normalize(['title']) },
      base.fields[1]!
    ] })).toThrow(ExtractionDiagnosticsError);
    expect(() => buildDiagnosticsReport({ ...base, fields: [
      { output: { fieldId: 'title', values: [], status: 'ERROR' } },
      base.fields[1]!
    ] })).toThrow(ExtractionDiagnosticsError);
    expect(() => buildDiagnosticsReport({ ...base, fields: [
      { output: { fieldId: 'title', values: [], status: 'EXTRACTED', errorCode: 'REQUIRED_FIELD_MISSING' } },
      base.fields[1]!
    ] })).toThrow(ExtractionDiagnosticsError);
  });
});
