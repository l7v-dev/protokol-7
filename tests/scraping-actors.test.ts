import test from "node:test";
import assert from "node:assert/strict";
import * as http from "http";
import { normalizeUrl } from "@/url-normalizer";
import { matchUrlPattern } from "@/url-pattern-matcher";
import { CrawlUrlAccumulator } from "@/crawl-url-accumulator";
import { CheerioScraperActor } from "@/cheerio-scraper-actor";

test("normalizeUrl validates and standardizes URLs", () => {
  const withProtocol = normalizeUrl("https://example.com/docs/");
  assert.equal(withProtocol.valid, true);
  assert.equal(withProtocol.url, "https://example.com/docs");

  const missingProtocol = normalizeUrl("example.com/api/v1");
  assert.equal(missingProtocol.valid, true);
  assert.equal(missingProtocol.url, "https://example.com/api/v1");

  const invalidProtocol = normalizeUrl("ftp://example.com/file");
  assert.equal(invalidProtocol.valid, false);
  assert.ok(invalidProtocol.errorMessage?.includes("Invalid protocol"));

  const invalidTld = normalizeUrl("https://invalid-host-without-tld");
  assert.equal(invalidTld.valid, false);
  assert.ok(invalidTld.errorMessage?.includes("Invalid hostname"));
});

test("matchUrlPattern evaluates wildcard patterns correctly", () => {
  assert.equal(matchUrlPattern("https://example.com/page", "*"), true);
  assert.equal(matchUrlPattern("https://example.com/docs/intro", "*docs*"), true);
  assert.equal(matchUrlPattern("https://example.com/blog/intro", "*docs*"), false);
  assert.equal(matchUrlPattern("https://example.com/api/v1", "https://example.com/api/*"), true);
  assert.equal(matchUrlPattern("https://example.com/image.png", "*.png"), true);
  assert.equal(matchUrlPattern("https://example.com/image.jpg", "*.png"), false);
});

test("CrawlUrlAccumulator enforces deduplication, depth, and patterns", () => {
  const accumulator = new CrawlUrlAccumulator({
    startUrl: "https://example.com",
    maxPages: 3,
    maxDepth: 1,
    includePatterns: ["*example.com*"],
    excludePatterns: ["*admin*"],
  });

  accumulator.addUrls(
    [
      "https://example.com/page1",
      "https://example.com/admin/settings", // should be excluded
      "https://example.com/page1", // duplicate
      "https://other.com/page", // not matching include pattern
      "https://example.com/page2",
      "https://example.com/page3", // exceeds maxPages limit
    ],
    1
  );

  const first = accumulator.next();
  assert.equal(first?.url, "https://example.com");

  const second = accumulator.next();
  assert.equal(second?.url, "https://example.com/page1");

  const third = accumulator.next();
  assert.equal(third?.url, "https://example.com/page2");

  assert.equal(accumulator.hasMore(), false);
  assert.equal(accumulator.getVisitedCount(), 3);
});

test("CheerioScraperActor extracts metadata, selectors, and sanitized content", async () => {
  // Spawn local test HTTP server
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="Test Page Description" />
          <link rel="icon" href="/favicon.ico" />
        </head>
        <body>
          <header><nav><a href="/about">About</a></nav></header>
          <main>
            <h1>Main Heading</h1>
            <p>Readable body content paragraph.</p>
            <div class="pricing-card">$99 / month</div>
          </main>
          <script>console.log("ignore script");</script>
          <footer>Footer text</footer>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const testUrl = `http://127.0.0.1:${address.port}`;

  try {
    const actor = new CheerioScraperActor();
    const result = await actor.run(
      {
        taskId: "test-task-1",
        actorType: "cheerio-scraper",
        targetUrl: testUrl,
        selectors: {
          pricing: ".pricing-card",
        },
      },
      {
        task: { taskId: "test-task-1", actorType: "cheerio-scraper", targetUrl: testUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.data?.title, "Test Page Title");
    assert.equal(result.data?.description, "Test Page Description");
    assert.equal(result.data?.selectedData?.pricing, "$99 / month");
    assert.ok(result.data?.content.includes("Readable body content paragraph."));
    assert.ok(!result.data?.content.includes("console.log"));
    assert.ok(result.data?.links?.some((l) => l.includes("/about")));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

