import { describe, expect, it } from 'vitest';

import { ExtractionPlanError, ExtractionPlanRegistry } from '../../src/extraction/plan.js';
import type { ExtractionPlanDraft, ExtractionPlanErrorCode } from '../../src/extraction/plan.js';

const createdAt = new Date('2026-08-26T00:00:00.000Z');

function draft(overrides: Partial<ExtractionPlanDraft> = {}): ExtractionPlanDraft {
  return {
    tenantId: 'tenant_1',
    projectId: 'project_1',
    planId: 'plan_catalog',
    sourceKind: 'HTML',
    createdBy: 'user_1',
    createdAt,
    fields: [
      { fieldId: 'title', outputKey: 'title', selectorKind: 'CSS', selector: 'h1.product-title', required: true, multiple: false },
      { fieldId: 'price', outputKey: 'price', selectorKind: 'XPATH', selector: '//span[@data-price]', required: false, multiple: false }
    ],
    ...overrides
  };
}

function expectPlanError(action: () => unknown, code: ExtractionPlanErrorCode): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ExtractionPlanError);
    expect((error as ExtractionPlanError).code).toBe(code);
    return;
  }
  throw new Error(`Expected extraction plan error ${code}.`);
}

describe('ExtractionPlanRegistry', () => {
  it('versions immutable canonical plans with deterministic fingerprints', () => {
    const registry = new ExtractionPlanRegistry(() => createdAt);
    const initialDraft = draft();
    const first = registry.register(initialDraft);
    initialDraft.fields[0]!.selector = '.caller-mutated';
    const second = registry.register(draft({
      fields: [
        { fieldId: 'price', outputKey: 'price', selectorKind: 'XPATH', selector: '//span[@data-price]', required: false, multiple: false },
        { fieldId: 'title', outputKey: 'title', selectorKind: 'CSS', selector: 'h1.product-title', required: true, multiple: false }
      ]
    }));

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(first.fingerprintSha256).not.toHaveLength(0);
    expect(second.fingerprintSha256).not.toBe(first.fingerprintSha256);
    expect(first.fields.map((field) => field.fieldId)).toEqual(['title', 'price']);
    expect(registry.resolve({ tenantId: 'tenant_1', planId: 'plan_catalog', version: 1 }).fields[0]!.selector).toBe('h1.product-title');

    const resolved = registry.resolve({ tenantId: 'tenant_1', planId: 'plan_catalog', version: 1 });
    resolved.fields[0]!.selector = '.mutated';
    expect(registry.resolve({ tenantId: 'tenant_1', planId: 'plan_catalog', version: 1 }).fields[0]!.selector).toBe('h1.product-title');
  });

  it('binds an attempt idempotently to a resolved plan version and rejects drift', () => {
    const registry = new ExtractionPlanRegistry(() => createdAt);
    const first = registry.register(draft());
    registry.register(draft());

    const input = {
      tenantId: 'tenant_1',
      planId: 'plan_catalog',
      version: first.version,
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1'
    };
    const binding = registry.bindAttempt(input);
    expect(registry.bindAttempt(input)).toEqual(binding);
    expect(binding.fingerprintSha256).toBe(first.fingerprintSha256);
    expectPlanError(() => registry.bindAttempt({ ...input, version: 2 }), 'EXTRACTION_PLAN_BINDING_CONFLICT');
  });

  it('enforces tenant isolation and rejects unsafe or invalid plan fields', () => {
    const registry = new ExtractionPlanRegistry(() => createdAt);
    registry.register(draft());

    expectPlanError(
      () => registry.resolve({ tenantId: 'tenant_2', planId: 'plan_catalog', version: 1 }),
      'EXTRACTION_PLAN_NOT_FOUND'
    );
    expectPlanError(() => registry.register(draft({ fields: [
      { fieldId: 'token', outputKey: 'accessToken', selectorKind: 'CSS', selector: '.token', required: false, multiple: false }
    ] })), 'EXTRACTION_PLAN_INVALID');
    expectPlanError(() => registry.register(draft({ fields: [
      { fieldId: 'unsafe', outputKey: 'value', selectorKind: 'CSS', selector: 'javascript:alert(1)', required: false, multiple: false }
    ] })), 'EXTRACTION_PLAN_INVALID');
    expectPlanError(() => registry.register(draft({ createdAt: new Date('invalid') })), 'EXTRACTION_PLAN_INVALID');
  });
});
