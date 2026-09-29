/**
 * Unit & Integration tests for StanfordPhilActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { StanfordPhilActor } from "../src/actors/corpus/stanford-phil-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SEP_ENTRY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Gödel's Incompleteness Theorems - Stanford Encyclopedia of Philosophy</title>
</head>
<body>
  <div id="auhead">
    <h1>Gödel's Incompleteness Theorems</h1>
    <span class="author">Panu Raatikainen</span>
    <div id="pubinfo">First published Mon Nov 11, 2013; substantive revision Tue Apr 2, 2020</div>
  </div>

  <div id="preamble">
    Gödel's incompleteness theorems are two theorems of mathematical logic that are concerned with the limits of provability in formal axiomatic theories.
  </div>

  <div id="toc">
    <ul>
      <li><a href="#1">1. Introduction and Overview</a></li>
      <li><a href="#2">2. The First Incompleteness Theorem</a></li>
    </ul>
  </div>

  <div id="main-text">
    <h2>1. Introduction and Overview</h2>
    <p>In 1931, Kurt Gödel proved that any consistent formal system capable of expressing basic arithmetic cannot be both complete and consistent.</p>

    <h2>2. The First Incompleteness Theorem</h2>
    <p>Any consistent formal system F within which a certain amount of elementary arithmetic can be carried out is incomplete.</p>
  </div>

  <div id="bib">
    <ul>
      <li>Gödel, K., 1931, "Über formal unentscheidbare Sätze der Principia Mathematica und verwandter Systeme I", Monatshefte für Mathematik und Physik.</li>
      <li>Smorynski, C., 1977, "The incompleteness theorems", in Handbook of Mathematical Logic.</li>
    </ul>
  </div>

  <div id="related-entries">
    <ul>
      <li><a href="/entries/tarski-truth/">Tarski's Truth Definitions</a></li>
      <li><a href="/entries/logic-modal/">Modal Logic</a></li>
    </ul>
  </div>
</body>
</html>
`;

const MOCK_SEP_SEARCH_HTML = `
<!DOCTYPE html>
<html>
<head><title>SEP Search Results</title></head>
<body>
  <div class="result">
    <a href="/entries/goedel-incompleteness/">Gödel's Incompleteness Theorems</a>
    <div class="snippet">Gödel's incompleteness theorems are two theorems of mathematical logic...</div>
  </div>
  <div class="result">
    <a href="/entries/logic-modal/">Modal Logic</a>
    <div class="snippet">Modal logic is a type of logic used to reason about necessity and possibility...</div>
  </div>
</body>
</html>
`;

const MOCK_SEP_CONTENTS_HTML = `
<!DOCTYPE html>
<html>
<head><title>SEP Table of Contents</title></head>
<body>
  <div id="content">
    <ul>
      <li><a href="/entries/goedel-incompleteness/">Gödel's Incompleteness Theorems</a></li>
      <li><a href="/entries/logic-modal/">Modal Logic</a></li>
    </ul>
  </div>
</body>
</html>
`;

describe("StanfordPhilActor Unit & Integration Tests", () => {
  const actor = new StanfordPhilActor();
  let server: http.Server;
  let serverPort = 0;
  let baseUrl = "";

  before(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${serverPort}`);
      if (url.pathname.includes("/searcher.py")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_SEP_SEARCH_HTML);
      } else if (url.pathname.includes("/contents.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_SEP_CONTENTS_HTML);
      } else if (url.pathname.includes("/entries/")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_SEP_ENTRY_HTML);
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
          baseUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves slug from standard SEP entry URL", () => {
      const resolved = actor.resolveParameters(
        "https://plato.stanford.edu/entries/goedel-incompleteness/",
        {}
      );
      assert.equal(resolved.action, "entry");
      assert.equal(resolved.slug, "goedel-incompleteness");
    });

    it("resolves search query from searcher.py URL", () => {
      const resolved = actor.resolveParameters(
        "https://plato.stanford.edu/search/searcher.py?query=epistemology",
        {}
      );
      assert.equal(resolved.action, "search");
      assert.equal(resolved.query, "epistemology");
    });

    it("resolves contents action from contents.html URL", () => {
      const resolved = actor.resolveParameters("https://plato.stanford.edu/contents.html", {});
      assert.equal(resolved.action, "contents");
    });

    it("defaults to goedel-incompleteness entry when parameters are empty", () => {
      const resolved = actor.resolveParameters(undefined, {});
      assert.equal(resolved.action, "entry");
      assert.equal(resolved.slug, "goedel-incompleteness");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-sep",
        actorType: "stanford-phil",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF validation failed"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("successfully harvests philosophical entry with outline and bibliography", async () => {
      const task: ActorTask = {
        taskId: "test-sep-entry",
        actorType: "stanford-phil",
        targetUrl: `${baseUrl}/entries/goedel-incompleteness/`,
        options: {
          stanfordPhilOptions: {
            action: "entry",
            slug: "goedel-incompleteness",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);

      const entry = result.data.entry;
      assert.ok(entry);
      assert.equal(entry.title, "Gödel's Incompleteness Theorems");
      assert.ok(entry.authors.includes("Panu Raatikainen"));
      assert.ok(entry.pubDate?.includes("2013"));
      assert.ok(entry.revDate?.includes("2020"));
      assert.ok(entry.preamble?.includes("limits of provability"));
      assert.equal(entry.tableOfContents.length, 2);
      assert.equal(entry.sections.length, 2);
      assert.equal(entry.bibliography.length, 2);
      assert.equal(entry.relatedEntries.length, 2);
      assert.ok(result.data.markdown?.includes("# Gödel's Incompleteness Theorems"));
    });

    it("successfully harvests search query results", async () => {
      const task: ActorTask = {
        taskId: "test-sep-search",
        actorType: "stanford-phil",
        targetUrl: `${baseUrl}/search/searcher.py?query=logic`,
        options: {
          stanfordPhilOptions: {
            action: "search",
            query: "logic",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.action, "search");
      assert.equal(result.data.totalResults, 2);
      assert.equal(result.data.searchResults?.[0]?.slug, "goedel-incompleteness");
      assert.ok(result.data.markdown?.includes("Search Results"));
    });

    it("successfully harvests contents index", async () => {
      const task: ActorTask = {
        taskId: "test-sep-contents",
        actorType: "stanford-phil",
        targetUrl: `${baseUrl}/contents.html`,
        options: {
          stanfordPhilOptions: {
            action: "contents",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.action, "contents");
      assert.equal(result.data.totalResults, 2);
      assert.ok(result.data.markdown?.includes("Table of Contents"));
    });
  });
});
