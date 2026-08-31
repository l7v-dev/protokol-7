export type AiBudgetScope = {
  tenantId: string;
  jobId: string;
};

export type AiBudgetLimits = {
  maxInvocations: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxLatencyMs: number;
};

export type AiBudgetAdmission = {
  allowed: boolean;
  code: 'AI_BUDGET_AVAILABLE' | 'AI_BUDGET_EXCEEDED';
  aiStrategyEnabled: boolean;
  remaining: AiBudgetLimits;
};

export type AiUsageRecord = {
  usageId: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  recordedAt: string;
};

export type AiBudgetSummary = {
  scope: AiBudgetScope;
  limits: AiBudgetLimits;
  consumed: AiBudgetLimits;
  remaining: AiBudgetLimits;
  aiStrategyEnabled: boolean;
  disabledReason?: 'INVOCATION_BUDGET_EXHAUSTED' | 'INPUT_TOKEN_BUDGET_EXHAUSTED' | 'OUTPUT_TOKEN_BUDGET_EXHAUSTED' | 'LATENCY_BUDGET_EXHAUSTED';
};

export class AiBudgetError extends Error {
  public constructor(
    public readonly code: 'AI_BUDGET_INVALID' | 'AI_BUDGET_CONFIGURATION_CONFLICT' | 'AI_BUDGET_USAGE_CONFLICT',
    message: string
  ) {
    super(message);
    this.name = 'AiBudgetError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_LIMIT = 10_000_000;

/**
 * Process-local AI budget accounting reference. It neither invokes models nor
 * charges money; it returns admission/usage state only and disables later AI strategy calls when bounded limits are exhausted.
 */
export class AiJobBudgetRegistry {
  private readonly states = new Map<string, BudgetState>();

  public admit(scope: AiBudgetScope, limits: AiBudgetLimits, requested: Pick<AiUsageRecord, 'inputTokens' | 'outputTokens'>): AiBudgetAdmission {
    validateScope(scope);
    validateLimits(limits);
    validateTokenRequest(requested);
    const state = this.requireState(scope, limits);
    const summary = state.summary(scope);
    const allowed = summary.aiStrategyEnabled
      && requested.inputTokens <= summary.remaining.maxInputTokens
      && requested.outputTokens <= summary.remaining.maxOutputTokens
      && summary.remaining.maxInvocations > 0;
    return {
      allowed,
      code: allowed ? 'AI_BUDGET_AVAILABLE' : 'AI_BUDGET_EXCEEDED',
      aiStrategyEnabled: allowed,
      remaining: { ...summary.remaining }
    };
  }

  public record(scope: AiBudgetScope, limits: AiBudgetLimits, usage: AiUsageRecord): AiBudgetSummary {
    validateScope(scope);
    validateLimits(limits);
    validateUsage(usage);
    const state = this.requireState(scope, limits);
    const existing = state.usageById.get(usage.usageId);
    if (existing) {
      if (sameUsage(existing, usage)) return state.summary(scope);
      throw new AiBudgetError('AI_BUDGET_USAGE_CONFLICT', 'AI usage kimliği farklı içerikle tekrar kullanılamaz.');
    }
    if (!state.summary(scope).aiStrategyEnabled) return state.summary(scope);
    state.usageById.set(usage.usageId, { ...usage });
    state.consumed.maxInvocations += 1;
    state.consumed.maxInputTokens += usage.inputTokens;
    state.consumed.maxOutputTokens += usage.outputTokens;
    state.consumed.maxLatencyMs += usage.latencyMs;
    return state.summary(scope);
  }

  public snapshot(scope: AiBudgetScope, limits: AiBudgetLimits): AiBudgetSummary {
    validateScope(scope);
    validateLimits(limits);
    return this.requireState(scope, limits).summary(scope);
  }

  private requireState(scope: AiBudgetScope, limits: AiBudgetLimits): BudgetState {
    const key = scopeKey(scope);
    const existing = this.states.get(key);
    if (existing) {
      if (!sameLimits(existing.limits, limits)) throw new AiBudgetError('AI_BUDGET_CONFIGURATION_CONFLICT', 'Aynı AI job budget scope için limit değiştirilemez.');
      return existing;
    }
    const created = new BudgetState(limits);
    this.states.set(key, created);
    return created;
  }
}

class BudgetState {
  public readonly consumed: AiBudgetLimits = { maxInvocations: 0, maxInputTokens: 0, maxOutputTokens: 0, maxLatencyMs: 0 };
  public readonly usageById = new Map<string, AiUsageRecord>();

  public constructor(public readonly limits: AiBudgetLimits) {}

  public summary(scope: AiBudgetScope): AiBudgetSummary {
    const remaining: AiBudgetLimits = {
      maxInvocations: Math.max(this.limits.maxInvocations - this.consumed.maxInvocations, 0),
      maxInputTokens: Math.max(this.limits.maxInputTokens - this.consumed.maxInputTokens, 0),
      maxOutputTokens: Math.max(this.limits.maxOutputTokens - this.consumed.maxOutputTokens, 0),
      maxLatencyMs: Math.max(this.limits.maxLatencyMs - this.consumed.maxLatencyMs, 0)
    };
    const disabledReason = this.consumed.maxInvocations >= this.limits.maxInvocations
      ? 'INVOCATION_BUDGET_EXHAUSTED'
      : this.consumed.maxInputTokens >= this.limits.maxInputTokens
        ? 'INPUT_TOKEN_BUDGET_EXHAUSTED'
        : this.consumed.maxOutputTokens >= this.limits.maxOutputTokens
          ? 'OUTPUT_TOKEN_BUDGET_EXHAUSTED'
          : this.consumed.maxLatencyMs >= this.limits.maxLatencyMs
            ? 'LATENCY_BUDGET_EXHAUSTED'
            : undefined;
    return {
      scope: { ...scope },
      limits: { ...this.limits },
      consumed: { ...this.consumed },
      remaining,
      aiStrategyEnabled: disabledReason === undefined,
      ...(disabledReason === undefined ? {} : { disabledReason })
    };
  }
}

function validateScope(scope: AiBudgetScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.jobId)) throw invalid();
}

