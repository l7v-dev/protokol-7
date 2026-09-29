/**
 * Unit & Integration tests for InternetPhilActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { InternetPhilActor } from "../src/actors/corpus/internet-phil-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_IEP_ENTRY_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Kurt Gödel | Internet Encyclopedia of Philosophy</title>
</head>
<body>
  <h1 class="entry-title">Kurt Gödel (1906—1978)</h1>
  <div class="author-info">Jane Doe, Oxford University</div>

  <div id="toc_container">
    <ul class="toc-list">
      <li><a href="#1">1. Life and Career</a></li>
      <li><a href="#2">2. Incompleteness Theorems</a></li>
    </ul>
  </div>

  <div class="entry-content">
    <h2>1. Life and Career</h2>
    <p>Kurt Friedrich Gödel was an Austrian-American logician, mathematician, and philosopher.</p>

    <h2>2. Incompleteness Theorems</h2>
    <p>Gödel's two incompleteness theorems are among the most important results in modern logic.</p>

    <h2>References and Further Reading</h2>
    <ul>
      <li>Gödel, Kurt. Collected Works, Volumes I–V. Oxford University Press.</li>
      <li>Dawson, John W. Logical Dilemmas: The Life and Work of Kurt Gödel. A K Peters.</li>
    </ul>

    <div id="author-info">
      <h3>Author Information</h3>
      <p>Jane Doe is Professor of Philosophy at Oxford University.</p>
    </div>
  </div>
</body>
</html>
`;

const MOCK_IEP_SEARCH_HTML = `
<!DOCTYPE html>
<html>
<head><title>Search Results | IEP</title></head>
<body>
  <article>
    <h2 class="entry-title"><a href="/goedel/">Kurt Gödel</a></h2>
    <div class="entry-summary">Kurt Gödel was an Austrian-American logician and mathematician...</div>
  </article>
  <article>
    <h2 class="entry-title"><a href="/prop-log/">Propositional Logic</a></h2>
    <div class="entry-summary">Propositional logic is the branch of formal logic that studies ways of combining propositions...</div>
  </article>
</body>
</html>
`;

describe("InternetPhilActor Unit & Integration Tests", () => {
  const actor = new InternetPhilActor();
  let server: http.Server;
  let serverPort = 0;
  let baseUrl = "";

  before(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${serverPort}`);
      if (url.searchParams.has("s")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_IEP_SEARCH_HTML);
      } else if (url.pathname.includes("/goedel") || url.pathname.includes("/prop-log")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_IEP_ENTRY_HTML);
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
    it("resolves slug from standard IEP article URL", () => {
      const resolved = actor.resolveParameters("https://iep.utm.edu/goedel/", {});
      assert.equal(resolved.action, "entry");
      assert.equal(resolved.slug, "goedel");
    });

    it("resolves search query from search parameter URL", () => {
      const resolved = actor.resolveParameters("https://iep.utm.edu/?s=propositional+logic", {});
      assert.equal(resolved.action, "search");
      assert.equal(resolved.query, "propositional logic");
    });

    it("defaults to goedel entry when parameters are empty", () => {
      const resolved = actor.resolveParameters(undefined, {});
      assert.equal(resolved.action, "entry");
      assert.equal(resolved.slug, "goedel");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-iep",
        actorType: "internet-phil",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF validation failed"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("successfully harvests academic philosophy article with outline and references", async () => {
      const task: ActorTask = {
        taskId: "test-iep-entry",
        actorType: "internet-phil",
        targetUrl: `${baseUrl}/goedel/`,
        options: {
          internetPhilOptions: {
            action: "entry",
            slug: "goedel",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);

      const entry = result.data.entry;
      assert.ok(entry);
      assert.equal(entry.title, "Kurt Gödel (1906—1978)");
      assert.ok(entry.authors.some((a) => a.includes("Jane Doe")));
      assert.equal(entry.tableOfContents.length, 2);
      assert.equal(entry.sections.length, 2);
      assert.equal(entry.references.length, 2);
      assert.ok(result.data.markdown?.includes("# Kurt Gödel"));
    });

    it("successfully harvests search query results", async () => {
      const task: ActorTask = {
        taskId: "test-iep-search",
        actorType: "internet-phil",
        targetUrl: `${baseUrl}/?s=logic`,
        options: {
          internetPhilOptions: {
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
      assert.equal(result.data.searchResults?.[0]?.slug, "goedel");
      assert.ok(result.data.markdown?.includes("Search Results"));
    });
  });
});
