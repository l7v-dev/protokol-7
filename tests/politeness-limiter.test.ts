import assert from "node:assert/strict";
import test from "node:test";
import { PolitenessLimiter } from "@/politeness-limiter";

test("PolitenessLimiter delays subsequent requests to the same origin", async () => {
  const limiter = new PolitenessLimiter({
    minIntervalMs: 50,
    jitterRatio: 0,
  });

  const url = "https://example.com/api/v1";

  // First request should not wait (or wait 0ms)
  const firstWait = await limiter.waitForSlot(url);
  assert.equal(firstWait, 0);

  // Immediate second request to same domain should wait approximately 50ms
  const secondWait = await limiter.waitForSlot(url);
  assert.ok(secondWait >= 30, `Expected second wait >= 30ms, got ${secondWait}`);

  // Request to a different origin should not wait
  const otherOriginWait = await limiter.waitForSlot("https://other-domain.org/index");
  assert.equal(otherOriginWait, 0);
});

test("PolitenessLimiter applies exponential backoff on rate limits", () => {
  const limiter = new PolitenessLimiter({
    minIntervalMs: 100,
    maxIntervalMs: 5000,
    jitterRatio: 0,
  });

  const url = "https://api.github.com/repos";

  assert.equal(limiter.getBackoffMs(url), 0);

  // First rate limit: backoff = 100 * 2^0 = 100ms
  limiter.recordRateLimit(url);
  assert.equal(limiter.getBackoffMs(url), 100);

  // Second rate limit: backoff = 100 * 2^1 = 200ms
  limiter.recordRateLimit(url);
  assert.equal(limiter.getBackoffMs(url), 200);

  // Third rate limit: backoff = 100 * 2^2 = 400ms
  limiter.recordRateLimit(url);
  assert.equal(limiter.getBackoffMs(url), 400);

  // Success resets backoff
  limiter.recordSuccess(url);
  assert.equal(limiter.getBackoffMs(url), 0);
});

test("PolitenessLimiter respects explicit Retry-After seconds", () => {
  const limiter = new PolitenessLimiter({
    minIntervalMs: 100,
    maxIntervalMs: 10000,
    jitterRatio: 0,
  });

  const url = "https://api.test.org/data";
  limiter.recordRateLimit(url, 3); // 3 seconds

  assert.equal(limiter.getBackoffMs(url), 3000);
});

test("PolitenessLimiter staggers concurrent requests to the same origin", async () => {
  const limiter = new PolitenessLimiter({
    minIntervalMs: 40,
    jitterRatio: 0,
  });

  const url = "https://concurrency.test.com/items";

  // Trigger 3 concurrent waitForSlot calls simultaneously
  const results = await Promise.all([
    limiter.waitForSlot(url),
    limiter.waitForSlot(url),
    limiter.waitForSlot(url),
  ]);

  // First request should execute immediately (0ms wait)
  assert.equal(results[0], 0);
  // Second request should wait ~40ms
  assert.ok(results[1] >= 30, `Expected results[1] >= 30, got ${results[1]}`);
  // Third request should wait ~80ms
  assert.ok(results[2] >= 70, `Expected results[2] >= 70, got ${results[2]}`);
});
