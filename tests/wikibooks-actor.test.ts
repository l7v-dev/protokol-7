/**
 * Unit and integration tests for WikibooksActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikibooksActor } from "../src/actors/corpus/wikibooks-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "Python Programming",
  extract: "Python Programming is an open textbook on the Python language.",
  description: "Computer programming textbook",
  content_urls: {
    desktop: {
      page: "https://en.wikibooks.org/wiki/Python_Programming",
    },
  },
  timestamp: "2024-01-10T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Python Programming</title></head>
<body>
  <h1>Introduction</h1>
  <div class="mw-editsection">[edit]</div>
  <p>Python is an interpreted, high-level, general-purpose programming language.</p>
  <pre>print("Hello, world!")</pre>
  <div class="navigation-not-searchable">Navigation Box</div>
</body>
</html>`;

const MOCK_SEARCH_JSON = {
  pages: [
    {
      id: 201,
      key: "Python_Programming",
      title: "Python Programming",
      excerpt: "Open textbook on <span>Python Programming</span>",
      description: "Textbook",
    },
  ],
};

describe("WikibooksActor Unit & Integration Tests", () => {
  const actor = new WikibooksActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves language and title from standard Wikibooks URL", () => {
      const res = actor.resolveParameters("https://tr.wikibooks.org/wiki/Algoritmalar", {});
      assert.strictEqual(res.lang, "tr");
      assert.strictEqual(res.title, "Algoritmalar");
      assert.strictEqual(res.action, "summary");
    });

    it("detects article action from REST path URL", () => {
      const res = actor.resolveParameters(
        "https://en.wikibooks.org/api/rest_v1/page/html/Python_Programming",
        {}
      );
      assert.strictEqual(res.lang, "en");
      assert.strictEqual(res.title, "Python Programming");
      assert.strictEqual(res.action, "article");
    });
  });

  describe("Endpoint URL Construction", () => {
    it("builds correct summary URL", () => {
      const url = actor.buildApiUrl(undefined, "en", "summary", "Python Programming");
      assert.strictEqual(
        url,
        "https://en.wikibooks.org/api/rest_v1/page/summary/Python_Programming"
      );
    });

    it("builds correct search URL", () => {
      const url = actor.buildApiUrl(undefined, "en", "search", undefined, "algorithms", 10);
      assert.strictEqual(
        url,
        "https://en.wikibooks.org/w/rest.php/v1/search/page?q=algorithms&limit=10"
      );
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metadata",
        actorType: "wikibooks",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    let server: http.Server;
    let serverPort: number;

    it("starts local mock Wikibooks HTTP server", async () => {
      server = http.createServer((req, res) => {
        const url = req.url || "";
        if (url.includes("/api/rest_v1/page/summary/")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(MOCK_SUMMARY_JSON));
        } else if (url.includes("/api/rest_v1/page/html/")) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(MOCK_ARTICLE_HTML);
        } else if (url.includes("/w/rest.php/v1/search/page")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(MOCK_SEARCH_JSON));
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            serverPort = addr.port;
          }
          resolve();
        });
      });
      assert.ok(serverPort > 0);
    });

    it("successfully harvests summary item", async () => {
      const task: ActorTask = {
        taskId: "test-summary",
        actorType: "wikibooks",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/summary/Python_Programming`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items.length, 1);
      assert.strictEqual(result.data.items[0].title, "Python Programming");
    });

    it("successfully converts article Parsoid HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-article",
        actorType: "wikibooks",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/html/Python_Programming`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items[0].fullMarkdown);
      assert.ok(result.data.items[0].fullMarkdown.includes("interpreted, high-level"));
      assert.ok(!result.data.items[0].fullMarkdown.includes("Navigation Box"));
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
