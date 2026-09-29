/**
 * LibreTextsActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { LibreTextsActor } from "../src/actors/corpus/libretexts-actor";
import type { ActorTask } from "../src/api/types";

describe("LibreTextsActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path === "/@api/deki/site/query") {
        const query = parsedUrl.searchParams.get("q") || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            page: [
              {
                id: 101,
                title: `Introduction to ${query}`,
                "uri.ui": "http://127.0.0.1/Bookshelves/Physics/Intro",
                summary: `Comprehensive overview of ${query} in modern physics.`,
              },
              {
                id: 102,
                title: `Advanced ${query}`,
                "uri.ui": "http://127.0.0.1/Bookshelves/Physics/Advanced",
                summary: `Mathematical formulations of ${query}.`,
              },
            ],
          })
        );
        return;
      }

      if (path.includes("/@api/deki/pages/") && path.endsWith("/subpages")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            "page.subpage": [
              {
                id: 201,
                title: "1.1: Historical Context",
                "uri.ui": "http://127.0.0.1/Bookshelves/Physics/1.1",
              },
              {
                id: 202,
                title: "1.2: Wave-Particle Duality",
                "uri.ui": "http://127.0.0.1/Bookshelves/Physics/1.2",
              },
            ],
          })
        );
        return;
      }

      if (path.includes("/Bookshelves/Physics/Chapter1")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>1.1: Wave-Particle Duality - LibreTexts</title>
            </head>
            <body>
              <ol class="mt-breadcrumbs">
                <li><a href="/">Physics</a></li>
                <li><a href="/Bookshelves">Bookshelves</a></li>
                <li><span>Chapter 1</span></li>
              </ol>
              <h1 id="title">1.1: Wave-Particle Duality</h1>
              <div class="mt-content-container">
                <p>The de Broglie wavelength is given by:</p>
                <p><span class="mt-math" data-tex="\\lambda = \\frac{h}{p}">\\lambda = \\frac{h}{p}</span></p>
                <p>Where $h$ is Planck's constant and $p$ is momentum.</p>
                <div class="mt-listing-subpage">
                  <a href="/Bookshelves/Physics/Chapter1/Section1">Next Section</a>
                </div>
              </div>
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (addr && typeof addr === "object") {
          mockServerPort = addr.port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const actor = new LibreTextsActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "libretexts",
        targetUrl: "http://169.254.169.254/latest/meta-data",
        options: {
          libretextsOptions: {
            action: "page",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF validation failed/i);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("executes keyword search discovery", async () => {
      const actor = new LibreTextsActor();
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "libretexts",
        targetUrl: `${mockServerUrl}/@api/deki/site/query?q=mechanics`,
        options: {
          libretextsOptions: {
            action: "search",
            query: "mechanics",
            library: "phys",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "search");
      assert.strictEqual(result.data.library, "phys");
      assert.ok(result.data.pages && result.data.pages.length === 2);
      assert.strictEqual(result.data.pages[0].title, "Introduction to mechanics");
      assert.match(result.data.markdown || "", /# LibreTexts Search Results/);
    });

    it("extracts page content, MathJax formulas, and breadcrumbs", async () => {
      const actor = new LibreTextsActor();
      const task: ActorTask = {
        taskId: "test-page",
        actorType: "libretexts",
        targetUrl: `${mockServerUrl}/Bookshelves/Physics/Chapter1`,
        options: {
          libretextsOptions: {
            action: "page",
            library: "phys",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "page");
      assert.ok(result.data.page);
      assert.strictEqual(result.data.page.title, "1.1: Wave-Particle Duality");
      assert.ok(result.data.page.breadcrumbs && result.data.page.breadcrumbs.length === 3);
      assert.match(result.data.page.contentMarkdown || "", /\\lambda = \\frac\{h\}\{p\}/);
      assert.ok(result.data.page.subpages && result.data.page.subpages.length === 1);
    });

    it("extracts hierarchical table of contents and subpages", async () => {
      const actor = new LibreTextsActor();
      const task: ActorTask = {
        taskId: "test-subpages",
        actorType: "libretexts",
        targetUrl: `${mockServerUrl}/@api/deki/pages/100/subpages`,
        options: {
          libretextsOptions: {
            action: "subpages",
            pageId: "100",
            library: "phys",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "subpages");
      assert.ok(result.data.subpages && result.data.subpages.length === 2);
      assert.strictEqual(result.data.subpages[0].title, "1.1: Historical Context");
      assert.match(result.data.markdown || "", /# LibreTexts Table of Contents/);
    });

    it("handles 404 upstream errors gracefully", async () => {
      const actor = new LibreTextsActor();
      const task: ActorTask = {
        taskId: "test-404",
        actorType: "libretexts",
        targetUrl: `${mockServerUrl}/non-existent-page`,
        options: {
          libretextsOptions: {
            action: "page",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 404);
      assert.match(result.errorMessage || "", /HTTP 404/i);
    });
  });
});
