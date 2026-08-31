import { describe, expect, it } from 'vitest';

import { UsageEventError, UsageEventRegistry, unitForCostCategory } from '../../src/finops/usage-events.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };
const input = { scope, usageId: 'usage_1', idempotencyKey: 'idem_1', category: 'HTTP_REQUEST' as const, unit: 'request' as const, quantity: 1, occurredAt: '2026-08-27T00:00:00.000Z' };

describe('bounded FinOps usage event model and cost category vocabulary', () => {
  it('records immutable secret-safe usage events for the fixed category and unit vocabulary', () => {
    const registry = new UsageEventRegistry();
    const event = registry.record(input);

    expect(event).toMatchObject({ contractVersion: 'usage-event/v1', category: 'HTTP_REQUEST', unit: 'request', quantity: 1, scope });
    expect(event.usageFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(unitForCostCategory('AI_INPUT_TOKEN')).toBe('token');
    expect(unitForCostCategory('STORAGE_GB_MONTH')).toBe('GB-month');
    expect(JSON.stringify(event)).not.toContain('metadata');
    expect(JSON.stringify(event)).not.toContain('credential');
  });

  it('is idempotent only for identical scope/key/category content and keeps attempt scopes isolated', () => {
    const registry = new UsageEventRegistry();
    const first = registry.record(input);
    const repeated = registry.record(input);
    expect(repeated).toEqual(first);
    expect(registry.get({ ...scope, attemptId: 'attempt_2' }, input.usageId)).toBeNull();
    expect(() => registry.record({ ...input, quantity: 2 })).toThrow(UsageEventError);
  });

  it('rejects arbitrary categories, mismatched units, malformed scope/time and out-of-bound quantity fail-closed', () => {
    const registry = new UsageEventRegistry();
    expect(() => registry.record({ ...input, category: 'CUSTOM_COST' as never })).toThrow(UsageEventError);
    expect(() => registry.record({ ...input, unit: 'token' as never })).toThrow(UsageEventError);
    expect(() => registry.record({ ...input, scope: { ...scope, tenantId: 'bad tenant' } })).toThrow(UsageEventError);
    expect(() => registry.record({ ...input, quantity: 10_000_001 })).toThrow(UsageEventError);
    expect(() => registry.record({ ...input, occurredAt: 'bad-time' })).toThrow(UsageEventError);
  });
});
