export type BudgetKind = 'RETRY' | 'ESCALATION';

export type BudgetScope = {
  tenantId: string;
  jobId: string;
  taskId?: string;
  kind: BudgetKind;
  key?: string;
  maxUnits: number;
};

export type BudgetDecision = {
  kind: BudgetKind;
  allowed: boolean;
  code: 'BUDGET_AVAILABLE' | 'RETRY_BUDGET_EXCEEDED' | 'ESCALATION_BUDGET_EXCEEDED';
  consumed: number;
  remaining: number;
  maxUnits: number;
};

export class BudgetError extends Error {
  public constructor(
    public readonly code: 'BUDGET_SCOPE_INVALID' | 'BUDGET_CONFIGURATION_CONFLICT',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'BudgetError';
  }
}

/**
 * Process-local reference implementation for tenant/job/task budget
 * accounting. Persistence and atomic distributed increments remain gate work.
 */
export class ScopedBudgetRegistry {
  private readonly counters = new Map<string, BudgetCounter>();

  public consume(scope: BudgetScope): BudgetDecision {
    validateScope(scope);
    const key = keyFor(scope);
    const existing = this.counters.get(key);
    if (existing && existing.maxUnits !== scope.maxUnits) {
      throw new BudgetError(
        'BUDGET_CONFIGURATION_CONFLICT',
        'Aynı budget scope için maxUnits değiştirilemez.',
        false
      );
    }
    const counter = existing ?? new BudgetCounter(scope.maxUnits);
    this.counters.set(key, counter);
    const allowed = counter.consume();
    return {
      kind: scope.kind,
      allowed,
      code: allowed ? 'BUDGET_AVAILABLE' : scope.kind === 'RETRY' ? 'RETRY_BUDGET_EXCEEDED' : 'ESCALATION_BUDGET_EXCEEDED',
      consumed: counter.consumed,
      remaining: counter.remaining,
      maxUnits: counter.maxUnits
    };
  }

  public snapshot(scope: Omit<BudgetScope, 'maxUnits'> & { maxUnits?: number }): BudgetDecision {
    validateScope({ ...scope, maxUnits: scope.maxUnits ?? 1 });
    const counter = this.counters.get(keyFor(scope));
    const maxUnits = counter?.maxUnits ?? scope.maxUnits ?? 0;
    if (!counter) {
      return {
        kind: scope.kind,
        allowed: maxUnits > 0,
        code: 'BUDGET_AVAILABLE',
        consumed: 0,
        remaining: maxUnits,
        maxUnits
      };
    }
    return {
      kind: scope.kind,
      allowed: counter.remaining > 0,
      code: counter.remaining > 0 ? 'BUDGET_AVAILABLE' : scope.kind === 'RETRY' ? 'RETRY_BUDGET_EXCEEDED' : 'ESCALATION_BUDGET_EXCEEDED',
      consumed: counter.consumed,
      remaining: counter.remaining,
      maxUnits: counter.maxUnits
    };
  }

  public clear(scope: Omit<BudgetScope, 'maxUnits'>): boolean {
    validateScope({ ...scope, maxUnits: 1 });
    return this.counters.delete(keyFor(scope));
  }

  public get size(): number {
    return this.counters.size;
  }
}

class BudgetCounter {
  public consumed = 0;

  public constructor(public readonly maxUnits: number) {}

  public consume(): boolean {
    if (this.consumed >= this.maxUnits) return false;
    this.consumed += 1;
    return true;
  }

  public get remaining(): number {
    return this.maxUnits - this.consumed;
  }
}

function validateScope(scope: BudgetScope): void {
  if (!scope.tenantId || !scope.jobId || (scope.taskId !== undefined && !scope.taskId)
    || (scope.kind !== 'RETRY' && scope.kind !== 'ESCALATION')
    || !Number.isInteger(scope.maxUnits) || scope.maxUnits < 0
    || (scope.key !== undefined && !scope.key)) {
    throw new BudgetError('BUDGET_SCOPE_INVALID', 'Budget tenant/job/task scope veya limit geçerli değil.', false);
  }
}

function keyFor(scope: Pick<BudgetScope, 'tenantId' | 'jobId' | 'taskId' | 'kind' | 'key'>): string {
  return `${scope.tenantId}:${scope.kind}:${scope.key ?? `${scope.jobId}:${scope.taskId ?? 'JOB'}`}`;
}
