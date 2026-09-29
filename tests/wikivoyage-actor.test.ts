/**
 * Unit and integration tests for WikivoyageActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikivoyageActor } from "../src/actors/corpus/wikivoyage-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "Istanbul",
  extract: "Istanbul is the largest city in Turkey, straddling the Bosporus strait.",
  description: "Metropolis in Turkey",
  content_urls: {
    desktop: {
      page: "https://en.wikivoyage.org/wiki/Istanbul",
    },
  },
  timestamp: "2024-01-10T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Istanbul</title></head>
<body>
  <h1>Understand</h1>
  <div class="mw-editsection">[edit]</div>
  <p>Istanbul connects Europe and Asia.</p>
  <div class="vcard">Hagia Sophia: Historic Byzantine basilica.</div>
  <div class="banner-box">Banner Image</div>
</body>
</html>`;

describe("WikivoyageActor Unit & Integration Tests", () => {
  const actor = new WikivoyageActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves language and title from standard Wikivoyage URL", () => {
      const res = actor.resolveParameters("https://tr.wikivoyage.org/wiki/Kapadokya", {});
      assert.strictEqual(res.lang, "tr");
      assert.strictEqual(res.title, "Kapadokya");
      assert.strictEqual(res.action, "summary");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metadata",
        actorType: "wikivoyage",
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

    it("starts local mock Wikivoyage HTTP server", async () => {
      server = http.createServer((req, res) => {
        const url = req.url || "";
        if (url.includes("/api/rest_v1/page/summary/")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(MOCK_SUMMARY_JSON));
        } else if (url.includes("/api/rest_v1/page/html/")) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(MOCK_ARTICLE_HTML);
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
        actorType: "wikivoyage",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/summary/Istanbul`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items[0].title, "Istanbul");
    });

    it("successfully converts article Parsoid HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-article",
        actorType: "wikivoyage",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/html/Istanbul`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items[0].fullMarkdown);
      assert.ok(result.data.items[0].fullMarkdown.includes("Hagia Sophia"));
      assert.ok(!result.data.items[0].fullMarkdown.includes("Banner Image"));
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
