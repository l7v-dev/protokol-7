/**
 * Unit and integration tests for WiktionaryActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WiktionaryActor } from "../src/actors/corpus/wiktionary-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_DEFINITION_JSON = {
  en: [
    {
      partOfSpeech: "Noun",
      language: "English",
      definitions: [
        {
          definition: "A collection of ordered steps that solve a mathematical problem.",
          examples: ["The sorting algorithm finished in O(n log n) time."],
        },
      ],
    },
  ],
};

const MOCK_ENTRY_HTML = `<!DOCTYPE html>
<html>
<head><title>kitap</title></head>
<body>
  <h1>kitap</h1>
  <div class="mw-editsection">[değiştir]</div>
  <h2>Türkçe</h2>
  <h3>Ad</h3>
  <p>Ciltli veya ciltsiz olarak bir araya getirilmiş basılı yapraklar bütünü.</p>
  <div class="noprint">Yazdırılamayan bilgi</div>
</body>
</html>`;

const MOCK_SEARCH_JSON = [
  "kitap",
  ["kitap", "kitaplık", "kitapçı"],
  ["Basılı veya yazılı sayfalar", "Kitapların konduğu yer", "Kitap satan kimse"],
  [
    "https://tr.wiktionary.org/wiki/kitap",
    "https://tr.wiktionary.org/wiki/kitapl%C4%B1k",
    "https://tr.wiktionary.org/wiki/kitap%C3%A7%C4%B1",
  ],
];

const MOCK_RANDOM_JSON = {
  query: {
    random: [
      { id: 101, title: "lexicon" },
      { id: 102, title: "thesaurus" },
    ],
  },
};

describe("WiktionaryActor Unit & Integration Tests", () => {
  const actor = new WiktionaryActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves language and word from standard Wiktionary URL", () => {
      const res = actor.resolveParameters("https://tr.wiktionary.org/wiki/kitap", {});
      assert.strictEqual(res.lang, "tr");
      assert.strictEqual(res.word, "kitap");
      assert.strictEqual(res.action, "definition");
    });

    it("resolves classical Latin from la.wiktionary.org URL", () => {
      const res = actor.resolveParameters("https://la.wiktionary.org/wiki/verbum", {});
      assert.strictEqual(res.lang, "la");
      assert.strictEqual(res.word, "verbum");
      assert.strictEqual(res.action, "definition");
    });

    it("detects definition action from REST definition path URL", () => {
      const res = actor.resolveParameters(
        "https://en.wiktionary.org/api/rest_v1/page/definition/algorithm",
        {}
      );
      assert.strictEqual(res.lang, "en");
      assert.strictEqual(res.word, "algorithm");
      assert.strictEqual(res.action, "definition");
    });

    it("detects entry action from REST html path URL", () => {
      const res = actor.resolveParameters(
        "https://fr.wiktionary.org/api/rest_v1/page/html/dictionnaire",
        {}
      );
      assert.strictEqual(res.lang, "fr");
      assert.strictEqual(res.word, "dictionnaire");
      assert.strictEqual(res.action, "entry");
    });

    it("defaults to query when word is absent", () => {
      const res = actor.resolveParameters(undefined, { query: "searchterm" });
      assert.strictEqual(res.word, "searchterm");
      assert.strictEqual(res.action, "search");
    });
  });

  describe("Endpoint URL Construction", () => {
    it("builds correct definition URL for English Wiktionary", () => {
      const url = actor.buildApiUrl(undefined, "en", "definition", "algorithm");
      assert.strictEqual(url, "https://en.wiktionary.org/api/rest_v1/page/definition/algorithm");
    });

    it("builds correct entry HTML URL for Turkish", () => {
      const url = actor.buildApiUrl(undefined, "tr", "entry", "kitap");
      assert.strictEqual(url, "https://tr.wiktionary.org/api/rest_v1/page/html/kitap");
    });

    it("builds correct search URL with query and limit", () => {
      const url = actor.buildApiUrl(undefined, "de", "search", "Wort", "Wort", 5);
      assert.strictEqual(
        url,
        "https://de.wiktionary.org/w/api.php?action=opensearch&search=Wort&limit=5&namespace=0&format=json"
      );
    });

    it("builds correct random discovery URL", () => {
      const url = actor.buildApiUrl(undefined, "la", "random", "ignored", undefined, 3);
      assert.strictEqual(
        url,
        "https://la.wiktionary.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=3&format=json"
      );
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "wiktionary",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF validation failed/);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    let mockServer: http.Server;
    let mockPort: number;

    it("starts local mock Wiktionary HTTP server", async () => {
      await new Promise<void>((resolve) => {
        mockServer = http.createServer((req, res) => {
          const url = req.url || "";
          if (url.includes("/api/rest_v1/page/definition/algorithm")) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(MOCK_DEFINITION_JSON));
          } else if (url.includes("/api/rest_v1/page/html/kitap")) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(MOCK_ENTRY_HTML);
          } else if (url.includes("action=opensearch")) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(MOCK_SEARCH_JSON));
          } else if (url.includes("list=random")) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(MOCK_RANDOM_JSON));
          } else if (url.includes("notfound")) {
            res.writeHead(404, { "Content-Type": "application/problem+json" });
            res.end(JSON.stringify({ title: "Not Found", status: 404 }));
          } else {
            res.writeHead(400);
            res.end("Bad request");
          }
        });

        mockServer.listen(0, "127.0.0.1", () => {
          const addr = mockServer.address();
          if (addr && typeof addr === "object") {
            mockPort = addr.port;
          }
          resolve();
        });
      });
    });

    it("successfully harvests word definition matrix", async () => {
      const task: ActorTask = {
        taskId: "test-def",
        actorType: "wiktionary",
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest_v1/page/definition/algorithm`,
        options: {
          wiktionaryOptions: {
            word: "algorithm",
            action: "definition",
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items.length, 1);
      const entry = result.data.items[0];
      assert.strictEqual(entry.word, "algorithm");
      assert.ok(entry.partsOfSpeech);
      assert.strictEqual(entry.partsOfSpeech[0].partOfSpeech, "Noun");
      assert.match(entry.partsOfSpeech[0].definitions[0].definition, /collection of ordered steps/);
      assert.match(result.data.markdown || "", /Wiktionary: algorithm/);
    });

    it("successfully converts entry HTML to clean GFM Markdown", async () => {
      const task: ActorTask = {
        taskId: "test-entry",
        actorType: "wiktionary",
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest_v1/page/html/kitap`,
        options: {
          wiktionaryOptions: {
            word: "kitap",
            lang: "tr",
            action: "entry",
            extractMarkdown: true,
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      const entry = result.data.items[0];
      assert.strictEqual(entry.word, "kitap");
      assert.ok(entry.fullMarkdown);
      assert.match(entry.fullMarkdown, /Ciltli veya ciltsiz/);
      assert.ok(!entry.fullMarkdown.includes("Yazdırılamayan bilgi"));
    });

    it("successfully executes search discovery", async () => {
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "wiktionary",
        targetUrl: `http://127.0.0.1:${mockPort}/w/api.php?action=opensearch&search=kitap`,
        options: {
          wiktionaryOptions: {
            action: "search",
            query: "kitap",
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items.length, 3);
      assert.strictEqual(result.data.items[0].word, "kitap");
      assert.strictEqual(result.data.items[1].word, "kitaplık");
    });

    it("successfully handles random word discovery", async () => {
      const task: ActorTask = {
        taskId: "test-random",
        actorType: "wiktionary",
        targetUrl: `http://127.0.0.1:${mockPort}/w/api.php?action=query&list=random`,
        options: {
          wiktionaryOptions: {
            action: "random",
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.items.length, 2);
      assert.strictEqual(result.data.items[0].word, "lexicon");
    });

    it("gracefully handles 404 not found", async () => {
      const task: ActorTask = {
        taskId: "test-404",
        actorType: "wiktionary",
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest_v1/page/definition/notfound`,
        options: {
          wiktionaryOptions: {
            word: "notfound",
            action: "definition",
          },
        },
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 404);
      assert.ok(result.data);
      assert.strictEqual(result.data.items.length, 0);
      assert.match(result.data.markdown || "", /No Entry Found/);
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        mockServer.close(() => resolve());
      });
    });
  });
});
