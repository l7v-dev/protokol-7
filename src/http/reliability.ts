import type { HttpClientError, HttpRequestPlan, HttpResponse } from './http-client.js';
import type { CircuitBreakerRegistry } from './circuit-breaker.js';
import { ScopedBudgetRegistry, type BudgetDecision, type BudgetScope } from './budget.js';
import type { ReliabilityTelemetryCollector } from './telemetry.js';

export type AccessResultClass =
  | 'SUCCESS'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'AUTHENTICATION_REQUIRED'
  | 'ANTI_BOT_BARRIER'
  | 'POLICY_BLOCKED'
  | 'CLIENT_ERROR'
  | 'SERVER_ERROR'
  | 'DEPENDENCY_FAILURE';

export type HttpFailureClassification = {
  code: string;
  category: 'SUCCESS' | 'POLICY' | 'RATE_LIMIT' | 'TIMEOUT' | 'AUTHENTICATION' | 'ANTI_BOT' | 'CLIENT_ERROR' | 'SERVER_ERROR' | 'DEPENDENCY';
  accessClass: AccessResultClass;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
};

export type RetryDelayOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
};

export type RetryDelayInput = {
  retryAttempt: number;
  retryAfterMs?: number;
};

export type RetryDelayResult = {
  delayMs: number;
  exponentialDelayMs: number;
  jitterMs: number;
  source: 'EXPONENTIAL_BACKOFF' | 'RETRY_AFTER';
  capped: boolean;
};

export type HttpReliabilityOptions = {
  maxRetryAfterMs?: number;
  retryDelay?: RetryDelayOptions;
  circuitBreaker?: CircuitBreakerRegistry;
  budgetRegistry?: ScopedBudgetRegistry;
  telemetry?: ReliabilityTelemetryCollector;
  cache?: InMemoryHttpCache;
};

export class HttpErrorClassifier {
  public constructor(private readonly maxRetryAfterMs = 60_000) {}

  public classifyResponse(response: Pick<HttpResponse, 'status' | 'headers'>): HttpFailureClassification {
    const headers = normalizeHeaders(response.headers);
    if (response.status >= 200 && response.status <= 299) {
      return classify({
        code: 'HTTP_SUCCESS',
        category: 'SUCCESS',
        accessClass: 'SUCCESS',
        confidence: 'HIGH',
        retryable: false,
        status: response.status
      });
    }
    if (isAntiBotSignal(response.status, headers)) {
      return classify({
        code: 'HTTP_ANTI_BOT_BARRIER',
        category: 'ANTI_BOT',
        accessClass: 'ANTI_BOT_BARRIER',
        confidence: 'HIGH',
        retryable: false,
        status: response.status
      });
    }
    if (response.status === 401 || response.status === 407) {
      return classify({
        code: response.status === 407 ? 'HTTP_PROXY_AUTH_REQUIRED' : 'HTTP_AUTH_REQUIRED',
        category: 'AUTHENTICATION',
        accessClass: 'AUTHENTICATION_REQUIRED',
        confidence: 'HIGH',
        retryable: false,
        status: response.status
      });
    }
    if (response.status === 408) {
      return classify({
        code: 'HTTP_REQUEST_TIMEOUT',
        category: 'TIMEOUT',
        accessClass: 'TIMEOUT',
        confidence: 'HIGH',
        retryable: true,
        status: response.status
      });
    }
    if (response.status === 425) {
      return classify({
        code: 'HTTP_TOO_EARLY',
        category: 'RATE_LIMIT',
        accessClass: 'RATE_LIMITED',
        confidence: 'HIGH',
        retryable: true,
        status: response.status
      });
    }
    if (response.status === 429) {
      const retryAfterMs = parseRetryAfter(headers['retry-after'], this.maxRetryAfterMs);
      return classify({
        code: 'HTTP_RATE_LIMITED',
        category: 'RATE_LIMIT',
        accessClass: 'RATE_LIMITED',
        confidence: 'HIGH',
        retryable: true,
        status: response.status,
        ...(retryAfterMs === undefined ? {} : { retryAfterMs })
      });
    }
    if (response.status === 403) {
      return classify({
        code: 'HTTP_POLICY_BLOCKED',
        category: 'POLICY',
        accessClass: 'POLICY_BLOCKED',
        confidence: 'HIGH',
        retryable: false,
        status: response.status
      });
    }
    if (response.status >= 500 && response.status <= 599) {
      return classify({
        code: 'HTTP_SERVER_ERROR',
        category: 'SERVER_ERROR',
        accessClass: 'SERVER_ERROR',
        confidence: 'HIGH',
        retryable: true,
        status: response.status
      });
    }
    if (response.status >= 400 && response.status <= 499) {
      return classify({
        code: 'HTTP_CLIENT_ERROR',
        category: 'CLIENT_ERROR',
        accessClass: 'CLIENT_ERROR',
        confidence: 'HIGH',
        retryable: false,
        status: response.status
      });
    }
    return classify({
      code: 'HTTP_UNEXPECTED_STATUS',
      category: 'DEPENDENCY',
      accessClass: 'DEPENDENCY_FAILURE',
      confidence: 'MEDIUM',
      retryable: false,
      status: response.status
    });
  }

