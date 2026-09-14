import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { BrowserPool } from "@/browser-pool";
import { PlaywrightBrowserActor } from "@/playwright-browser-actor";

test("BrowserPool manages browser context lifecycle and resource blocking", async () => {
  // Spawn local test HTTP server
  const server = http.createServer((req, res) => {
    if (req.url === "/image.png") {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end("fake-png-data");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Pool Test</title></head>
        <body>
          <h1>Browser Pool Running</h1>
          <img src="/image.png" alt="Test Image" />
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const testUrl = `http://127.0.0.1:${address.port}`;

  try {
    const session = await BrowserPool.acquireSession({
      allowLocalNetwork: true,
      blockAssets: true,
      timeoutMs: 10000,
    });

    assert.ok(session.context);
    assert.ok(session.page);

    await session.page.goto(testUrl, { waitUntil: "domcontentloaded" });
    const title = await session.page.title();
    assert.equal(title, "Pool Test");

    // Release context
    await session.release();
  } finally {
    await BrowserPool.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("PlaywrightBrowserActor scrapes dynamic HTML via BrowserPool", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Playwright Scrape Test</title>
          <meta name="description" content="Dynamic page content description" />
        </head>
        <body>
          <main>
            <h1>Playwright Dynamic Test</h1>
            <p>Rendered paragraph content.</p>
            <table id="test-table">
              <thead><tr><th>Metric</th><th>Score</th></tr></thead>
              <tbody><tr><td>Speed</td><td>99</td></tr></tbody>
            </table>
          </main>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const testUrl = `http://127.0.0.1:${address.port}`;

  try {
    const actor = new PlaywrightBrowserActor();
    const result = await actor.run(
      {
        taskId: "test-pw-task",
        actorType: "playwright-browser",
        targetUrl: testUrl,
        options: {
          extractTables: true,
          timeoutMs: 15000,
        },
      },
      {
        task: { taskId: "test-pw-task", actorType: "playwright-browser", targetUrl: testUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.data?.title, "Playwright Scrape Test");
    assert.equal(result.data?.description, "Dynamic page content description");
    assert.ok(result.data?.content.includes("Rendered paragraph content."));
    assert.ok(result.data?.tables && result.data.tables.length === 1);
    assert.equal(result.data?.tables?.[0].headers[0], "Metric");
  } finally {
    await BrowserPool.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
