import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { RobotsParser } from "@/robots-parser";

test("RobotsParser parses Disallow, Allow and Crawl-delay rules", () => {
  const robotsTxt = `
    # Robots.txt sample
    User-agent: Googlebot
    Disallow: /private/
    Allow: /private/public-page

    User-agent: *
    Disallow: /admin
    Disallow: /auth/
    Allow: /admin/login
    Crawl-delay: 2.5
  `;

  const parser = new RobotsParser(robotsTxt);

  // Wildcard user agent tests
  assert.equal(parser.isAllowed("/blog/post-1"), true);
  assert.equal(parser.isAllowed("/admin/dashboard"), false);
  assert.equal(parser.isAllowed("/admin/login"), true); // Specific Allow overrides Disallow
  assert.equal(parser.isAllowed("/auth/session"), false);
  assert.equal(parser.getCrawlDelay(), 2.5);

  // Specific user agent tests
  assert.equal(parser.isAllowed("/private/secret", "Googlebot"), false);
  assert.equal(parser.isAllowed("/private/public-page", "Googlebot"), true);
  assert.equal(parser.isAllowed("/admin", "Googlebot"), true); // Googlebot doesn't have /admin disallow
});

test("RobotsParser handles empty Disallow as allowing all paths", () => {
  const robotsTxt = `
    User-agent: *
    Disallow:
  `;

  const parser = new RobotsParser(robotsTxt);
  assert.equal(parser.isAllowed("/anything"), true);
});

test("RobotsParser handles wildcard patterns and end anchors", () => {
  const robotsTxt = `
    User-agent: *
    Disallow: /*.pdf$
    Disallow: /temp*
  `;

  const parser = new RobotsParser(robotsTxt);
  assert.equal(parser.isAllowed("/documents/whitepaper.pdf"), false);
  assert.equal(parser.isAllowed("/documents/whitepaper.pdf?download=true"), true); // $ anchor respected
  assert.equal(parser.isAllowed("/temporary-files/doc"), false);
  assert.equal(parser.isAllowed("/normal-page"), true);
});

test("RobotsParser.fetchForOrigin retrieves and caches remote robots.txt", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("User-agent: *\nDisallow: /secret\nCrawl-delay: 1\n");
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    RobotsParser.clearCache();
    const parser = await RobotsParser.fetchForOrigin(origin, { allowLocalNetwork: true });

    assert.equal(parser.isAllowed(`${origin}/secret`), false);
    assert.equal(parser.isAllowed(`${origin}/public`), true);
    assert.equal(parser.getCrawlDelay(), 1);

    // Second fetch should use in-memory cache
    const cachedParser = await RobotsParser.fetchForOrigin(origin, { allowLocalNetwork: true });
    assert.equal(cachedParser.isAllowed(`${origin}/secret`), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
