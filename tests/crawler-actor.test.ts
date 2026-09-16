import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { CrawlerActor } from "@/crawler-actor";

test("CrawlerActor crawls connected pages respecting maxPages and robots.txt", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/robots.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("User-agent: *\nDisallow: /disallowed-section\n");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

    if (req.url === "/") {
      res.end(`
        <html>
          <head><title>Home Page</title></head>
          <body>
            <a href="/page1">Page 1</a>
            <a href="/disallowed-section">Disallowed</a>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === "/page1") {
      res.end(`
        <html>
          <head><title>Page One</title></head>
          <body>
            <p>Page 1 content body</p>
            <a href="/page2">Page 2</a>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === "/page2") {
      res.end("<html><head><title>Page Two</title></head><body>Page 2 body</body></html>");
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const crawler = new CrawlerActor();
    const result = await crawler.run(
      {
        taskId: "test-crawl-task",
        actorType: "crawler",
        targetUrl: origin,
        options: {
          crawlerOptions: {
            maxPages: 3,
            maxDepth: 2,
            respectRobotsTxt: true,
          },
        },
      },
      {
        task: { taskId: "test-crawl-task", actorType: "crawler", targetUrl: origin },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.startUrl, origin);
    assert.ok(result.data.totalCrawled >= 2);

    // Verify robots.txt blocked disallowed-section
    const visitedUrls = result.data.pages.map((p) => p.url);
    assert.ok(!visitedUrls.some((u) => u.includes("/disallowed-section")));
    assert.ok(visitedUrls.some((u) => u.includes("/page1")));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("CrawlerActor crawls with disk-backed CrawlFrontier and streams to JSONL", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const testDir = path.join(__dirname, ".tmp-crawler-frontier-test");
  const outputJsonl = path.join(testDir, "streamed-crawl.jsonl");

  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    if (req.url === "/") {
      res.end(
        `<html><head><title>Root</title></head><body><a href="/sub1">Sub 1</a></body></html>`
      );
      return;
    }
    if (req.url === "/sub1") {
      res.end(`<html><head><title>Sub One</title></head><body><p>Deep data</p></body></html>`);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const origin = `http://127.0.0.1:${address.port}`;

  try {
    const crawler = new CrawlerActor();
    const result = await crawler.run(
      {
        taskId: "test-frontier-crawl",
        actorType: "crawler",
        targetUrl: origin,
        options: {
          crawlerOptions: {
            maxPages: 5,
            maxDepth: 2,
            respectRobotsTxt: false,
            frontierDirectory: testDir,
            outputJsonlPath: outputJsonl,
          },
        },
      },
      {
        task: { taskId: "test-frontier-crawl", actorType: "crawler", targetUrl: origin },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.totalCrawled, 2);
    assert.equal(fs.existsSync(outputJsonl), true);

    const jsonlLines = fs.readFileSync(outputJsonl, "utf8").trim().split("\n");
    assert.equal(jsonlLines.length, 2);
    const parsedFirst = JSON.parse(jsonlLines[0]);
    assert.equal(parsedFirst.title, "Root");

    assert.equal(fs.existsSync(path.join(testDir, "checkpoint.json")), true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  }
});
