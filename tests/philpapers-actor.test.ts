/**
 * Unit & Integration tests for PhilPapersActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { PhilPapersActor } from "../src/actors/corpus/philpapers-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_PHILPAPERS_RECORD_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>David J. Chalmers, The Conscious Mind - PhilPapers</title>
</head>
<body>
  <h1 class="pubTitle">The Conscious Mind: In Search of a Fundamental Theory</h1>
  <div class="pubAuthors">
    <a href="/s/author/David%20J.%20Chalmers">David J. Chalmers</a>
  </div>
  <div class="pubDetails">Oxford University Press (1996)</div>
  <div class="pubAbstract">
    What is consciousness? In this book, David Chalmers argues that reductive physicalism cannot account for phenomenal consciousness.
  </div>
  <div class="categories">
    <a class="catLink" href="/browse/philosophy-of-mind">Philosophy of Mind</a>
    <a class="catLink" href="/browse/consciousness">Phenomenal Consciousness</a>
  </div>
  <div class="links">
    <a href="https://doi.org/10.1093/oso/9780195117899.001.0001">DOI Link</a>
    <a class="download" href="http://consc.net/papers/mind.pdf">PDF</a>
  </div>
</body>
</html>
`;

const MOCK_PHILPAPERS_SEARCH_HTML = `
<!DOCTYPE html>
<html>
<head><title>PhilPapers Search Results</title></head>
<body>
  <ul class="results">
    <li class="entry">
      <span class="pubTitle"><a href="/rec/CHADCO">The Conscious Mind</a></span>
      <span class="pubAuthors">David J. Chalmers</span>
      <span class="pubDetails">Oxford University Press 1996</span>
      <div class="pubAbstract">Reductive physicalism cannot account for phenomenal consciousness...</div>
    </li>
    <li class="entry">
      <span class="pubTitle"><a href="/rec/DENCAI">Consciousness Explained</a></span>
      <span class="pubAuthors">Daniel C. Dennett</span>
      <span class="pubDetails">Little, Brown and Co 1991</span>
      <div class="pubAbstract">A physicalist, computational theory of conscious processes...</div>
    </li>
  </ul>
</body>
</html>
`;

const MOCK_PHILPAPERS_CATEGORY_HTML = `
<!DOCTYPE html>
<html>
<head><title>Epistemology - PhilPapers</title></head>
<body>
  <h1 class="pageTitle">Epistemology</h1>
  <div class="catDescription">The philosophical study of knowledge, evidence, and justified belief.</div>
  <div class="subcategories">
    <a href="/browse/epistemic-justification">Epistemic Justification (1420)</a>
    <a href="/browse/skepticism">Skepticism (890)</a>
  </div>
  <ul class="top-entries">
    <li class="entry">
      <span class="pubTitle"><a href="/rec/GETIKJ">Is Justified True Belief Knowledge?</a></span>
      <span class="pubAuthors">Edmund L. Gettier</span>
      <span class="pubDetails">Analysis 1963</span>
    </li>
  </ul>
</body>
</html>
`;

describe("PhilPapersActor Unit & Integration Tests", () => {
  const actor = new PhilPapersActor();
  let server: http.Server;
  let serverPort = 0;
  let baseUrl = "";

  before(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${serverPort}`);
      if (url.pathname.includes("/s/")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_PHILPAPERS_SEARCH_HTML);
      } else if (url.pathname.includes("/browse/")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_PHILPAPERS_CATEGORY_HTML);
      } else if (url.pathname.includes("/rec/")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_PHILPAPERS_RECORD_HTML);
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
    it("resolves record ID from standard PhilPapers URL", () => {
      const resolved = actor.resolveParameters("https://philpapers.org/rec/CHADCO", {});
      assert.equal(resolved.action, "record");
      assert.equal(resolved.id, "CHADCO");
    });

    it("resolves search query from search URL", () => {
      const resolved = actor.resolveParameters("https://philpapers.org/s/epistemology", {});
      assert.equal(resolved.action, "search");
      assert.equal(resolved.query, "epistemology");
    });

    it("resolves category slug from browse URL", () => {
      const resolved = actor.resolveParameters("https://philpapers.org/browse/epistemology", {});
      assert.equal(resolved.action, "category");
      assert.equal(resolved.category, "epistemology");
    });

    it("defaults to CHADCO record when parameters are empty", () => {
      const resolved = actor.resolveParameters(undefined, {});
      assert.equal(resolved.action, "record");
      assert.equal(resolved.id, "CHADCO");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-philpapers",
        actorType: "philpapers",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF validation failed"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("successfully harvests publication record with metadata, abstract, and categories", async () => {
      const task: ActorTask = {
        taskId: "test-philpapers-record",
        actorType: "philpapers",
        targetUrl: `${baseUrl}/rec/CHADCO`,
        options: {
          philpapersOptions: {
            action: "record",
            id: "CHADCO",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);

      const record = result.data.record;
      assert.ok(record);
      assert.equal(record.id, "CHADCO");
      assert.equal(record.title, "The Conscious Mind: In Search of a Fundamental Theory");
      assert.ok(record.authors.includes("David J. Chalmers"));
      assert.equal(record.year, 1996);
      assert.ok(record.publication?.includes("Oxford University Press"));
      assert.ok(record.abstract?.includes("phenomenal consciousness"));
      assert.equal(record.categories.length, 2);
      assert.ok(record.categories.includes("Philosophy of Mind"));
      assert.ok(record.doi?.includes("doi.org"));
      assert.equal(record.openAccess, true);
      assert.ok(result.data.markdown?.includes("# The Conscious Mind"));
    });

    it("successfully harvests search query results", async () => {
      const task: ActorTask = {
        taskId: "test-philpapers-search",
        actorType: "philpapers",
        targetUrl: `${baseUrl}/s/consciousness`,
        options: {
          philpapersOptions: {
            action: "search",
            query: "consciousness",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.action, "search");
      assert.equal(result.data.totalResults, 2);
      assert.equal(result.data.searchResults?.[0]?.id, "CHADCO");
      assert.ok(result.data.markdown?.includes("Search Results"));
    });

    it("successfully harvests category taxonomy details and subcategories", async () => {
      const task: ActorTask = {
        taskId: "test-philpapers-category",
        actorType: "philpapers",
        targetUrl: `${baseUrl}/browse/epistemology`,
        options: {
          philpapersOptions: {
            action: "category",
            category: "epistemology",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.action, "category");

      const cat = result.data.categoryDetails;
      assert.ok(cat);
      assert.equal(cat.title, "Epistemology");
      assert.ok(cat.description?.includes("justified belief"));
      assert.equal(cat.subcategories.length, 2);
      assert.equal(cat.subcategories[0]?.name, "Epistemic Justification");
      assert.equal(cat.subcategories[0]?.count, 1420);
      assert.equal(cat.topRecords.length, 1);
      assert.ok(result.data.markdown?.includes("# PhilPapers Category: Epistemology"));
    });
  });
});
