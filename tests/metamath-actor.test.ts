/**
 * Unit & Integration tests for MetamathActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { MetamathActor } from "../src/actors/corpus/metamath-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_METAMATH_THEOREM_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Theorem mpc2</title>
</head>
<body>
  <center><h1>Theorem <code>mpc2</code></h1></center>
  <p>Modus ponens corollary in propositional logic, inferring the consequent from an implication and antecedent.</p>

  <table>
    <tr><td>Hypothesis mpc2.1</td><td>⊢ ( φ → ψ )</td></tr>
    <tr><td>Hypothesis mpc2.2</td><td>⊢ φ</td></tr>
    <tr><td>Assertion</td><td>⊢ ψ</td></tr>
  </table>

  <table summary="Proof">
    <tr><th>Step</th><th>Hyp</th><th>Ref</th><th>Expression</th></tr>
    <tr><td>1</td><td></td><td><a href="ax-1.html">ax-1</a></td><td>⊢ ( φ → ( ψ → φ ) )</td></tr>
    <tr><td>2</td><td>mpc2.1, 1</td><td><a href="ax-mp.html">ax-mp</a></td><td>⊢ ψ</td></tr>
  </table>

  <p>This theorem is referenced by: <a href="th1.html">th1</a>, <a href="th2.html">th2</a>.</p>
  <p>This theorem uses: <a href="ax-1.html">ax-1</a>, <a href="ax-mp.html">ax-mp</a>.</p>
</body>
</html>
`;

const MOCK_METAMATH_SEARCH_HTML = `
<!DOCTYPE html>
<html>
<head><title>Metamath Find Results</title></head>
<body>
  <table>
    <tr><td><a href="pythag.html">pythag</a></td><td>Pythagorean theorem for right-angled triangles in Hilbert space.</td></tr>
    <tr><td><a href="pythag3.html">pythag3</a></td><td>Three-dimensional Pythagorean theorem.</td></tr>
  </table>
</body>
</html>
`;

describe("MetamathActor Unit & Integration Tests", () => {
  const actor = new MetamathActor();
  let server: http.Server;
  let serverPort = 0;
  let baseUrl = "";

  before(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://127.0.0.1:${serverPort}`);
      if (url.pathname.includes("mmfind.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_METAMATH_SEARCH_HTML);
      } else if (url.pathname.endsWith(".html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(MOCK_METAMATH_THEOREM_HTML);
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
    it("resolves theorem from standard Metamath URL", () => {
      const resolved = actor.resolveParameters("https://us.metamath.org/mpeuni/mpc2.html", {});
      assert.equal(resolved.action, "theorem");
      assert.equal(resolved.theorem, "mpc2");
      assert.equal(resolved.database, "set.mm");
    });

    it("resolves intuitionistic logic database from ileuni path", () => {
      const resolved = actor.resolveParameters("https://us.metamath.org/ileuni/ax-1.html", {});
      assert.equal(resolved.action, "axiom");
      assert.equal(resolved.axiom, "ax-1");
      assert.equal(resolved.database, "iset.mm");
    });

    it("resolves search query from mmfind.html URL", () => {
      const resolved = actor.resolveParameters(
        "https://us.metamath.org/mpeuni/mmfind.html?title=pythag",
        {}
      );
      assert.equal(resolved.action, "search");
      assert.equal(resolved.query, "pythag");
    });

    it("defaults to mpc2 theorem when parameters are empty", () => {
      const resolved = actor.resolveParameters(undefined, {});
      assert.equal(resolved.action, "theorem");
      assert.equal(resolved.theorem, "mpc2");
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metamath",
        actorType: "metamath",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF validation failed"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("successfully harvests formal theorem with hypotheses, assertion, and proof table", async () => {
      const task: ActorTask = {
        taskId: "test-metamath-theorem",
        actorType: "metamath",
        targetUrl: `${baseUrl}/mpeuni/mpc2.html`,
        options: {
          metamathOptions: {
            action: "theorem",
            theorem: "mpc2",
            database: "set.mm",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);

      const theorem = result.data.theorem;
      assert.ok(theorem);
      assert.equal(theorem.name, "mpc2");
      assert.equal(theorem.database, "set.mm");
      assert.ok(theorem.description.includes("Modus ponens corollary"));
      assert.equal(theorem.hypotheses.length, 2);
      assert.equal(theorem.assertion, "⊢ ψ");
      assert.equal(theorem.proofSteps?.length, 2);
      assert.equal(theorem.proofSteps?.[0]?.ref, "ax-1");
      assert.ok(theorem.crossReferences?.uses?.includes("ax-1"));
      assert.ok(theorem.crossReferences?.usedBy?.includes("th1"));
      assert.ok(result.data.markdown?.includes("# Metamath: mpc2"));
    });

    it("successfully harvests search query results", async () => {
      const task: ActorTask = {
        taskId: "test-metamath-search",
        actorType: "metamath",
        targetUrl: `${baseUrl}/mpeuni/mmfind.html?title=pythag`,
        options: {
          metamathOptions: {
            action: "search",
            query: "pythag",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.action, "search");
      assert.equal(result.data.totalResults, 2);
      assert.equal(result.data.searchResults?.[0]?.name, "pythag");
      assert.ok(result.data.markdown?.includes("Search Results"));
    });
  });
});