function validateLimits(limits: AiBudgetLimits): void {
  if (!Object.values(limits).every((value) => Number.isInteger(value) && value >= 0 && value <= MAX_LIMIT)) throw invalid();
}

function validateTokenRequest(requested: Pick<AiUsageRecord, 'inputTokens' | 'outputTokens'>): void {
  if (![requested.inputTokens, requested.outputTokens].every((value) => Number.isInteger(value) && value >= 0 && value <= MAX_LIMIT)) throw invalid();
}

function validateUsage(usage: AiUsageRecord): void {
  if (!SAFE_ID.test(usage.usageId) || !Number.isFinite(Date.parse(usage.recordedAt))
    || ![usage.inputTokens, usage.outputTokens, usage.latencyMs].every((value) => Number.isInteger(value) && value >= 0 && value <= MAX_LIMIT)) throw invalid();
}

function sameLimits(left: AiBudgetLimits, right: AiBudgetLimits): boolean {
  return left.maxInvocations === right.maxInvocations && left.maxInputTokens === right.maxInputTokens && left.maxOutputTokens === right.maxOutputTokens && left.maxLatencyMs === right.maxLatencyMs;
}

function sameUsage(left: AiUsageRecord, right: AiUsageRecord): boolean {
  return left.usageId === right.usageId && left.inputTokens === right.inputTokens && left.outputTokens === right.outputTokens && left.latencyMs === right.latencyMs && left.recordedAt === right.recordedAt;
}

function scopeKey(scope: AiBudgetScope): string {
  return `${scope.tenantId}:${scope.jobId}`;
}

function invalid(): AiBudgetError {
  return new AiBudgetError('AI_BUDGET_INVALID', 'AI budget input geçerli değil.');
}