  public classifyError(error: unknown): HttpFailureClassification {
    if (isHttpClientError(error)) {
      return classifyCode(error.code, error.retryable, error.category);
    }
    if (isCodedFailure(error)) {
      return classifyCode(error.code, error.retryable);
    }
    return classify({
      code: 'HTTP_WORKER_ERROR',
      category: 'DEPENDENCY',
      accessClass: 'DEPENDENCY_FAILURE',
      confidence: 'LOW',
      retryable: true
    });
  }
}

function classify(input: Omit<HttpFailureClassification, 'status' | 'retryAfterMs'> & { status?: number; retryAfterMs?: number }): HttpFailureClassification {
  return {
    ...input,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.retryAfterMs === undefined ? {} : { retryAfterMs: input.retryAfterMs })
  };
}

function classifyCode(
  code: string,
  retryable: boolean,
  sourceCategory?: HttpClientError['category']
): HttpFailureClassification {
  const normalized = code.toUpperCase();
  if (sourceCategory === 'POLICY' || normalized.includes('PRIVATE_TARGET') || normalized.includes('POLICY')) {
    return classify({
      code,
      category: 'POLICY',
      accessClass: 'POLICY_BLOCKED',
      confidence: 'HIGH',
      retryable: false
    });
  }
  if (hasAny(normalized, ['CAPTCHA', 'ANTI_BOT', 'CHALLENGE', 'WAF'])) {
    return classify({
      code,
      category: 'ANTI_BOT',
      accessClass: 'ANTI_BOT_BARRIER',
      confidence: 'HIGH',
      retryable: false
    });
  }
  if (hasAny(normalized, ['AUTH', 'UNAUTHORIZED', 'CREDENTIAL'])) {
    return classify({
      code,
      category: 'AUTHENTICATION',
      accessClass: 'AUTHENTICATION_REQUIRED',
      confidence: 'HIGH',
      retryable: false
    });
  }
  if (hasAny(normalized, ['RATE_LIMIT', 'TOO_EARLY', 'THROTTLE'])) {
    return classify({
      code,
      category: 'RATE_LIMIT',
      accessClass: 'RATE_LIMITED',
      confidence: 'MEDIUM',
      retryable,
    });
  }
  if (normalized.includes('TIMEOUT')) {
    return classify({
      code,
      category: 'TIMEOUT',
      accessClass: 'TIMEOUT',
      confidence: 'HIGH',
      retryable
    });
  }
  if (sourceCategory === 'VALIDATION') {
    return classify({
      code,
      category: 'CLIENT_ERROR',
      accessClass: 'CLIENT_ERROR',
      confidence: 'HIGH',
      retryable: false
    });
  }
  if (sourceCategory === 'EXECUTION') {
    return classify({
      code,
      category: 'DEPENDENCY',
      accessClass: 'DEPENDENCY_FAILURE',
      confidence: 'MEDIUM',
      retryable
    });
  }
  return classify({
    code,
    category: 'DEPENDENCY',
    accessClass: 'DEPENDENCY_FAILURE',
    confidence: 'LOW',
    retryable
  });
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value.toLowerCase()]));
}

