/**
 * Domain-level rate limiter and backoff controller for web scraping.
 * Enforces politeness delays between consecutive requests to the same origin,
 * and applies exponential backoff with jitter upon receiving HTTP 429 / 503 responses.
 */

export interface PolitenessLimiterOptions {
  minIntervalMs?: number;
  maxIntervalMs?: number;
  jitterRatio?: number;
}

interface DomainRateState {
  nextAllowedTime: number;
  lastRequestTime: number;
  consecutiveRateLimits: number;
  currentBackoffMs: number;
}

export class PolitenessLimiter {
  private readonly domainStates = new Map<string, DomainRateState>();
  private minIntervalMs: number;
  private readonly maxIntervalMs: number;
  private readonly jitterRatio: number;

  constructor(options?: PolitenessLimiterOptions) {
    const isTest = process.env.NODE_ENV === "test";
    this.minIntervalMs = options?.minIntervalMs ?? (isTest ? 20 : 1000);
    this.maxIntervalMs = options?.maxIntervalMs ?? (isTest ? 500 : 30000);
    this.jitterRatio = options?.jitterRatio ?? 0.2;
  }

  /**
   * Updates minimum interval between requests (e.g. from robots.txt crawl-delay).
   */
  setMinInterval(ms: number): void {
    if (ms > 0) {
      this.minIntervalMs = Math.min(ms, this.maxIntervalMs);
    }
  }

  /**
   * Extracts lowercase hostname from URL. Falls back to input string if parsing fails.
   */
  private extractHostname(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      return parsed.hostname.toLowerCase();
    } catch {
      return rawUrl.toLowerCase();
    }
  }

  /**
   * Calculates random jitter to prevent synchronization collisions.
   */
  private computeJitter(baseDelay: number): number {
    if (this.jitterRatio <= 0 || baseDelay <= 0) return 0;
    const maxJitter = baseDelay * this.jitterRatio;
    return Math.floor(Math.random() * maxJitter);
  }

  /**
   * Blocks until the politeness interval for the target hostname has elapsed.
   * Atomically books the next execution slot to eliminate concurrent request collisions.
   * Returns the number of milliseconds waited.
   */
  async waitForSlot(url: string): Promise<number> {
    const hostname = this.extractHostname(url);
    const now = Date.now();
    const state = this.domainStates.get(hostname) ?? {
      nextAllowedTime: 0,
      lastRequestTime: 0,
      consecutiveRateLimits: 0,
      currentBackoffMs: 0,
    };

    const targetInterval = Math.min(
      this.minIntervalMs + state.currentBackoffMs,
      this.maxIntervalMs
    );
    const jitter = this.computeJitter(targetInterval);
    const requiredDelay = targetInterval + jitter;

    // Atomically schedule next slot BEFORE any async wait
    const scheduledTime = Math.max(now, state.nextAllowedTime);
    state.nextAllowedTime = scheduledTime + requiredDelay;
    state.lastRequestTime = scheduledTime;
    this.domainStates.set(hostname, state);

    const waitTime = scheduledTime - now;
    if (waitTime > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    }

    return waitTime;
  }

  /**
   * Signals that a request to the target domain returned HTTP 429 Too Many Requests or 503.
   * Multiplies the domain backoff exponentially and advances the next allowed schedule.
   */
  recordRateLimit(url: string, retryAfterSeconds?: number): void {
    const hostname = this.extractHostname(url);
    const state = this.domainStates.get(hostname) ?? {
      nextAllowedTime: Date.now(),
      lastRequestTime: Date.now(),
      consecutiveRateLimits: 0,
      currentBackoffMs: 0,
    };

    state.consecutiveRateLimits += 1;

    if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
      state.currentBackoffMs = Math.min(retryAfterSeconds * 1000, this.maxIntervalMs);
    } else {
      const multiplier = 2 ** (state.consecutiveRateLimits - 1);
      const computedBackoff = this.minIntervalMs * multiplier;
      state.currentBackoffMs = Math.min(computedBackoff, this.maxIntervalMs);
    }

    state.nextAllowedTime = Math.max(Date.now(), state.nextAllowedTime) + state.currentBackoffMs;
    this.domainStates.set(hostname, state);
  }

  /**
   * Signals that a request to the target domain succeeded.
   * Resets exponential backoff and rate limit counters.
   */
  recordSuccess(url: string): void {
    const hostname = this.extractHostname(url);
    const state = this.domainStates.get(hostname);
    if (state) {
      state.consecutiveRateLimits = 0;
      state.currentBackoffMs = 0;
    }
  }

  /**
   * Returns the current backoff delay in milliseconds for a domain.
   */
  getBackoffMs(url: string): number {
    const hostname = this.extractHostname(url);
    return this.domainStates.get(hostname)?.currentBackoffMs ?? 0;
  }

  /**
   * Clears all stored domain rate states.
   */
  clear(): void {
    this.domainStates.clear();
  }
}
