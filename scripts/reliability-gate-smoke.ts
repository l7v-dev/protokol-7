import assert from 'node:assert/strict';

import { CircuitBreakerRegistry } from '../src/http/circuit-breaker.js';
import { ScopedBudgetRegistry } from '../src/http/budget.js';
import { StrategyEscalationPolicy } from '../src/http/strategy-escalation.js';
import { ReliabilityTelemetryCollector } from '../src/http/telemetry.js';
import { MetricsRegistry } from '../src/shared/metrics.js';
import { FakeProxyProvider } from '../src/proxy/fake-provider.js';
import type { ProxyAcquireRequest } from '../src/proxy/contracts.js';

const now = new Date('2026-08-26T00:00:00.000Z');
let nowMs = now.getTime();
const clock = (): Date => new Date(nowMs);

async function main(): Promise<void> {
  const checks: Record<string, boolean> = {};
  const provider = new FakeProxyProvider({
    providerId: 'provider_fake',
    capability: {
      protocols: ['https:'],
      proxyClasses: ['residential'],
      countries: ['TR'],
      regions: ['TR-34'],
      supportsStickySession: true,
      supportsRotation: true,
      maxLeaseSeconds: 60,
      metering: { request: true, bytes: true, lease: true }
    },
    now: clock
  });
  const request: ProxyAcquireRequest = {
    providerId: 'provider_fake',
    tenantId: 'tenant_gate',
    projectId: 'project_gate',
    targetId: 'target_gate',
    jobId: 'job_gate',
    taskId: 'task_gate',
    attemptId: 'attempt_gate',
    protocol: 'https:',
    proxyClass: 'residential',
    country: 'TR',
    region: 'TR-34',
    leaseExpiresAt: new Date(nowMs + 30_000),
    correlationId: 'corr_gate'
  };
  provider.failNext('acquire', {
    code: 'PROXY_ACQUIRE_TIMEOUT',
    message: 'controlled failure',
    retryable: true
  }, 2);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await assert.rejects(() => provider.acquire(request));
  }
  const lease = await provider.acquire(request);
  assert.equal(lease.providerId, 'provider_fake');
  assert.equal(provider.calls.filter((call) => call.operation === 'acquire').length, 3);
  checks.fakeProviderFailureRecovery = true;

  const circuit = new CircuitBreakerRegistry({ failureThreshold: 2, resetTimeoutMs: 1_000 }, clock);
  const circuitScope = { tenantId: 'tenant_gate', kind: 'TARGET' as const, resource: 'target_gate' };
  circuit.recordFailure(circuitScope);
  circuit.recordFailure(circuitScope);
  assert.equal(circuit.allow(circuitScope).allowed, false);
  nowMs += 1_001;
  assert.equal(circuit.allow(circuitScope).reason, 'HALF_OPEN_PROBE');
  circuit.recordSuccess(circuitScope);
  assert.equal(circuit.allow(circuitScope).state, 'CLOSED');
  checks.circuitRecovery = true;

  const escalation = new StrategyEscalationPolicy(new ScopedBudgetRegistry());
  const escalationInput = {
    tenantId: 'tenant_gate',
    jobId: 'job_gate',
    taskId: 'task_gate',
    currentStrategy: 'HTTP' as const,
    failure: { code: 'HTTP_SERVER_ERROR', accessClass: 'SERVER_ERROR' as const, retryable: true },
    allowBrowser: false,
    allowProxyRotation: true,
    fallbackBudgetRemaining: 0,
    escalationBudget: { key: 'gate', maxUnits: 2 }
  };
  assert.equal(escalation.decide(escalationInput).action, 'ROTATE_PROXY');
  assert.equal(escalation.decide(escalationInput).action, 'ROTATE_PROXY');
  assert.equal(escalation.decide(escalationInput).action, 'BUDGET_EXHAUSTED');
  checks.escalationBudgetBounded = true;

  const metrics = new MetricsRegistry();
  const telemetry = new ReliabilityTelemetryCollector(metrics, 50, clock);
  for (let index = 0; index < 500; index += 1) {
    telemetry.record({
      tenantId: 'tenant_gate',
      strategy: 'HTTP',
      accessClass: index % 2 === 0 ? 'SUCCESS' : 'SERVER_ERROR',
      outcome: index % 2 === 0 ? 'SUCCESS' : 'FAILURE',
      code: index % 2 === 0 ? 'HTTP_SUCCESS' : 'HTTP_SERVER_ERROR'
    });
  }
  assert.equal(telemetry.snapshot().recentEvents.length, 50);
  assert.equal(metrics.snapshot()['reliability_events_total:HTTP:SUCCESS:SUCCESS'], 250);
  assert.equal(metrics.snapshot()['reliability_events_total:HTTP:FAILURE:SERVER_ERROR'], 250);
  checks.telemetryBoundedProjection = true;

  console.log(JSON.stringify({
    gate: 'P05-T08',
    status: 'PASS',
    checks,
    providerAcquireCalls: provider.calls.filter((call) => call.operation === 'acquire').length,
    telemetryRecentEvents: telemetry.snapshot().recentEvents.length,
    metricKeys: Object.keys(metrics.snapshot()).sort()
  }, null, 2));
}

await main();