function isAntiBotSignal(status: number, headers: Record<string, string>): boolean {
  if (status !== 403 && status !== 429) return false;
  return hasAny(Object.keys(headers), ['cf-mitigated', 'x-captcha', 'x-captcha-required', 'x-amzn-waf-action', 'x-sucuri-block']);
}

function hasAny(value: string[] | string, needles: string[]): boolean {
  const source = Array.isArray(value) ? value.join(' ') : value;
  return needles.some((needle) => source.includes(needle));
}

export function parseRetryAfter(value: string | undefined, maxRetryAfterMs = 60_000, nowMs = Date.now()): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.round(seconds * 1_000), maxRetryAfterMs);
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return undefined;
  }
  return Math.min(Math.max(dateMs - nowMs, 0), maxRetryAfterMs);
}

export class RetryDelayCalculator {
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly jitterRatio: number;
  private readonly random: () => number;

  public constructor(options: RetryDelayOptions = {}) {
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 60_000;
    this.jitterRatio = options.jitterRatio ?? 0.2;
    this.random = options.random ?? Math.random;
    if (!Number.isFinite(this.baseDelayMs) || this.baseDelayMs <= 0
      || !Number.isFinite(this.maxDelayMs) || this.maxDelayMs < this.baseDelayMs
      || !Number.isFinite(this.jitterRatio) || this.jitterRatio < 0 || this.jitterRatio > 1) {
      throw new Error('Retry delay options are invalid.');
    }
  }

  public calculate(input: RetryDelayInput): RetryDelayResult {
    if (!Number.isInteger(input.retryAttempt) || input.retryAttempt < 1
      || (input.retryAfterMs !== undefined && (!Number.isFinite(input.retryAfterMs) || input.retryAfterMs < 0))) {
      throw new Error('Retry delay input is invalid.');
    }
    const exponentialDelayMs = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * (2 ** Math.min(input.retryAttempt - 1, 30))
    );
    const floorDelayMs = Math.min(this.maxDelayMs, Math.max(exponentialDelayMs, input.retryAfterMs ?? 0));
    const randomValue = Math.min(Math.max(this.random(), 0), 1);
    const jitterMs = Math.min(
      Math.max(this.maxDelayMs - floorDelayMs, 0),
      Math.round(floorDelayMs * this.jitterRatio * randomValue)
    );
    const delayMs = Math.min(this.maxDelayMs, floorDelayMs + jitterMs);
    return {
      delayMs,
      exponentialDelayMs,
      jitterMs,
      source: input.retryAfterMs === undefined ? 'EXPONENTIAL_BACKOFF' : 'RETRY_AFTER',
      capped: delayMs >= this.maxDelayMs
    };
  }
}

export class RetryBudget {
  private consumed = 0;

  public constructor(private readonly maxRetries: number) {
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error('Retry budget must be a non-negative integer.');
    }
  }

  public consume(): boolean {
    if (this.consumed >= this.maxRetries) {
      return false;
    }
    this.consumed += 1;
    return true;
  }

  public get remaining(): number {
    return Math.max(this.maxRetries - this.consumed, 0);
  }
}

export class RetryBudgetRegistry {
  private readonly budgets = new Map<string, RetryBudget>();

  public consume(key: string, maxRetries: number): boolean {
    const budget = this.budgets.get(key) ?? new RetryBudget(maxRetries);
    this.budgets.set(key, budget);
    return budget.consume();
  }

  public clear(key: string): void {
    this.budgets.delete(key);
  }
}

export class TargetConcurrencyGovernor {
  private readonly states = new Map<string, Semaphore>();

