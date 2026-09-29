/**
 * Unit and integration tests for WikiquoteActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikiquoteActor } from "../src/actors/corpus/wikiquote-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "Albert Einstein",
  extract: "Albert Einstein was a German-born theoretical physicist.",
  description: "Theoretical physicist",
  content_urls: {
    desktop: {
      page: "https://en.wikiquote.org/wiki/Albert_Einstein",
    },
  },
  timestamp: "2024-01-10T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Albert Einstein</title></head>
<body>
  <h1>Quotes</h1>
  <div class="mw-editsection">[edit]</div>
  <div class="quotebox">Imagination is more important than knowledge.</div>
  <ul>
    <li>The important thing is not to stop questioning.</li>
  </ul>
  <div class="navbox">Footer Links</div>
</body>
</html>`;

const MOCK_SEARCH_JSON = {
  pages: [
    {
      id: 101,
      key: "Albert_Einstein",
      title: "Albert Einstein",
      excerpt: "Quotes by <span>Albert Einstein</span>",
      description: "German-born theoretical physicist",
    },
  ],
};

describe("WikiquoteActor Unit & Integration Tests", () => {
  const actor = new WikiquoteActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves language and title from standard Wikiquote URL", () => {
      const res = actor.resolveParameters("https://tr.wikiquote.org/wiki/Mevlana", {});
      assert.strictEqual(res.lang, "tr");
      assert.strictEqual(res.title, "Mevlana");
      assert.strictEqual(res.action, "summary");
    });

    it("detects article action from REST path URL", () => {
      const res = actor.resolveParameters(
        "https://en.wikiquote.org/api/rest_v1/page/html/Albert_Einstein",
        {}
      );
      assert.strictEqual(res.lang, "en");
      assert.strictEqual(res.title, "Albert Einstein");
      assert.strictEqual(res.action, "article");
    });

    it("detects search action when query is present without title", () => {
      const res = actor.resolveParameters(undefined, { query: "relativity", lang: "en" });
      assert.strictEqual(res.action, "search");
      assert.strictEqual(res.query, "relativity");
    });
  });

  describe("Endpoint URL Construction", () => {
    it("builds correct summary URL", () => {
      const url = actor.buildApiUrl(undefined, "tr", "summary", "Adalet");
      assert.strictEqual(url, "https://tr.wikiquote.org/api/rest_v1/page/summary/Adalet");
    });

    it("builds correct article URL", () => {
      const url = actor.buildApiUrl(undefined, "en", "article", "Albert Einstein");
      assert.strictEqual(url, "https://en.wikiquote.org/api/rest_v1/page/html/Albert_Einstein");
    });

    it("builds correct search URL", () => {
      const url = actor.buildApiUrl(undefined, "en", "search", undefined, "physics", 5);
      assert.strictEqual(
        url,
        "https://en.wikiquote.org/w/rest.php/v1/search/page?q=physics&limit=5"
      );
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metadata",
        actorType: "wikiquote",
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

    it("starts local mock Wikiquote HTTP server", async () => {
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
        actorType: "wikiquote",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/summary/Albert_Einstein`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items.length, 1);
      assert.strictEqual(result.data.items[0].title, "Albert Einstein");
      assert.ok(result.data.items[0].extract?.includes("theoretical physicist"));
    });

    it("successfully converts article Parsoid HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-article",
        actorType: "wikiquote",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/html/Albert_Einstein`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items[0].fullMarkdown);
      assert.ok(result.data.items[0].fullMarkdown.includes("Imagination is more important"));
      assert.ok(!result.data.items[0].fullMarkdown.includes("Footer Links"));
    });

    it("successfully executes search discovery", async () => {
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "wikiquote",
        targetUrl: `http://127.0.0.1:${serverPort}/w/rest.php/v1/search/page?q=einstein&limit=5`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.data?.items.length, 1);
      assert.strictEqual(result.data?.items[0].title, "Albert Einstein");
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
