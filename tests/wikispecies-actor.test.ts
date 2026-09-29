/**
 * Unit and integration tests for WikispeciesActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikispeciesActor } from "../src/actors/corpus/wikispecies-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "Panthera leo",
  extract: "Panthera leo is a large felid of the genus Panthera native to Africa and India.",
  description: "Species of mammal",
  content_urls: {
    desktop: {
      page: "https://species.wikimedia.org/wiki/Panthera_leo",
    },
  },
  timestamp: "2024-01-10T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>Panthera leo</title></head>
<body>
  <h1>Taxonavigation</h1>
  <div class="mw-editsection">[edit]</div>
  <p>Superregnum: Eukaryota</p>
  <p>Regnum: Animalia</p>
  <p>Familia: Felidae</p>
  <p>Genus: Panthera</p>
  <p>Species: Panthera leo</p>
  <div class="plainlinks">Links Box</div>
</body>
</html>`;

describe("WikispeciesActor Unit & Integration Tests", () => {
  const actor = new WikispeciesActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves taxon from standard Wikispecies URL", () => {
      const res = actor.resolveParameters("https://species.wikimedia.org/wiki/Panthera_leo", {});
      assert.strictEqual(res.title, "Panthera leo");
      assert.strictEqual(res.action, "summary");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metadata",
        actorType: "wikispecies",
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

    it("starts local mock Wikispecies HTTP server", async () => {
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

    it("successfully harvests summary taxon", async () => {
      const task: ActorTask = {
        taskId: "test-summary",
        actorType: "wikispecies",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/summary/Panthera_leo`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items[0].taxon, "Panthera leo");
    });

    it("successfully converts article Parsoid HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-article",
        actorType: "wikispecies",
        targetUrl: `http://127.0.0.1:${serverPort}/api/rest_v1/page/html/Panthera_leo`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items[0].fullMarkdown);
      assert.ok(result.data.items[0].fullMarkdown.includes("Taxonavigation"));
      assert.ok(result.data.items[0].fullMarkdown.includes("Felidae"));
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
