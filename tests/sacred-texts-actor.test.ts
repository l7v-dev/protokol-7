/**
 * SacredTextsActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { SacredTextsActor } from "../src/actors/corpus/sacred-texts-actor";
import type { ActorTask } from "../src/api/types";

describe("SacredTextsActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path.includes("/hin/sbe01/sbe01003.htm")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Chandogya Upanishad: First Prapathaka</title>
            </head>
            <body>
              <center>
                <h3>The Upanishads, Part I (SBE 1)</h3>
                <p>translated by Max Muller</p>
                <p>[1879]</p>
              </center>
              <h1>FIRST PRAPATHAKA. FIRST KHANDA.</h1>
              <p>1. Let a man meditate on the syllable Om, called the udgitha; for the udgitha (a portion of the Sama-veda) is sung, beginning with Om.</p>
              <p>The full account, however, of Om is this <a name="fr_1" href="#fn_1">1</a>.</p>
              <hr />
              <div class="footnotes">
                <p><a name="fn_1"></a>[1] The syllable Om is with the Hindus the most sacred word.</p>
              </div>
              <hr />
              <center>
                <a href="/hin/sbe01/sbe01002.htm">Previous</a> |
                <a href="/hin/sbe01/index.htm">Index</a> |
                <a href="/hin/sbe01/sbe01004.htm">Next</a>
              </center>
            </body>
          </html>
        `);
        return;
      }

      if (path.includes("/hin/index.htm")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Hinduism Archive</title></head>
            <body>
              <h1>Sacred Texts of Hinduism</h1>
              <table border="1">
                <tr>
                  <td><a href="/hin/sbe01/index.htm">The Upanishads, Part 1</a> tr. by Max Muller [1879]</td>
                </tr>
                <tr>
                  <td><a href="/hin/rigveda/index.htm">The Rig Veda</a> tr. by Ralph T.H. Griffith [1896]</td>
                </tr>
                <tr>
                  <td><a href="/hin/gita/index.htm">The Bhagavad Gita</a> tr. by Edwin Arnold [1885]</td>
                </tr>
              </table>
            </body>
          </html>
        `);
        return;
      }

      if (path.includes("/search.htm")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <h1>Search Results</h1>
              <ul>
                <li><a href="/hin/sbe01/sbe01003.htm">Chandogya Upanishad Khanda 1</a></li>
                <li><a href="/hin/gita/gita01.htm">The Bhagavad Gita Chapter 1</a></li>
              </ul>
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

  describe("Parameter Resolution & Security", () => {
    it("resolves parameters and actions correctly", () => {
      const actor = new SacredTextsActor();
      const resolvedText = actor.resolveParameters(
        "https://www.sacred-texts.com/hin/sbe01/sbe01003.htm",
        {}
      );
      assert.strictEqual(resolvedText.action, "text");
      assert.strictEqual(resolvedText.tradition, "hin");
      assert.strictEqual(resolvedText.path, "/hin/sbe01/sbe01003.htm");

      const resolvedCatalog = actor.resolveParameters(
        "https://www.sacred-texts.com/isl/index.htm",
        {}
      );
      assert.strictEqual(resolvedCatalog.action, "catalog");
      assert.strictEqual(resolvedCatalog.tradition, "isl");

      const resolvedSearch = actor.resolveParameters(
        "https://www.sacred-texts.com/search.htm?q=upanishad",
        {}
      );
      assert.strictEqual(resolvedSearch.action, "search");
      assert.strictEqual(resolvedSearch.query, "upanishad");
    });

    it("builds correct endpoint URLs", () => {
      const actor = new SacredTextsActor();
      const urlText = actor.buildEndpointUrl(undefined, {
        action: "text",
        tradition: "cla",
        path: "/cla/homer/ili/ili01.htm",
        limit: 20,
      });
      assert.strictEqual(urlText, "https://www.sacred-texts.com/cla/homer/ili/ili01.htm");

      const urlSearch = actor.buildEndpointUrl(undefined, {
        action: "search",
        tradition: "hin",
        path: "/search.htm",
        query: "dharma",
        limit: 20,
      });
      assert.strictEqual(urlSearch, "https://www.sacred-texts.com/search.htm?q=dharma");
    });

    it("blocks SSRF attempts on metadata IP", async () => {
      const actor = new SacredTextsActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "sacred-texts",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF/);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("extracts passage with translator, footnotes, and navigation links", async () => {
      const actor = new SacredTextsActor();
      const task: ActorTask = {
        taskId: "test-sacred-text",
        actorType: "sacred-texts",
        targetUrl: `${mockServerUrl}/hin/sbe01/sbe01003.htm`,
        options: {
          sacredTextsOptions: {
            action: "text",
            tradition: "hin",
            path: "/hin/sbe01/sbe01003.htm",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.passage);
      assert.strictEqual(result.data.passage.tradition, "hin");
      assert.strictEqual(result.data.passage.translator, "Max Muller");
      assert.match(result.data.passage.content, /syllable Om/);
      assert.ok(result.data.passage.footnotes);
      assert.strictEqual(result.data.passage.footnotes.length, 1);
      assert.match(result.data.passage.footnotes[0].text, /sacred word/);
      assert.ok(result.data.passage.nextUrl);
      assert.match(result.data.passage.nextUrl, /sbe01004\.htm/);
      assert.ok(result.data.passage.prevUrl);
      assert.match(result.data.passage.prevUrl, /sbe01002\.htm/);
      assert.match(result.data.markdown || "", /# /);
    });

    it("extracts tradition catalog books and translators", async () => {
      const actor = new SacredTextsActor();
      const task: ActorTask = {
        taskId: "test-sacred-catalog",
        actorType: "sacred-texts",
        targetUrl: `${mockServerUrl}/hin/index.htm`,
        options: {
          sacredTextsOptions: {
            action: "catalog",
            tradition: "hin",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.books);
      assert.strictEqual(result.data.books.length, 3);
      assert.strictEqual(result.data.books[0].title, "The Upanishads, Part 1");
      assert.strictEqual(result.data.books[0].translator, "Max Muller");
      assert.strictEqual(result.data.books[0].year, "1879");
      assert.strictEqual(result.data.books[1].title, "The Rig Veda");
      assert.strictEqual(result.data.books[2].title, "The Bhagavad Gita");
      assert.match(result.data.markdown || "", /HIN Catalog/);
    });

    it("extracts search results list", async () => {
      const actor = new SacredTextsActor();
      const task: ActorTask = {
        taskId: "test-sacred-search",
        actorType: "sacred-texts",
        targetUrl: `${mockServerUrl}/search.htm?q=upanishad`,
        options: {
          sacredTextsOptions: {
            action: "search",
            query: "upanishad",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.books);
      assert.strictEqual(result.data.books.length, 2);
      assert.match(result.data.markdown || "", /Search: "upanishad"/);
    });

    it("handles upstream HTTP error responses gracefully", async () => {
      const actor = new SacredTextsActor();
      const task: ActorTask = {
        taskId: "test-sacred-404",
        actorType: "sacred-texts",
        targetUrl: `${mockServerUrl}/not-found`,
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 404);
      assert.match(result.errorMessage || "", /Internet Sacred Text Archive returned HTTP 404/);
    });
  });
});
