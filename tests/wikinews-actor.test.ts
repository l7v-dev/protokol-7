/**
 * Unit and integration tests for WikinewsActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikinewsActor } from "../src/actors/corpus/wikinews-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "James Webb Space Telescope",
  extract: "The James Webb Space Telescope has captured new high-resolution images.",
  description: "Space astronomy news",
  content_urls: {
    desktop: {
      page: "https://en.wikinews.org/wiki/James_Webb_Space_Telescope",
    },
  },
  timestamp: "2024-01-10T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>James Webb Space Telescope</title></head>
<body>
  <h1>News Dispatch</h1>
  <div class="mw-editsection">[edit]</div>
  <p>Astronomers announced the discovery of primordial galaxies.</p>
  <div class="published">Published 2024-01-10</div>
</body>
</html>`;

describe("WikinewsActor Unit & Integration Tests", () => {
  const actor = new WikinewsActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves language and title from standard Wikinews URL", () => {
      const res = actor.resolveParameters(
        "https://fr.wikinews.org/wiki/D%C3%A9couverte_spatiale",
        {}
      );
      assert.strictEqual(res.lang, "fr");
      assert.strictEqual(res.title, "Découverte spatiale");
      assert.strictEqual(res.action, "summary");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metadata",
        actorType: "wikinews",
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

    it("starts local mock Wikinews HTTP server", async () => {
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
        actorType: "wikinews",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/summary/James_Webb_Space_Telescope`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items[0].title, "James Webb Space Telescope");
    });

    it("successfully converts article Parsoid HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-article",
        actorType: "wikinews",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/html/James_Webb_Space_Telescope`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items[0].fullMarkdown);
      assert.ok(result.data.items[0].fullMarkdown.includes("primordial galaxies"));
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
