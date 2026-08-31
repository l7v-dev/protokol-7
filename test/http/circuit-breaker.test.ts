import { describe, expect, it, vi } from 'vitest';

import { CircuitBreakerError, CircuitBreakerRegistry, type CircuitScope } from '../../src/http/circuit-breaker.js';

const providerScope: CircuitScope = {
  tenantId: 'tenant_1',
  kind: 'PROVIDER',
  resource: 'provider_1'
};

const targetScope: CircuitScope = {
  tenantId: 'tenant_1',
  kind: 'TARGET',
  resource: 'target_1'
};

describe('CircuitBreakerRegistry', () => {
  it('opens after the configured failure threshold and auto-quarantines the scope', () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const registry = new CircuitBreakerRegistry({ failureThreshold: 2, resetTimeoutMs: 5_000 }, () => now);

    expect(registry.allow(providerScope)).toMatchObject({ allowed: true, state: 'CLOSED', reason: 'CLOSED' });
    expect(registry.recordFailure(providerScope)).toMatchObject({ state: 'CLOSED', failureCount: 1 });
    const opened = registry.recordFailure(providerScope);

    expect(opened).toMatchObject({ state: 'OPEN', failureCount: 2, probeInFlight: false });
    expect(registry.getQuarantine(providerScope)).toMatchObject({
      source: 'CIRCUIT_BREAKER',
      reason: 'REPEATED_FAILURE'
    });
    expect(registry.allow(providerScope)).toMatchObject({
      allowed: false,
      state: 'OPEN',
      reason: 'QUARANTINED',
      retryAfterMs: 5_000
    });
  });

  it('permits one half-open probe after reset timeout and closes on success', () => {
    let now = new Date('2026-08-26T00:00:00.000Z');
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 5_000 }, () => now);
    registry.recordFailure(targetScope);

    now = new Date('2026-08-26T00:00:05.001Z');
    expect(registry.allow(targetScope)).toMatchObject({ allowed: true, state: 'HALF_OPEN', reason: 'HALF_OPEN_PROBE' });
    expect(registry.allow(targetScope)).toMatchObject({
      allowed: false,
      state: 'HALF_OPEN',
      reason: 'HALF_OPEN_PROBE_IN_FLIGHT'
    });
    expect(registry.recordSuccess(targetScope)).toMatchObject({ state: 'CLOSED', failureCount: 0, probeInFlight: false });
    expect(registry.allow(targetScope)).toMatchObject({ allowed: true, state: 'CLOSED', reason: 'CLOSED' });
    expect(registry.getQuarantine(targetScope)).toBeUndefined();
  });

  it('keeps manual quarantine independent from tenant and resource scopes', () => {
    const registry = new CircuitBreakerRegistry({ failureThreshold: 3, resetTimeoutMs: 5_000 });
    registry.quarantine({ scope: targetScope, source: 'MANUAL', reason: 'POLICY' });

    expect(registry.allow(targetScope)).toMatchObject({ allowed: false, reason: 'QUARANTINED' });
    expect(registry.allow({ ...targetScope, tenantId: 'tenant_2' })).toMatchObject({
      allowed: true,
      state: 'CLOSED'
    });
    expect(registry.clearQuarantine(targetScope, 'CIRCUIT_BREAKER')).toBe(false);
    expect(registry.clearQuarantine(targetScope, 'MANUAL')).toBe(true);
    expect(registry.allow(targetScope)).toMatchObject({ allowed: true, state: 'CLOSED' });
  });

  it('throws a retryable circuit error without selecting an alternate resource', () => {
    const now = new Date('2026-08-26T00:00:00.000Z');
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 5_000 }, () => now);
    registry.recordFailure(providerScope);

    expect(() => registry.assertAllowed(providerScope)).toThrowError(expect.objectContaining({
      code: 'RESOURCE_QUARANTINED',
      retryable: true,
      retryAfterMs: 5_000
    }));
    expect(new CircuitBreakerError('CIRCUIT_OPEN', 'open', true).name).toBe('CircuitBreakerError');
  });

  it('validates options/scopes and removes expired quarantine on access', () => {
    expect(() => new CircuitBreakerRegistry({ failureThreshold: 0, resetTimeoutMs: 1 })).toThrow('Circuit breaker options are invalid.');
    expect(() => new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 0 })).toThrow('Circuit breaker options are invalid.');
    const now = vi.fn().mockReturnValue(new Date('2026-08-26T00:00:00.000Z'));
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 5_000 }, now);
    expect(() => registry.allow({ tenantId: '', kind: 'TARGET', resource: 'target_1' })).toThrow('Circuit scope geçerli değil.');
    registry.quarantine({ scope: targetScope, source: 'MANUAL', reason: 'MANUAL', expiresAt: new Date('2026-08-26T00:00:05.000Z') });
    now.mockReturnValue(new Date('2026-08-26T00:00:05.000Z'));
    expect(registry.getQuarantine(targetScope)).toBeUndefined();
  });
});
