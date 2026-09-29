/**
 * Unit and integration tests for WikisourceActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikisourceActor } from "../src/actors/corpus/wikisource-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "De bello Gallico",
  extract: "Commentarii de Bello Gallico est opus Iulii Caesaris de bellis a se gestis.",
  description: "Opus historicum Iulii Caesaris",
  content_urls: {
    desktop: {
      page: "https://la.wikisource.org/wiki/De_bello_Gallico",
    },
  },
  timestamp: "2024-01-10T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `<!DOCTYPE html>
<html>
<head><title>De bello Gallico</title></head>
<body>
  <h1>Liber Primus</h1>
  <div class="mw-editsection">[edit]</div>
  <p>Gallia est omnis divisa in partes tres, quarum unam incolunt Belgae.</p>
  <div class="poem">
    Arma virumque cano,<br>
    Troiae qui primus ab oris.
  </div>
  <div class="ws-noexport">Navigation Footer</div>
</body>
</html>`;

const MOCK_SEARCH_JSON = {
  pages: [
    {
      id: 101,
      key: "De_bello_Gallico",
      title: "De bello Gallico",
      excerpt: "Commentarii de <span>Bello Gallico</span>",
      description: "Classical Latin historical text",
    },
    {
      id: 102,
      key: "Bellum_Civile",
      title: "Bellum Civile",
      excerpt: "De <span>Bello Civili</span> commentarii",
      description: "Caesar civil war commentary",
    },
  ],
};

describe("WikisourceActor Unit & Integration Tests", () => {
  const actor = new WikisourceActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves language and title from standard Wikisource URL", () => {
      const res = actor.resolveParameters("https://tr.wikisource.org/wiki/Nutuk", {});
      assert.strictEqual(res.lang, "tr");
      assert.strictEqual(res.title, "Nutuk");
      assert.strictEqual(res.action, "summary");
    });

    it("resolves classical Latin from la.wikisource.org URL", () => {
      const res = actor.resolveParameters("https://la.wikisource.org/wiki/De_bello_Gallico", {});
      assert.strictEqual(res.lang, "la");
      assert.strictEqual(res.title, "De bello Gallico");
      assert.strictEqual(res.action, "summary");
    });

    it("resolves multilingual repository for wikisource.org", () => {
      const res = actor.resolveParameters("https://wikisource.org/wiki/Sources_multilingues", {});
      assert.strictEqual(res.lang, "mul");
      assert.strictEqual(res.title, "Sources multilingues");
    });

    it("detects article action from REST path URL", () => {
      const res = actor.resolveParameters(
        "https://en.wikisource.org/api/rest_v1/page/html/The_Odyssey",
        {}
      );
      assert.strictEqual(res.lang, "en");
      assert.strictEqual(res.title, "The Odyssey");
      assert.strictEqual(res.action, "article");
    });
  });

  describe("Endpoint URL Construction", () => {
    it("builds correct summary URL for Turkish Wikisource", () => {
      const url = actor.buildApiUrl(undefined, "tr", "summary", "Nutuk");
      assert.strictEqual(url, "https://tr.wikisource.org/api/rest_v1/page/summary/Nutuk");
    });

    it("builds correct Parsoid HTML article URL for Latin", () => {
      const url = actor.buildApiUrl(undefined, "la", "article", "De bello Gallico");
      assert.strictEqual(url, "https://la.wikisource.org/api/rest_v1/page/html/De_bello_Gallico");
    });

    it("builds correct search URL with query and limit", () => {
      const url = actor.buildApiUrl(undefined, "en", "search", undefined, "Aristotle", 15);
      assert.strictEqual(
        url,
        "https://en.wikisource.org/w/rest.php/v1/search/page?q=Aristotle&limit=15"
      );
    });

    it("routes multilingual 'mul' to wikisource.org root host", () => {
      const url = actor.buildApiUrl(undefined, "mul", "article", "Ancient_Treatise");
      assert.strictEqual(url, "https://wikisource.org/api/rest_v1/page/html/Ancient_Treatise");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "ssrf-test-1",
        actorType: "wikisource",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
        options: {
          wikisourceOptions: {
            allowLocalNetwork: false,
          } as Record<string, unknown>,
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF validation failed"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    let server: http.Server;
    let serverUrl: string;

    it("starts local mock Wikisource HTTP server", async () => {
      server = http.createServer((req, res) => {
        const url = req.url || "";
        if (url.includes("/api/rest_v1/page/summary")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(MOCK_SUMMARY_JSON));
        } else if (url.includes("/api/rest_v1/page/html")) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
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
          const addr = server.address() as { port: number };
          serverUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    it("successfully harvests summary item", async () => {
      const task: ActorTask = {
        taskId: "test-summary",
        actorType: "wikisource",
        targetUrl: `${serverUrl}/api/rest_v1/page/summary/De_bello_Gallico`,
        options: {
          wikisourceOptions: {
            lang: "la",
            action: "summary",
            title: "De bello Gallico",
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.data?.items.length, 1);

      const item = result.data?.items[0];
      assert.ok(item);
      assert.strictEqual(item.title, "De bello Gallico");
      assert.ok(item.extract?.includes("Iulii Caesaris"));
      assert.strictEqual(item.lang, "la");
    });

    it("successfully converts article Parsoid HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-article",
        actorType: "wikisource",
        targetUrl: `${serverUrl}/api/rest_v1/page/html/De_bello_Gallico`,
        options: {
          wikisourceOptions: {
            lang: "la",
            action: "article",
            title: "De bello Gallico",
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);

      const item = result.data?.items[0];
      assert.ok(item);
      assert.ok(item.fullMarkdown);

      // Verify stripped elements
      assert.strictEqual(item.fullMarkdown.includes("mw-editsection"), false);
      assert.strictEqual(item.fullMarkdown.includes("ws-noexport"), false);

      // Verify header and poem formatting
      assert.ok(item.fullMarkdown.includes("# Liber Primus"));
      assert.ok(item.fullMarkdown.includes("Gallia est omnis divisa in partes tres"));
      assert.ok(item.fullMarkdown.includes("> Arma virumque cano"));
    });

    it("successfully executes search discovery", async () => {
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "wikisource",
        targetUrl: `${serverUrl}/w/rest.php/v1/search/page?q=Caesar&limit=10`,
        options: {
          wikisourceOptions: {
            lang: "la",
            action: "search",
            query: "Caesar",
            limit: 10,
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.strictEqual(result.data?.items.length, 2);

      assert.strictEqual(result.data?.items[0].title, "De bello Gallico");
      assert.strictEqual(result.data?.items[1].title, "Bellum Civile");
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    });
  });
});