  public async acquire(key: string, maxConcurrency: number): Promise<() => void> {
    const semaphore = this.states.get(key) ?? new Semaphore(maxConcurrency);
    this.states.set(key, semaphore);
    return semaphore.acquire();
  }
}

export class TargetRateLimiter {
  private readonly states = new Map<string, RateWindow>();

  public async acquire(key: string, maxRequestsPerMinute: number): Promise<void> {
    if (!Number.isInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1) {
      throw new Error('maxRequestsPerMinute must be a positive integer.');
    }

    const state = this.states.get(key) ?? { startedAt: Date.now(), requests: 0 };
    const now = Date.now();
    if (now - state.startedAt >= 60_000) {
      state.startedAt = now;
      state.requests = 0;
    }

    if (state.requests >= maxRequestsPerMinute) {
      const waitMs = Math.max(60_000 - (now - state.startedAt), 1);
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      return this.acquire(key, maxRequestsPerMinute);
    }

    state.requests += 1;
    this.states.set(key, state);
  }
}

type RateWindow = {
  startedAt: number;
  requests: number;
};

export type CacheEntry = {
  response: HttpResponse;
  expiresAt: number;
};

export class InMemoryHttpCache {
  private readonly entries = new Map<string, CacheEntry>();

  public get(key: string, nowMs = Date.now()): HttpResponse | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= nowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return { ...entry.response, headers: { ...entry.response.headers } };
  }

  public set(key: string, response: HttpResponse, ttlMs: number, nowMs = Date.now()): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      return;
    }
    this.entries.set(key, {
      response: { ...response, headers: { ...response.headers } },
      expiresAt: nowMs + ttlMs
    });
  }

  public clear(): void {
    this.entries.clear();
  }
}

export class HttpReliabilityController {
  private readonly classifier: HttpErrorClassifier;
  private readonly retryDelay: RetryDelayCalculator;
  private readonly circuitBreaker: CircuitBreakerRegistry | undefined;
  private readonly scopedBudgets: ScopedBudgetRegistry;
  private readonly telemetry: ReliabilityTelemetryCollector | undefined;
  private readonly concurrency: TargetConcurrencyGovernor;
  private readonly rateLimiter: TargetRateLimiter;
  private readonly budgets: RetryBudgetRegistry;
  private readonly cache: InMemoryHttpCache;

  public constructor(options: HttpReliabilityOptions = {}) {
    this.classifier = new HttpErrorClassifier(options.maxRetryAfterMs);
    this.retryDelay = new RetryDelayCalculator(options.retryDelay);
    this.circuitBreaker = options.circuitBreaker;
    this.scopedBudgets = options.budgetRegistry ?? new ScopedBudgetRegistry();
    this.telemetry = options.telemetry;
    this.concurrency = new TargetConcurrencyGovernor();
    this.rateLimiter = new TargetRateLimiter();
    this.budgets = new RetryBudgetRegistry();
    this.cache = options.cache ?? new InMemoryHttpCache();
  }

  public async execute(
    plan: HttpRequestPlan,
    operation: () => Promise<HttpResponse>
  ): Promise<{ response: HttpResponse; cacheHit: boolean }> {
    const cacheConfig = plan.cache;
    const cacheKey = cacheConfig?.key ?? `${plan.method}:${plan.url}`;
    const canReadCache = plan.method === 'GET' && cacheConfig?.enabled === true;
    const circuitScope = {
      tenantId: plan.tenantId,
      kind: 'TARGET' as const,
      resource: plan.targetId
    };
    try {
      this.circuitBreaker?.assertAllowed(circuitScope);
    } catch (error) {
      this.telemetry?.record({
        tenantId: plan.tenantId,
        jobId: plan.jobId,
        taskId: plan.taskId,
        attemptId: plan.attemptId,
        targetId: plan.targetId,
        strategy: 'HTTP',
        accessClass: 'DEPENDENCY_FAILURE',
        outcome: 'CIRCUIT_BLOCKED',
        code: error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'CIRCUIT_OPEN'
      });
      throw error;
    }

    if (canReadCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { response: cached, cacheHit: true };
      }
    }

