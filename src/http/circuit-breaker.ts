export type CircuitResource = 'PROVIDER' | 'TARGET';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type QuarantineSource = 'CIRCUIT_BREAKER' | 'MANUAL';
export type QuarantineReason = 'REPEATED_FAILURE' | 'HEALTH_THRESHOLD' | 'POLICY' | 'MANUAL';

export type CircuitScope = {
  tenantId: string;
  resource: string;
  kind: CircuitResource;
};

export type CircuitBreakerOptions = {
  failureThreshold: number;
  resetTimeoutMs: number;
};

export type CircuitDecision = {
  allowed: boolean;
  state: CircuitState;
  reason: 'CLOSED' | 'HALF_OPEN_PROBE' | 'CIRCUIT_OPEN' | 'HALF_OPEN_PROBE_IN_FLIGHT' | 'QUARANTINED';
  retryAfterMs?: number;
};

export type CircuitSnapshot = {
  scope: CircuitScope;
  state: CircuitState;
  failureCount: number;
  openedAt?: Date;
  probeInFlight: boolean;
  lastFailureAt?: Date;
};

export type QuarantineRecord = {
  scope: CircuitScope;
  source: QuarantineSource;
  reason: QuarantineReason;
  quarantinedAt: Date;
  expiresAt?: Date;
};

