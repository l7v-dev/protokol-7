import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isRetryableError, parseRetryAfter, withRetry } from "../src/network/retry-handler";

describe("RetryHandler - Resilient Network Retry Engine", () => {
  it("identifies retryable network error codes", () => {
    assert.equal(isRetryableError({ code: "ECONNRESET" }), true);
    assert.equal(isRetryableError({ code: "ETIMEDOUT" }), true);
    assert.equal(isRetryableError({ statusCode: 429 }), true);
    assert.equal(isRetryableError({ statusCode: 503 }), true);
    assert.equal(isRetryableError({ statusCode: 404 }), false);
    assert.equal(isRetryableError(new Error("fetch failed")), true);
  });

  it("parses numeric and date Retry-After headers", () => {
    assert.equal(parseRetryAfter("3"), 3000);
    assert.equal(parseRetryAfter("0"), 0);
    assert.equal(parseRetryAfter(undefined), undefined);
  });

  it("succeeds on first attempt without retrying", async () => {
    let attempts = 0;
    const result = await withRetry(async (att) => {
      attempts = att;
      return "success";
    });

    assert.equal(result, "success");
    assert.equal(attempts, 1);
  });

  it("retries on transient failure and resolves when subsequent attempt succeeds", async () => {
    let attempts = 0;
    const retryLogs: number[] = [];

    const result = await withRetry(
      async (att) => {
        attempts = att;
        if (att === 1) {
          const err = new Error("connection dropped");
          (err as unknown as { code: string }).code = "ECONNRESET";
          throw err;
        }
        return "recovered";
      },
      {
        maxRetries: 3,
        initialDelayMs: 20,
        onRetry: (att) => retryLogs.push(att),
      }
    );

    assert.equal(result, "recovered");
    assert.equal(attempts, 2);
    assert.deepEqual(retryLogs, [1]);
  });

  it("throws last error after maxRetries exhausted", async () => {
    let attempts = 0;
    await assert.rejects(
      async () => {
        await withRetry(
          async (att) => {
            attempts = att;
            const err = new Error("persistent timeout");
            (err as unknown as { code: string }).code = "ETIMEDOUT";
            throw err;
          },
          { maxRetries: 2, initialDelayMs: 10 }
        );
      },
      {
        message: /persistent timeout/,
      }
    );

    assert.equal(attempts, 3); // 1 initial + 2 retries
  });
});
