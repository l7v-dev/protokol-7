import { describe, expect, it, vi } from 'vitest';

import { HttpClientError, type HttpRequestPlan, type HttpResponse } from '../../src/http/http-client.js';
import { CircuitBreakerRegistry } from '../../src/http/circuit-breaker.js';
import { ReliabilityTelemetryCollector } from '../../src/http/telemetry.js';
import { MetricsRegistry } from '../../src/shared/metrics.js';
import {
  HttpErrorClassifier,
  HttpReliabilityController,
  InMemoryHttpCache,
  RetryDelayCalculator,
  RetryBudget,
  parseRetryAfter
} from '../../src/http/reliability.js';

function response(status: number, headers: Record<string, string> = {}): HttpResponse {
  return {
    url: 'https://example.com/data',
    status,
    statusClass: status >= 500 ? '5xx' : status >= 400 ? '4xx' : '2xx',
    contentType: 'application/json',
    body: '{}',
    bodyBytes: 2,
    decompressedBytes: 2,
    redirectCount: 0,
    headers
  };
}

function plan(overrides: Partial<HttpRequestPlan> = {}): HttpRequestPlan {
  return {
    tenantId: 'tenant_1',
    projectId: 'project_1',
    targetId: 'target_1',
    jobId: 'job_1',
    runId: 'run_1',
    taskId: 'task_1',
    attemptId: 'attempt_1',
    method: 'GET',
    url: 'https://example.com/data',
    allowedHosts: ['example.com'],
    allowedPorts: [443],
    allowedMethods: ['GET'],
    allowedHeaderNames: [],
    allowCookies: false,
    allowRedirects: false,
    maxRedirects: 0,
    timeout: { connectMs: 100, responseMs: 100, totalMs: 500 },
    limits: { requestBodyBytes: 1024, responseBytes: 1024, decompressedBytes: 1024 },
    correlationId: 'corr_1',
    traceId: 'trace_1',
    ...overrides
  };
}

