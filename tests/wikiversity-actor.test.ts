/**
 * Unit and integration tests for WikiversityActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikiversityActor } from "../src/actors/corpus/wikiversity-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "Introduction to Computer Science",
  extract: "An undergraduate university curriculum introducing computation and algorithms.",
  description: "Computer science module",
  content_urls: {
    desktop: {
      page: "https://en.wikiversity.org/wiki/Introduction_to_Computer_Science",
    },
  },
  timestamp: "2024-01-10T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Introduction to Computer Science</title></head>
<body>
  <h1>Syllabus</h1>
  <div class="mw-editsection">[edit]</div>
  <p>Week 1: Algorithmic Complexity and Big-O notation.</p>
  <div class="navigation-not-searchable">Nav Links</div>
</body>
</html>`;

describe("WikiversityActor Unit & Integration Tests", () => {
  const actor = new WikiversityActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves language and title from standard Wikiversity URL", () => {
      const res = actor.resolveParameters(
        "https://de.wikiversity.org/wiki/Mathematik_f%C3%BCr_Informatiker",
        {}
      );
      assert.strictEqual(res.lang, "de");
      assert.strictEqual(res.title, "Mathematik für Informatiker");
      assert.strictEqual(res.action, "summary");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metadata",
        actorType: "wikiversity",
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

    it("starts local mock Wikiversity HTTP server", async () => {
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
        actorType: "wikiversity",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/summary/Introduction_to_Computer_Science`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items[0].title, "Introduction to Computer Science");
    });

    it("successfully converts article Parsoid HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-article",
        actorType: "wikiversity",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/html/Introduction_to_Computer_Science`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items[0].fullMarkdown);
      assert.ok(result.data.items[0].fullMarkdown.includes("Algorithmic Complexity"));
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
