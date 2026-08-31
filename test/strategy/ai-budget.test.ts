import { describe, expect, it } from 'vitest';

import { AiBudgetError, AiJobBudgetRegistry } from '../../src/strategy/ai-budget.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1' };
const limits = { maxInvocations: 2, maxInputTokens: 100, maxOutputTokens: 80, maxLatencyMs: 500 };

describe('AI latency, token and per-job budget contracts', () => {
  it('returns deterministic admission and secret-safe usage summaries for bounded per-job records', () => {
    const budgets = new AiJobBudgetRegistry();
    expect(budgets.admit(scope, limits, { inputTokens: 50, outputTokens: 40 })).toMatchObject({ allowed: true, aiStrategyEnabled: true, remaining: limits });
    const summary = budgets.record(scope, limits, { usageId: 'usage_1', inputTokens: 50, outputTokens: 40, latencyMs: 200, recordedAt: '2026-08-27T00:00:00.000Z' });

    expect(summary).toMatchObject({ consumed: { maxInvocations: 1, maxInputTokens: 50, maxOutputTokens: 40, maxLatencyMs: 200 }, remaining: { maxInvocations: 1, maxInputTokens: 50, maxOutputTokens: 40, maxLatencyMs: 300 }, aiStrategyEnabled: true });
    expect(JSON.stringify(summary)).not.toContain('prompt');
    expect(JSON.stringify(summary)).not.toContain('apiKey');
  });

  it('disables later AI strategy admission safely when an invocation, token or latency limit is exhausted', () => {
    const budgets = new AiJobBudgetRegistry();
    budgets.record(scope, limits, { usageId: 'usage_1', inputTokens: 50, outputTokens: 40, latencyMs: 200, recordedAt: '2026-08-27T00:00:00.000Z' });
    const exhausted = budgets.record(scope, limits, { usageId: 'usage_2', inputTokens: 50, outputTokens: 40, latencyMs: 300, recordedAt: '2026-08-27T00:01:00.000Z' });

    expect(exhausted).toMatchObject({ aiStrategyEnabled: false, disabledReason: 'INVOCATION_BUDGET_EXHAUSTED' });
    expect(budgets.admit(scope, limits, { inputTokens: 1, outputTokens: 1 })).toMatchObject({ allowed: false, code: 'AI_BUDGET_EXCEEDED', aiStrategyEnabled: false });
    expect(budgets.record(scope, limits, { usageId: 'usage_3', inputTokens: 1, outputTokens: 1, latencyMs: 1, recordedAt: '2026-08-27T00:02:00.000Z' }).consumed.maxInvocations).toBe(2);
  });

  it('rejects changed limits, malformed usage and invalid scope fail-closed', () => {
    const budgets = new AiJobBudgetRegistry();
    budgets.snapshot(scope, limits);
    expect(() => budgets.snapshot(scope, { ...limits, maxLatencyMs: 600 })).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_CONFIGURATION_CONFLICT' }));
    expect(() => budgets.record(scope, limits, { usageId: 'bad id', inputTokens: -1, outputTokens: 1, latencyMs: 1, recordedAt: 'invalid' })).toThrow(AiBudgetError);
    expect(() => budgets.admit({ tenantId: 'bad id', jobId: 'job_1' }, limits, { inputTokens: 1, outputTokens: 1 })).toThrowError(expect.objectContaining({ code: 'AI_BUDGET_INVALID' }));
  });
});
