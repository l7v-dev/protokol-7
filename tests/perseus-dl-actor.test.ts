/**
 * PerseusDlActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { PerseusDlActor } from "../src/actors/corpus/perseus-dl-actor";
import type { ActorTask } from "../src/api/types";

describe("PerseusDlActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path.includes("/hopper/text")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta name="DC.creator" content="Homer" />
              <meta name="DC.title" content="Iliad" />
              <meta name="DC.contributor" content="A.T. Murray, Ph.D." />
            </head>
            <body>
              <div class="header_text">
                <span class="author">Homer</span>
                <span class="title">Iliad</span>
                <span class="editor">A.T. Murray, Ph.D.</span>
              </div>
              <div class="text_main">
                <div class="card" id="card-1">
                  <span class="card_label">Book 1, Line 1</span>
                  <p class="line">Μῆνιν ἄειδε θεὰ Πηληϊάδεω Ἀχιλῆος</p>
                  <p class="line">οὐλομένην, ἣ μυρί᾽ Ἀχαιοῖς ἄλγε᾽ ἔθηκε</p>
                </div>
              </div>
              <div class="translation">
                <p>The wrath sing, goddess, of Peleus' son Achilles, that destructive wrath which brought untold sorrows upon the Achaeans.</p>
              </div>
            </body>
          </html>
        `);
        return;
      }

      if (path.includes("/hopper/morph")) {
        const _word = parsedUrl.searchParams.get("l") || "logos";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <table class="morph">
                <tr>
                  <th>Lemma</th>
                  <th>POS</th>
                  <th>Parse</th>
                  <th>Definition</th>
                </tr>
                <tr>
                  <td class="lemma">λόγος</td>
                  <td class="pos">noun</td>
                  <td class="parse">masc nom sg</td>
                  <td class="definition">the word, saying, reason</td>
                </tr>
                <tr>
                  <td class="lemma">λόγος</td>
                  <td class="pos">noun</td>
                  <td class="parse">masc voc sg</td>
                  <td class="definition">the word, saying, reason</td>
                </tr>
              </table>
            </body>
          </html>
        `);
        return;
      }

      if (path.includes("/hopper/searchresults")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <ul class="search_results">
                <li>
                  <a href="/hopper/text?doc=Perseus:text:1999.01.0133">Homer, Iliad</a>
                  <span class="author">Homer</span>
                  <p class="snippet">Sing, goddess, the wrath of Achilles...</p>
                </li>
                <li>
                  <a href="/hopper/text?doc=Perseus:text:1999.01.0135">Homer, Odyssey</a>
                  <span class="author">Homer</span>
                  <p class="snippet">Tell me, O Muse, of the man of many devices...</p>
                </li>
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
      const actor = new PerseusDlActor();
      const resolvedText = actor.resolveParameters(
        "https://www.perseus.tufts.edu/hopper/text?doc=Perseus%3Atext%3A1999.01.0133",
        {}
      );
      assert.strictEqual(resolvedText.action, "text");
      assert.strictEqual(resolvedText.doc, "Perseus:text:1999.01.0133");

      const resolvedMorph = actor.resolveParameters(
        "https://www.perseus.tufts.edu/hopper/morph?l=logos&la=greek",
        {}
      );
      assert.strictEqual(resolvedMorph.action, "morph");
      assert.strictEqual(resolvedMorph.word, "logos");
      assert.strictEqual(resolvedMorph.language, "greek");

      const resolvedSearch = actor.resolveParameters(
        "https://www.perseus.tufts.edu/hopper/searchresults?q=odyssey",
        {}
      );
      assert.strictEqual(resolvedSearch.action, "search");
      assert.strictEqual(resolvedSearch.query, "odyssey");
    });

    it("builds correct endpoint URLs", () => {
      const actor = new PerseusDlActor();
      const urlMorph = actor.buildEndpointUrl(undefined, {
        action: "morph",
        doc: "",
        word: "arma",
        language: "latin",
        limit: 20,
      });
      assert.ok(urlMorph.includes("/hopper/morph"));
      assert.ok(urlMorph.includes("l=arma"));
      assert.ok(urlMorph.includes("la=latin"));

      const urlSearch = actor.buildEndpointUrl(undefined, {
        action: "search",
        doc: "",
        query: "hesiod",
        language: "greek",
        limit: 20,
      });
      assert.ok(urlSearch.includes("/hopper/searchresults"));
      assert.ok(urlSearch.includes("q=hesiod"));
    });

    it("blocks SSRF attempts on metadata IP", async () => {
      const actor = new PerseusDlActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "perseus-dl",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF/);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("extracts classical passage with structured cards and parallel translation", async () => {
      const actor = new PerseusDlActor();
      const task: ActorTask = {
        taskId: "test-perseus-text",
        actorType: "perseus-dl",
        targetUrl: `${mockServerUrl}/hopper/text?doc=Perseus:text:1999.01.0133:book=1:card=1`,
        options: {
          perseusDlOptions: {
            action: "text",
            doc: "Perseus:text:1999.01.0133:book=1:card=1",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.passage);
      assert.strictEqual(result.data.passage.author, "Homer");
      assert.strictEqual(result.data.passage.work, "Iliad");
      assert.ok(result.data.passage.sections);
      assert.strictEqual(result.data.passage.sections.length, 1);
      assert.match(result.data.passage.sections[0].text, /Μῆνιν ἄειδε/);
      assert.ok(result.data.passage.translationText);
      assert.match(result.data.passage.translationText, /wrath sing, goddess/);
      assert.match(result.data.markdown || "", /# Iliad/);
    });

    it("extracts morphological analysis and grammatical features", async () => {
      const actor = new PerseusDlActor();
      const task: ActorTask = {
        taskId: "test-perseus-morph",
        actorType: "perseus-dl",
        targetUrl: `${mockServerUrl}/hopper/morph?l=logos&la=greek`,
        options: {
          perseusDlOptions: {
            action: "morph",
            word: "logos",
            language: "greek",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.morphAnalysis);
      assert.strictEqual(result.data.morphAnalysis.length, 2);
      assert.strictEqual(result.data.morphAnalysis[0].lemma, "λόγος");
      assert.strictEqual(result.data.morphAnalysis[0].pos, "noun");
      assert.strictEqual(result.data.morphAnalysis[0].features?.gender, "masculine");
      assert.strictEqual(result.data.morphAnalysis[0].features?.case, "nominative");
      assert.strictEqual(result.data.morphAnalysis[0].features?.number, "singular");
      assert.match(result.data.markdown || "", /Perseus Morphological Analysis/);
    });

    it("extracts catalog search results", async () => {
      const actor = new PerseusDlActor();
      const task: ActorTask = {
        taskId: "test-perseus-search",
        actorType: "perseus-dl",
        targetUrl: `${mockServerUrl}/hopper/searchresults?q=homer`,
        options: {
          perseusDlOptions: {
            action: "search",
            query: "homer",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.searchResults);
      assert.strictEqual(result.data.searchResults.length, 2);
      assert.strictEqual(result.data.searchResults[0].title, "Homer, Iliad");
      assert.strictEqual(result.data.searchResults[0].author, "Homer");
      assert.match(result.data.markdown || "", /Perseus Digital Library Search/);
    });

    it("handles upstream HTTP error responses gracefully", async () => {
      const actor = new PerseusDlActor();
      const task: ActorTask = {
        taskId: "test-perseus-404",
        actorType: "perseus-dl",
        targetUrl: `${mockServerUrl}/not-found`,
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 404);
      assert.match(result.errorMessage || "", /Perseus Digital Library returned HTTP 404/);
    });
  });
});