export class CircuitBreakerError extends Error {
  public constructor(
    public readonly code: 'CIRCUIT_OPEN' | 'CIRCUIT_HALF_OPEN_BUSY' | 'RESOURCE_QUARANTINED',
    message: string,
    public readonly retryable: boolean,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Tenant-scoped circuit breaker and quarantine registry. It stops traffic for
 * a provider/target scope; it never selects an alternate provider by itself.
 */
export class CircuitBreakerRegistry {
  private readonly states = new Map<string, MutableState>();
  private readonly quarantines = new Map<string, QuarantineRecord>();

  public constructor(
    private readonly options: CircuitBreakerOptions,
    private readonly now: () => Date = () => new Date()
  ) {
    if (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1
      || !Number.isFinite(options.resetTimeoutMs) || options.resetTimeoutMs <= 0) {
      throw new Error('Circuit breaker options are invalid.');
    }
  }

  public allow(scope: CircuitScope, at = this.now()): CircuitDecision {
    validateScope(scope);
    const key = keyFor(scope);
    const quarantine = this.activeQuarantine(key, at);
    if (quarantine) {
      const retryAfterMs = quarantine.expiresAt === undefined
        ? undefined
        : Math.max(quarantine.expiresAt.getTime() - at.getTime(), 0);
      return {
        allowed: false,
        state: 'OPEN',
        reason: 'QUARANTINED',
        ...(retryAfterMs === undefined ? {} : { retryAfterMs })
      };
    }

    const state = this.states.get(key) ?? createState();
    this.states.set(key, state);
    if (state.state === 'CLOSED') {
      return { allowed: true, state: 'CLOSED', reason: 'CLOSED' };
    }
    if (state.state === 'OPEN') {
      const openedAt = state.openedAt?.getTime() ?? at.getTime();
      const elapsed = at.getTime() - openedAt;
      if (elapsed < this.options.resetTimeoutMs) {
        return {
          allowed: false,
          state: 'OPEN',
          reason: 'CIRCUIT_OPEN',
          retryAfterMs: Math.max(this.options.resetTimeoutMs - elapsed, 0)
        };
      }
      state.state = 'HALF_OPEN';
      state.probeInFlight = true;
      return { allowed: true, state: 'HALF_OPEN', reason: 'HALF_OPEN_PROBE' };
    }
    if (state.probeInFlight) {
      return { allowed: false, state: 'HALF_OPEN', reason: 'HALF_OPEN_PROBE_IN_FLIGHT' };
    }
    state.probeInFlight = true;
    return { allowed: true, state: 'HALF_OPEN', reason: 'HALF_OPEN_PROBE' };
  }

  public assertAllowed(scope: CircuitScope, at = this.now()): void {
    const decision = this.allow(scope, at);
    if (decision.allowed) return;
    const code = decision.reason === 'QUARANTINED' ? 'RESOURCE_QUARANTINED'
      : decision.reason === 'HALF_OPEN_PROBE_IN_FLIGHT' ? 'CIRCUIT_HALF_OPEN_BUSY'
        : 'CIRCUIT_OPEN';
    throw new CircuitBreakerError(
      code,
      'Provider veya target circuit/quarantine nedeniyle geçici olarak kullanılamıyor.',
      true,
      decision.retryAfterMs
    );
  }

  public recordSuccess(scope: CircuitScope, at = this.now()): CircuitSnapshot {
    validateScope(scope);
    const key = keyFor(scope);
    const state = this.states.get(key) ?? createState();
    state.state = 'CLOSED';
    state.failureCount = 0;
    delete state.openedAt;
    delete state.lastFailureAt;
    state.probeInFlight = false;
    this.states.set(key, state);
    this.clearAutoQuarantine(scope);
    void at;
    return this.snapshot(scope, state);
  }

  public recordFailure(scope: CircuitScope, at = this.now()): CircuitSnapshot {
    validateScope(scope);
    const key = keyFor(scope);
    const state = this.states.get(key) ?? createState();
    state.failureCount += 1;
    state.lastFailureAt = new Date(at);
    if (state.state === 'HALF_OPEN' || state.failureCount >= this.options.failureThreshold) {
      state.state = 'OPEN';
      state.openedAt = new Date(at);
      state.probeInFlight = false;
      this.quarantineInternal(scope, {
        source: 'CIRCUIT_BREAKER',
        reason: 'REPEATED_FAILURE',
        at,
        expiresAt: new Date(at.getTime() + this.options.resetTimeoutMs)
      });
    }
    this.states.set(key, state);
    return this.snapshot(scope, state);
  }

  public quarantine(input: {
    scope: CircuitScope;
    source: QuarantineSource;
    reason: QuarantineReason;
    expiresAt?: Date;
    at?: Date;
  }): QuarantineRecord {
    validateScope(input.scope);
    if (input.expiresAt && input.expiresAt.getTime() <= (input.at ?? this.now()).getTime()) {
      throw new Error('Quarantine expiry gelecekte olmalıdır.');
    }
    const record: QuarantineRecord = {
      scope: { ...input.scope },
      source: input.source,
      reason: input.reason,
      quarantinedAt: new Date(input.at ?? this.now()),
      ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {})
    };
    this.quarantines.set(keyFor(input.scope), record);
    return cloneQuarantine(record);
  }

  public clearQuarantine(scope: CircuitScope, source?: QuarantineSource): boolean {
    validateScope(scope);
    const key = keyFor(scope);
    const record = this.quarantines.get(key);
    if (!record || (source !== undefined && record.source !== source)) return false;
    this.quarantines.delete(key);
    return true;
  }

  public getQuarantine(scope: CircuitScope, at = this.now()): QuarantineRecord | undefined {
    validateScope(scope);
    const record = this.activeQuarantine(keyFor(scope), at);
    return record ? cloneQuarantine(record) : undefined;
  }

  public snapshot(scope: CircuitScope, state = this.states.get(keyFor(scope)) ?? createState()): CircuitSnapshot {
    validateScope(scope);
    return {
      scope: { ...scope },
      state: state.state,
      failureCount: state.failureCount,
      probeInFlight: state.probeInFlight,
      ...(state.openedAt ? { openedAt: new Date(state.openedAt) } : {}),
      ...(state.lastFailureAt ? { lastFailureAt: new Date(state.lastFailureAt) } : {})
    };
  }

  private activeQuarantine(key: string, at: Date): QuarantineRecord | undefined {
    const record = this.quarantines.get(key);
    if (!record) return undefined;
    if (record.expiresAt && record.expiresAt.getTime() <= at.getTime()) {
      this.quarantines.delete(key);
      return undefined;
    }
    return record;
  }

  private quarantineInternal(scope: CircuitScope, input: {
    source: QuarantineSource;
    reason: QuarantineReason;
    at: Date;
    expiresAt?: Date;
  }): void {
    this.quarantine({ scope, ...input });
  }

  private clearAutoQuarantine(scope: CircuitScope): void {
    const key = keyFor(scope);
    const record = this.quarantines.get(key);
    if (record?.source === 'CIRCUIT_BREAKER') {
      this.quarantines.delete(key);
    }
  }
}

type MutableState = {
  state: CircuitState;
  failureCount: number;
  probeInFlight: boolean;
  openedAt?: Date;
  lastFailureAt?: Date;
};

function createState(): MutableState {
  return {
    state: 'CLOSED',
    failureCount: 0,
    probeInFlight: false
  };
}

function validateScope(scope: CircuitScope): void {
  if (!scope.tenantId || !scope.resource || (scope.kind !== 'PROVIDER' && scope.kind !== 'TARGET')) {
    throw new Error('Circuit scope geçerli değil.');
  }
}

function keyFor(scope: CircuitScope): string {
  return `${scope.tenantId}:${scope.kind}:${scope.resource}`;
}

function cloneQuarantine(record: QuarantineRecord): QuarantineRecord {
  return {
    ...record,
    scope: { ...record.scope },
    quarantinedAt: new Date(record.quarantinedAt),
    ...(record.expiresAt ? { expiresAt: new Date(record.expiresAt) } : {})
  };
}
