import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { SerpSearchActor } from "@/actors/web/serp-search-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_DDG_HTML = `
<!DOCTYPE html>
<html>
<head><title>DuckDuckGo Search Results</title></head>
<body>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fen&rut=abc">Node.js — Run JavaScript Everywhere</a>
    </h2>
    <div class="result__snippet">Node.js is an open-source, cross-platform JavaScript runtime environment.</div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <h2 class="result__title">
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fnodejs%2Fnode&rut=def">nodejs/node: Node.js JavaScript runtime - GitHub</a>
    </h2>
    <div class="result__snippet">Contribute to nodejs/node development by creating an account on GitHub.</div>
  </div>
  <div class="result result--ad">
    <h2 class="result__title"><a class="result__a" href="https://ad.com">Sponsored Ad</a></h2>
    <div class="result__snippet">Ad text</div>
  </div>
</body>
</html>
`;

test("SerpSearchActor parses organic results, resolves redirects, and extracts rankings", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(MOCK_DDG_HTML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/html/?q=nodejs`;

  try {
    const actor = new SerpSearchActor();
    const result = await actor.run(
      {
        taskId: "test-serp-1",
        actorType: "serp-search",
        targetUrl,
      },
      {
        task: { taskId: "test-serp-1", actorType: "serp-search", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.query, "nodejs");
    assert.equal(result.data.totalResults, 2);

    const first = result.data.items[0];
    assert.equal(first.rank, 1);
    assert.equal(first.title, "Node.js — Run JavaScript Everywhere");
    assert.equal(first.url, "https://nodejs.org/en");
    assert.equal(first.domain, "nodejs.org");
    assert.ok(first.snippet.includes("open-source"));

    const second = result.data.items[1];
    assert.equal(second.rank, 2);
    assert.equal(second.title, "nodejs/node: Node.js JavaScript runtime - GitHub");
    assert.equal(second.url, "https://github.com/nodejs/node");
    assert.equal(second.domain, "github.com");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SerpSearchActor respects maxResults parameter", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(MOCK_DDG_HTML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/html/?q=nodejs`;

  try {
    const actor = new SerpSearchActor();
    const result = await actor.run(
      {
        taskId: "test-serp-limit",
        actorType: "serp-search",
        targetUrl,
        options: {
          serpOptions: {
            maxResults: 1,
          },
        },
      },
      {
        task: { taskId: "test-serp-limit", actorType: "serp-search", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.totalResults, 1);
    assert.equal(result.data.items[0].rank, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("SerpSearchActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new SerpSearchActor();
  const result = await actor.run(
    {
      taskId: "test-serp-ssrf",
      actorType: "serp-search",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
    },
    {
      task: {
        taskId: "test-serp-ssrf",
        actorType: "serp-search",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("SSRF validation failed"));
});