describe('HTTP reliability controls', () => {
  it('classifies status codes and parses bounded Retry-After values', () => {
    const classifier = new HttpErrorClassifier(5_000);

    expect(classifier.classifyResponse(response(429, { 'retry-after': '2' }))).toMatchObject({
      code: 'HTTP_RATE_LIMITED',
      category: 'RATE_LIMIT',
      retryable: true,
      retryAfterMs: 2_000
    });
    expect(classifier.classifyResponse(response(404))).toMatchObject({
      code: 'HTTP_CLIENT_ERROR',
      category: 'CLIENT_ERROR',
      retryable: false
    });
    expect(classifier.classifyResponse(response(503))).toMatchObject({
      code: 'HTTP_SERVER_ERROR',
      category: 'SERVER_ERROR',
      retryable: true
    });
    expect(parseRetryAfter('120', 5_000)).toBe(5_000);
    expect(parseRetryAfter('not-a-date', 5_000)).toBeUndefined();
  });

  it('classifies success, authentication, anti-bot and policy access outcomes without bypass signals', () => {
    const classifier = new HttpErrorClassifier();

    expect(classifier.classifyResponse(response(200))).toMatchObject({
      code: 'HTTP_SUCCESS',
      category: 'SUCCESS',
      accessClass: 'SUCCESS',
      confidence: 'HIGH',
      retryable: false,
      status: 200
    });
    expect(classifier.classifyResponse(response(401))).toMatchObject({
      code: 'HTTP_AUTH_REQUIRED',
      category: 'AUTHENTICATION',
      accessClass: 'AUTHENTICATION_REQUIRED',
      retryable: false
    });
    expect(classifier.classifyResponse(response(403, { 'cf-mitigated': 'challenge' }))).toMatchObject({
      code: 'HTTP_ANTI_BOT_BARRIER',
      category: 'ANTI_BOT',
      accessClass: 'ANTI_BOT_BARRIER',
      retryable: false
    });
    expect(classifier.classifyResponse(response(403))).toMatchObject({
      code: 'HTTP_POLICY_BLOCKED',
      category: 'POLICY',
      accessClass: 'POLICY_BLOCKED',
      retryable: false
    });
  });

  it('classifies policy errors as non-retryable and transport errors as retryable', () => {
    const classifier = new HttpErrorClassifier();

    expect(classifier.classifyError(new HttpClientError(
      'PRIVATE_TARGET_BLOCKED',
      'blocked',
      false,
      'POLICY'
    ))).toMatchObject({
      code: 'PRIVATE_TARGET_BLOCKED',
      category: 'POLICY',
      retryable: false
    });
    expect(classifier.classifyError(new HttpClientError(
      'HTTP_REQUEST_FAILED',
      'failed',
      true,
      'DEPENDENCY'
    ))).toMatchObject({
      code: 'HTTP_REQUEST_FAILED',
      category: 'DEPENDENCY',
      accessClass: 'DEPENDENCY_FAILURE',
      retryable: true
    });
    expect(classifier.classifyError(new HttpClientError(
      'CAPTCHA_REQUIRED',
      'challenge',
      false,
      'DEPENDENCY'
    ))).toMatchObject({
      code: 'CAPTCHA_REQUIRED',
      category: 'ANTI_BOT',
      accessClass: 'ANTI_BOT_BARRIER',
      retryable: false
    });
    expect(classifier.classifyError(new Error('unknown'))).toMatchObject({
      code: 'HTTP_WORKER_ERROR',
      category: 'DEPENDENCY',
      accessClass: 'DEPENDENCY_FAILURE',
      confidence: 'LOW',
      retryable: true
    });
  });

  it('calculates bounded exponential backoff with deterministic jitter', () => {
    const calculator = new RetryDelayCalculator({
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitterRatio: 0.2,
      random: () => 0.5
    });

    expect(calculator.calculate({ retryAttempt: 1 })).toEqual({
      delayMs: 110,
      exponentialDelayMs: 100,
      jitterMs: 10,
      source: 'EXPONENTIAL_BACKOFF',
      capped: false
    });
    expect(calculator.calculate({ retryAttempt: 4 })).toMatchObject({
      delayMs: 880,
      exponentialDelayMs: 800,
      jitterMs: 80,
      source: 'EXPONENTIAL_BACKOFF'
    });
    expect(calculator.calculate({ retryAttempt: 5 })).toMatchObject({
      delayMs: 1_000,
      exponentialDelayMs: 1_000,
      jitterMs: 0,
      capped: true
    });
  });

  it('honors Retry-After as the lower bound and never exceeds max delay', () => {
    const calculator = new RetryDelayCalculator({
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitterRatio: 0.2,
      random: () => 1
    });

    expect(calculator.calculate({ retryAttempt: 1, retryAfterMs: 500 })).toMatchObject({
      delayMs: 600,
      exponentialDelayMs: 100,
      jitterMs: 100,
      source: 'RETRY_AFTER',
      capped: false
    });
    expect(calculator.calculate({ retryAttempt: 6, retryAfterMs: 4_000 })).toMatchObject({
      delayMs: 1_000,
      source: 'RETRY_AFTER',
      capped: true
    });
  });

  it('rejects invalid calculator options and attempts', () => {
    expect(() => new RetryDelayCalculator({ baseDelayMs: 0 })).toThrow('Retry delay options are invalid.');
    expect(() => new RetryDelayCalculator({ maxDelayMs: 1, baseDelayMs: 2 })).toThrow('Retry delay options are invalid.');
    const calculator = new RetryDelayCalculator();
    expect(() => calculator.calculate({ retryAttempt: 0 })).toThrow('Retry delay input is invalid.');
    expect(() => calculator.calculate({ retryAttempt: 1, retryAfterMs: -1 })).toThrow('Retry delay input is invalid.');
  });

  it('enforces a finite retry budget', () => {
    const budget = new RetryBudget(2);

    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(true);
    expect(budget.consume()).toBe(false);
    expect(budget.remaining).toBe(0);
  });

  it('projects success, failure and circuit block events to reliability metrics', async () => {
    const metrics = new MetricsRegistry();
    const telemetry = new ReliabilityTelemetryCollector(metrics);
    const controller = new HttpReliabilityController({
      telemetry,
      circuitBreaker: new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 5_000 })
    });

    await controller.execute(plan(), async () => response(200));
    await controller.execute(plan(), async () => response(503));
    await expect(controller.execute(plan(), async () => response(200))).rejects.toMatchObject({
      code: 'RESOURCE_QUARANTINED'
    });

    expect(metrics.snapshot()).toMatchObject({
      'reliability_events_total:HTTP:SUCCESS:SUCCESS': 1,
      'reliability_events_total:HTTP:FAILURE:SERVER_ERROR': 1,
      'reliability_events_total:HTTP:CIRCUIT_BLOCKED:DEPENDENCY_FAILURE': 1,
      'reliability_circuit_blocks_total:HTTP:DEPENDENCY_FAILURE': 1
    });
  });

  it('records retryable transport exceptions in the target breaker', async () => {
    const operation = vi.fn().mockRejectedValue(new HttpClientError(
      'HTTP_REQUEST_FAILED',
      'transport failed',
      true,
      'DEPENDENCY'
    ));
    const controller = new HttpReliabilityController({
      circuitBreaker: new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 5_000 })
    });

    await expect(controller.execute(plan(), operation)).rejects.toMatchObject({ code: 'HTTP_REQUEST_FAILED' });
    await expect(controller.execute(plan(), operation)).rejects.toMatchObject({ code: 'RESOURCE_QUARANTINED' });
    expect(operation).toHaveBeenCalledOnce();
  });

  it('blocks a target after a breaker threshold without invoking the operation again', async () => {
    const operation = vi.fn().mockResolvedValue(response(503));
    const now = new Date('2026-08-27T00:00:00.000Z');
    const controller = new HttpReliabilityController({
      circuitBreaker: new CircuitBreakerRegistry({ failureThreshold: 1, resetTimeoutMs: 5_000 }, () => now)
    });

    await expect(controller.execute(plan(), operation)).resolves.toMatchObject({ cacheHit: false });
    await expect(controller.execute(plan(), operation)).rejects.toMatchObject({
      code: 'RESOURCE_QUARANTINED',
      retryable: true,
      retryAfterMs: 5_000
    });
    expect(operation).toHaveBeenCalledOnce();
  });

  it('serves GET cache hits without invoking the operation twice', async () => {
    const controller = new HttpReliabilityController({ cache: new InMemoryHttpCache() });
    const operation = vi.fn().mockResolvedValue(response(200));
    const request = plan({
      cache: { enabled: true, key: 'cache-key-1', ttlMs: 10_000 }
    });

    await expect(controller.execute(request, operation)).resolves.toMatchObject({ cacheHit: false });
    await expect(controller.execute(request, operation)).resolves.toMatchObject({ cacheHit: true });
    expect(operation).toHaveBeenCalledOnce();
  });

  it('serializes operations at the configured concurrency limit', async () => {
    const controller = new HttpReliabilityController();
    let releaseFirst: (() => void) | undefined;
    const firstDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondOperation = vi.fn().mockResolvedValue(response(200));
    const request = plan({
      rateLimit: { key: 'tenant_1:target_1', maxRequestsPerMinute: 10, maxConcurrency: 1 }
    });

    const first = controller.execute(request, async () => {
      await firstDone;
      return response(200);
    });
    const second = controller.execute(request, secondOperation);
    await Promise.resolve();
    expect(secondOperation).not.toHaveBeenCalled();

    releaseFirst?.();
    await first;
    await second;
    expect(secondOperation).toHaveBeenCalledOnce();
  });
});
