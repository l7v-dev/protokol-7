import { describe, expect, it } from 'vitest';

import { BudgetError, ScopedBudgetRegistry } from '../../src/http/budget.js';

describe('ScopedBudgetRegistry', () => {
  it('consumes retry units and returns terminal exhaustion without over-consuming', () => {
    const registry = new ScopedBudgetRegistry();
    const scope = {
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      kind: 'RETRY' as const,
      maxUnits: 2
    };

    expect(registry.consume(scope)).toMatchObject({ allowed: true, code: 'BUDGET_AVAILABLE', consumed: 1, remaining: 1 });
    expect(registry.consume(scope)).toMatchObject({ allowed: true, code: 'BUDGET_AVAILABLE', consumed: 2, remaining: 0 });
    expect(registry.consume(scope)).toMatchObject({ allowed: false, code: 'RETRY_BUDGET_EXCEEDED', consumed: 2, remaining: 0 });
  });

  it('keeps retry and escalation budgets independent in the same job', () => {
    const registry = new ScopedBudgetRegistry();
    const base = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', maxUnits: 1 };

    expect(registry.consume({ ...base, kind: 'RETRY' })).toMatchObject({ kind: 'RETRY', allowed: true });
    expect(registry.consume({ ...base, kind: 'ESCALATION' })).toMatchObject({ kind: 'ESCALATION', allowed: true });
    expect(registry.consume({ ...base, kind: 'RETRY' })).toMatchObject({ code: 'RETRY_BUDGET_EXCEEDED', allowed: false });
    expect(registry.consume({ ...base, kind: 'ESCALATION' })).toMatchObject({ code: 'ESCALATION_BUDGET_EXCEEDED', allowed: false });
  });

  it('isolates tenants and custom budget keys', () => {
    const registry = new ScopedBudgetRegistry();
    const sharedShape = { jobId: 'job_1', taskId: 'task_1', kind: 'RETRY' as const, maxUnits: 1 };

    expect(registry.consume({ tenantId: 'tenant_1', ...sharedShape })).toMatchObject({ allowed: true });
    expect(registry.consume({ tenantId: 'tenant_2', ...sharedShape })).toMatchObject({ allowed: true });
    expect(registry.consume({ tenantId: 'tenant_1', ...sharedShape, key: 'partition_b' })).toMatchObject({ allowed: true });
    expect(registry.size).toBe(3);
  });

  it('does not allow a budget maxUnits configuration to change after first use', () => {
    const registry = new ScopedBudgetRegistry();
    const scope = { tenantId: 'tenant_1', jobId: 'job_1', kind: 'RETRY' as const, maxUnits: 2 };
    registry.consume(scope);

    expect(() => registry.consume({ ...scope, maxUnits: 5 })).toThrowError(expect.objectContaining({
      code: 'BUDGET_CONFIGURATION_CONFLICT',
      retryable: false
    }));
    expect(new BudgetError('BUDGET_SCOPE_INVALID', 'invalid', false).name).toBe('BudgetError');
  });

  it('supports snapshot and clear without crossing tenant scope', () => {
    const registry = new ScopedBudgetRegistry();
    const scope = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', kind: 'RETRY' as const, maxUnits: 2 };
    registry.consume(scope);

    expect(registry.snapshot(scope)).toMatchObject({ consumed: 1, remaining: 1, allowed: true });
    expect(registry.snapshot({ ...scope, tenantId: 'tenant_2' })).toMatchObject({ consumed: 0, remaining: 2 });
    expect(registry.clear({ ...scope, tenantId: 'tenant_2' })).toBe(false);
    expect(registry.clear(scope)).toBe(true);
    expect(registry.snapshot(scope)).toMatchObject({ consumed: 0, remaining: 2 });
  });

  it('rejects invalid scopes and zero-limit budgets only when consumed', () => {
    const registry = new ScopedBudgetRegistry();
    expect(() => registry.consume({ tenantId: '', jobId: 'job_1', kind: 'RETRY', maxUnits: 1 })).toThrowError(
      expect.objectContaining({ code: 'BUDGET_SCOPE_INVALID' })
    );
    expect(registry.consume({ tenantId: 'tenant_1', jobId: 'job_1', kind: 'RETRY', maxUnits: 0 })).toMatchObject({
      allowed: false,
      code: 'RETRY_BUDGET_EXCEEDED',
      remaining: 0
    });
  });
});