    const rateConfig = plan.rateLimit;
    if (rateConfig) {
      await this.rateLimiter.acquire(rateConfig.key, rateConfig.maxRequestsPerMinute);
    }
    const release = await this.concurrency.acquire(
      rateConfig?.key ?? `${plan.tenantId}:${plan.targetId}`,
      rateConfig?.maxConcurrency ?? 1
    );

    try {
      try {
        const response = await operation();
        const classification = this.classifier.classifyResponse(response);
        if (classification.accessClass === 'SUCCESS') {
          this.circuitBreaker?.recordSuccess(circuitScope);
        } else if (isCircuitFailure(classification.accessClass)) {
          this.circuitBreaker?.recordFailure(circuitScope);
        }
        this.telemetry?.record({
          tenantId: plan.tenantId,
          jobId: plan.jobId,
          taskId: plan.taskId,
          attemptId: plan.attemptId,
          targetId: plan.targetId,
          strategy: 'HTTP',
          accessClass: classification.accessClass,
          outcome: classification.accessClass === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
          code: classification.code
        });
        if (canReadCache && response.status >= 200 && response.status < 300) {
          this.cache.set(cacheKey, response, cacheConfig?.ttlMs ?? 0);
        }
        return { response, cacheHit: false };
      } catch (error) {
        const classification = this.classifier.classifyError(error);
        if (isCircuitFailure(classification.accessClass)) {
          this.circuitBreaker?.recordFailure(circuitScope);
        }
        this.telemetry?.record({
          tenantId: plan.tenantId,
          jobId: plan.jobId,
          taskId: plan.taskId,
          attemptId: plan.attemptId,
          targetId: plan.targetId,
          strategy: 'HTTP',
          accessClass: classification.accessClass,
          outcome: 'FAILURE',
          code: classification.code
        });
        throw error;
      }
    } finally {
      release();
    }
  }

  public classifyResponse(response: Pick<HttpResponse, 'status' | 'headers'>): HttpFailureClassification {
    return this.classifier.classifyResponse(response);
  }

  public classifyError(error: unknown): HttpFailureClassification {
    return this.classifier.classifyError(error);
  }

  public calculateRetryDelay(input: RetryDelayInput): RetryDelayResult {
    return this.retryDelay.calculate(input);
  }

  public consumeRetry(key: string, maxRetries: number): boolean {
    return this.budgets.consume(key, maxRetries);
  }

  public consumeRetryBudget(input: Omit<BudgetScope, 'kind'>): BudgetDecision {
    return this.scopedBudgets.consume({ ...input, kind: 'RETRY' });
  }

  public consumeEscalationBudget(input: Omit<BudgetScope, 'kind'>): BudgetDecision {
    return this.scopedBudgets.consume({ ...input, kind: 'ESCALATION' });
  }

  public clearRetryBudget(key: string): void {
    this.budgets.clear(key);
  }
}

function isCircuitFailure(accessClass: AccessResultClass): boolean {
  return accessClass === 'RATE_LIMITED'
    || accessClass === 'TIMEOUT'
    || accessClass === 'SERVER_ERROR'
    || accessClass === 'DEPENDENCY_FAILURE';
}

class Semaphore {
  private available: number;
  private readonly waiters: Array<(release: () => void) => void> = [];

  public constructor(maxConcurrency: number) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error('maxConcurrency must be a positive integer.');
    }
    this.available = maxConcurrency;
  }

  public async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1;
      return this.createRelease();
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(this.createRelease());
      } else {
        this.available += 1;
      }
    };
  }
}

function isHttpClientError(error: unknown): error is HttpClientError {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && 'retryable' in error
    && 'category' in error;
}

function isCodedFailure(error: unknown): error is { code: string; retryable: boolean } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    && 'retryable' in error
    && typeof error.retryable === 'boolean';
}
