/**
 * Unit tests for ProofWikiActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { ProofWikiActor } from "../src/actors/corpus/proofwiki-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_PARSE_PYTHAGORAS = {
  parse: {
    title: "Pythagorean Theorem",
    pageid: 1234,
    categories: [{ "*": "Theorems" }, { "*": "Triangle Geometry" }, { "*": "Euclidean Geometry" }],
    wikitext: {
      "*": `A fundamental theorem in Euclidean geometry.

== Theorem ==
Let <math>T</math> be a right-angled triangle with legs <math>a, b</math> and hypotenuse <math>c</math>.
Then:
<math>a^2 + b^2 = c^2</math>

== Proof 1 ==
Consider four copies of the triangle arranged within a square of side <math>a + b</math>.
The inner area is <math>c^2</math>.
{{begin-eqn}}
{{eqn|r=(a+b)^2|l=c^2 + 4 \\cdot \\frac{1}{2}ab}}
{{eqn|r=a^2 + 2ab + b^2|l=c^2 + 2ab}}
{{eqn|r=a^2 + b^2|l=c^2}}
{{end-eqn}}
{{QED}}

== Proof 2 ==
By similar triangles formed by dropping an altitude to the hypotenuse.
{{QED}}

== Historical Note ==
Known to ancient Babylonians and Indians before Pythagoras.

== Sources ==
* 1998: David Nelson: The Penguin Dictionary of Mathematics
* 2008: Ian Stewart: Taming the Infinite
`,
    },
  },
};

const MOCK_SEARCH_RESPONSE = {
  query: {
    search: [
      {
        ns: 0,
        title: "Euler's Identity",
        pageid: 5678,
        size: 1540,
        wordcount: 180,
        snippet: "<span>Euler's</span> <span>identity</span> states that e^{i*pi} + 1 = 0.",
        timestamp: "2024-01-10T12:00:00Z",
      },
      {
        ns: 0,
        title: "Euler's Formula",
        pageid: 5679,
        size: 2100,
        wordcount: 250,
        snippet: "Euler's formula states that e^{ix} = cos(x) + i sin(x).",
        timestamp: "2024-01-10T12:05:00Z",
      },
    ],
  },
};

const MOCK_RANDOM_RESPONSE = {
  query: {
    random: [
      { id: 9101, ns: 0, title: "Fermat's Little Theorem" },
      { id: 9102, ns: 0, title: "Wilson's Theorem" },
    ],
  },
};

const MOCK_CATEGORY_RESPONSE = {
  query: {
    categorymembers: [
      { pageid: 7001, ns: 0, title: "Abel's Lemma" },
      { pageid: 7002, ns: 0, title: "Banach Fixed-Point Theorem" },
    ],
  },
};

describe("ProofWikiActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new ProofWikiActor();
    assert.equal(actor.actorType, "proofwiki");
    assert.ok(actor.description.includes("ProofWiki"));
  });

  it("resolves parameters and actions correctly", () => {
    const actor = new ProofWikiActor();

    const theoremParams = actor.resolveParameters("", {
      title: "Pythagorean Theorem",
    });
    assert.equal(theoremParams.action, "theorem");
    assert.equal(theoremParams.title, "Pythagorean Theorem");

    const searchParams = actor.resolveParameters("", {
      query: "Euler identity",
      limit: 5,
    });
    assert.equal(searchParams.action, "search");
    assert.equal(searchParams.query, "Euler identity");
    assert.equal(searchParams.limit, 5);

    const catParams = actor.resolveParameters("", {
      action: "category",
      category: "Category:Theorems",
      limit: 20,
    });
    assert.equal(catParams.action, "category");
    assert.equal(catParams.category, "Category:Theorems");
    assert.equal(catParams.limit, 20);

    const randomParams = actor.resolveParameters("", {
      action: "random",
      limit: 10,
    });
    assert.equal(randomParams.action, "random");
    assert.equal(randomParams.limit, 10);
  });

  it("resolves title and action from targetUrl", () => {
    const actor = new ProofWikiActor();

    const res1 = actor.resolveParameters("https://proofwiki.org/wiki/Euclid%27s_Lemma", {});
    assert.equal(res1.action, "theorem");
    assert.equal(res1.title, "Euclid's Lemma");

    const res2 = actor.resolveParameters("https://proofwiki.org/w/api.php?title=Prime_Number", {});
    assert.equal(res2.action, "theorem");
    assert.equal(res2.title, "Prime Number");
  });

  it("normalizes wikitext math templates into KaTeX and LaTeX", () => {
    const actor = new ProofWikiActor();

    const wikitext =
      "Let <math>x \\in \\R</math>. By [[Pythagorean Theorem|Pythagoras]], {{begin-eqn}}{{eqn|r=a^2+b^2|l=c^2}}{{end-eqn}} {{QED}}";
    const normalized = actor.normalizeMath(wikitext);

    assert.ok(normalized.includes("$x \\in \\R$"));
    assert.ok(normalized.includes("Pythagoras"));
    assert.ok(normalized.includes("\\begin{aligned}"));
    assert.ok(normalized.includes("■"));
  });

  it("blocks SSRF attempts to cloud metadata IP", async () => {
    const actor = new ProofWikiActor();
    const task: ActorTask = {
      taskId: "test-ssrf",
      actorType: "proofwiki",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("parses theorem, multiple proofs, sources, and categories via action=parse", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_PARSE_PYTHAGORAS));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/test?action=parse`;

    try {
      const actor = new ProofWikiActor();
      const task: ActorTask = {
        taskId: "test-pythagoras",
        actorType: "proofwiki",
        targetUrl: mockUrl,
        options: {
          proofWikiOptions: {
            action: "theorem",
            title: "Pythagorean Theorem",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.action, "theorem");
      assert.equal(result.data.totalResults, 1);

      const item = result.data.items[0];
      assert.equal(item.title, "Pythagorean Theorem");
      assert.equal(item.pageId, 1234);
      assert.ok(item.theorem?.includes("right-angled triangle"));
      assert.equal(item.proofs?.length, 2);
      assert.ok(item.proofs[0].includes("square of side"));
      assert.ok(item.proofs[1].includes("similar triangles"));
      assert.equal(item.sources?.length, 2);
      assert.equal(item.categories?.length, 3);
      assert.ok(item.categories.includes("Theorems"));

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("# ProofWiki Formal & Mathematical Proofs"));
      assert.ok(result.data.markdown.includes("### Theorem Statement"));
      assert.ok(result.data.markdown.includes("#### Proof 1"));
      assert.ok(result.data.markdown.includes("#### Proof 2"));
      assert.ok(result.data.markdown.includes("### Historical Sources & Citations"));
    } finally {
      server.close();
    }
  });

  it("handles keyword search via action=search", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_SEARCH_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/test?action=query&list=search`;

    try {
      const actor = new ProofWikiActor();
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "proofwiki",
        targetUrl: mockUrl,
        options: {
          proofWikiOptions: {
            action: "search",
            query: "Euler",
            limit: 2,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.action, "search");
      assert.equal(result.data.totalResults, 2);

      assert.equal(result.data.items[0].title, "Euler's Identity");
      assert.ok(result.data.items[0].theorem?.includes("Euler's identity states"));
      assert.equal(result.data.items[1].title, "Euler's Formula");
    } finally {
      server.close();
    }
  });

  it("handles random and category members query modes", async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      if (req.url?.includes("list=random")) {
        res.end(JSON.stringify(MOCK_RANDOM_RESPONSE));
      } else {
        res.end(JSON.stringify(MOCK_CATEGORY_RESPONSE));
      }
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;

    try {
      const actor = new ProofWikiActor();

      // Random mode
      const randomTask: ActorTask = {
        taskId: "test-random",
        actorType: "proofwiki",
        targetUrl: `http://127.0.0.1:${port}/test?action=query&list=random`,
        options: {
          proofWikiOptions: { action: "random", limit: 2 },
        },
      };
      const randomRes = await actor.run(randomTask, { task: randomTask, startTime: Date.now() });
      assert.equal(randomRes.status, "completed");
      assert.equal(randomRes.data?.items.length, 2);
      assert.equal(randomRes.data?.items[0].title, "Fermat's Little Theorem");

      // Category mode
      const catTask: ActorTask = {
        taskId: "test-cat",
        actorType: "proofwiki",
        targetUrl: `http://127.0.0.1:${port}/test?action=query&list=categorymembers`,
        options: {
          proofWikiOptions: { action: "category", category: "Theorems", limit: 2 },
        },
      };
      const catRes = await actor.run(catTask, { task: catTask, startTime: Date.now() });
      assert.equal(catRes.status, "completed");
      assert.equal(catRes.data?.items.length, 2);
      assert.equal(catRes.data?.items[0].title, "Abel's Lemma");
    } finally {
      server.close();
    }
  });

  it("handles HTTP 500 error from upstream gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal MediaWiki database error");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/test?action=parse`;

    try {
      const actor = new ProofWikiActor();
      const task: ActorTask = {
        taskId: "test-500",
        actorType: "proofwiki",
        targetUrl: mockUrl,
        options: {
          proofWikiOptions: { action: "theorem", title: "Error Theorem" },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 500);
      assert.ok(result.errorMessage?.includes("ProofWiki API returned HTTP 500"));
    } finally {
      server.close();
    }
  });
});
