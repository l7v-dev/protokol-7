/**
 * Resilient retry decorator with exponential backoff and jitter.
 * Automatically retries operations failing with transient network errors (ECONNRESET, ETIMEDOUT)
 * or rate limit responses (HTTP 429, 503), honoring Retry-After directives.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  retryableStatusCodes?: number[];
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * Determines whether an error is transient and eligible for retry.
 */
export function isRetryableError(
  error: unknown,
  retryableStatuses = DEFAULT_RETRYABLE_STATUSES
): boolean {
  if (!error) return false;

  if (typeof error === "object" && error !== null) {
    // Check custom statusCode property
    const status =
      (error as { statusCode?: number; status?: number }).statusCode ??
      (error as { status?: number }).status;
    if (typeof status === "number" && retryableStatuses.has(status)) {
      return true;
    }

    // Check system error code (e.g. error.code === 'ECONNRESET')
    const code = (error as { code?: string }).code;
    if (typeof code === "string" && RETRYABLE_NETWORK_CODES.has(code)) {
      return true;
    }

    // Check error message patterns
    const msg = (error as Error).message || "";
    if (
      msg.includes("fetch failed") ||
      msg.includes("network timeout") ||
      msg.includes("socket hang up") ||
      msg.includes("Connection reset")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Parses Retry-After header value in seconds or HTTP-date.
 */
export function parseRetryAfter(headerValue: string | null | undefined): number | undefined {
  if (!headerValue) return undefined;

  const seconds = parseFloat(headerValue);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(headerValue);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return Math.max(0, diff);
  }

  return undefined;
}

/**
 * Wraps an async operation with exponential backoff and jitter retries.
 */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const applyJitter = options.jitter !== false;
  const retryableStatuses = new Set(options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUSES);

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: unknown) {
      lastError = err;

      if (attempt > maxRetries || !isRetryableError(err, retryableStatuses)) {
        throw err;
      }

      // Compute backoff delay
      let delay = initialDelayMs * backoffMultiplier ** (attempt - 1);
      if (applyJitter) {
        const jitterAmount = Math.random() * delay * 0.25;
        delay = Math.floor(delay + jitterAmount);
      }
      delay = Math.min(delay, maxDelayMs);

      // Check if error contains explicit retryAfterMs
      if (typeof err === "object" && err !== null && "retryAfterMs" in err) {
        const explicitMs = (err as { retryAfterMs?: number }).retryAfterMs;
        if (typeof explicitMs === "number" && explicitMs > 0) {
          delay = Math.min(explicitMs, maxDelayMs);
        }
      }

      options.onRetry?.(attempt, err, delay);

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
