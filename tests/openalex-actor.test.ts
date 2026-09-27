import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { OpenAlexActor } from "../src/actors/corpus/openalex-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_OPENALEX_JSON = {
  meta: {
    count: 1420,
    page: 1,
    per_page: 1,
  },
  results: [
    {
      id: "https://openalex.org/W2741809807",
      doi: "https://doi.org/10.48550/arxiv.1706.03762",
      title: "Attention Is All You Need",
      display_name: "Attention Is All You Need",
      publication_year: 2017,
      abstract_inverted_index: {
        The: [0],
        dominant: [1],
        sequence: [2],
        transduction: [3],
        models: [4],
        are: [5],
        based: [6],
        on: [7],
        complex: [8],
        recurrent: [9],
        neural: [10],
        "networks.": [11],
      },
      authorships: [
        { author: { display_name: "Ashish Vaswani" } },
        { author: { display_name: "Noam Shazeer" } },
        { author: { display_name: "Niki Parmar" } },
      ],
      cited_by_count: 105234,
      open_access: {
        is_oa: true,
        oa_url: "https://arxiv.org/pdf/1706.03762.pdf",
      },
      primary_location: {
        landing_page_url: "https://arxiv.org/abs/1706.03762",
        pdf_url: "https://arxiv.org/pdf/1706.03762.pdf",
        source: {
          display_name: "arXiv (Cornell University)",
        },
      },
      concepts: [
        { display_name: "Attention (machine learning)", score: 0.98 },
        { display_name: "Transformer (machine learning model)", score: 0.95 },
        { display_name: "Artificial intelligence", score: 0.9 },
      ],
    },
  ],
};

test("OpenAlexActor queries works and reconstructs abstract from inverted index", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_OPENALEX_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/works?search=attention`;

  try {
    const actor = new OpenAlexActor();
    const result = await actor.run(
      {
        taskId: "test-openalex-1",
        actorType: "openalex",
        targetUrl,
        options: {
          openalexOptions: {
            searchQuery: "attention is all you need",
            minCitations: 1000,
            isOpenAccess: true,
          },
        },
      },
      {
        task: { taskId: "test-openalex-1", actorType: "openalex", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalResults, 1420);
    assert.equal(result.data.works.length, 1);

    const work = result.data.works[0];
    assert.equal(work.id, "https://openalex.org/W2741809807");
    assert.equal(work.title, "Attention Is All You Need");
    assert.equal(work.publicationYear, 2017);
    assert.equal(
      work.abstract,
      "The dominant sequence transduction models are based on complex recurrent neural networks."
    );
    assert.equal(work.authors.length, 3);
    assert.equal(work.authors[0], "Ashish Vaswani");
    assert.equal(work.citedByCount, 105234);
    assert.equal(work.isOpenAccess, true);
    assert.equal(work.openAccessUrl, "https://arxiv.org/pdf/1706.03762.pdf");
    assert.ok(work.concepts.includes("Attention (machine learning)"));
    assert.equal(work.sourceVenue, "arXiv (Cornell University)");
  } finally {
    server.close();
  }
});

test("OpenAlexActor handles empty or missing abstract gracefully", async () => {
  const emptyJson = {
    meta: { count: 1, page: 1, per_page: 1 },
    results: [
      {
        id: "https://openalex.org/W123",
        title: "Paper Without Abstract",
        cited_by_count: 5,
      },
    ],
  };

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(emptyJson));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/works?search=test`;

  try {
    const actor = new OpenAlexActor();
    const result = await actor.run(
      {
        taskId: "test-openalex-2",
        actorType: "openalex",
        targetUrl,
      },
      {
        task: { taskId: "test-openalex-2", actorType: "openalex", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.data?.works[0].abstract, undefined);
    assert.equal(result.data?.works[0].authors.length, 0);
  } finally {
    server.close();
  }
});

test("OpenAlexActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new OpenAlexActor();
  const result = await actor.run(
    {
      taskId: "test-openalex-ssrf",
      actorType: "openalex",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: {
        taskId: "test-openalex-ssrf",
        actorType: "openalex",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF"));
});

test("OpenAlexActor respects targetUrl baseEndpoint during DOI lookup", async () => {
  let requestedPath = "";
  const server = http.createServer((req, res) => {
    requestedPath = req.url || "";
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_OPENALEX_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/works`;

  try {
    const actor = new OpenAlexActor();
    const result = await actor.run(
      {
        taskId: "test-openalex-doi",
        actorType: "openalex",
        targetUrl,
        options: {
          openalexOptions: {
            doi: "10.1038/s41586-020-2649-2",
          },
        },
      },
      {
        task: { taskId: "test-openalex-doi", actorType: "openalex", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(requestedPath.includes("10.1038"));
    assert.ok(requestedPath.startsWith("/works"));
  } finally {
    server.close();
  }
});

test("POST /api/v1/openalex executes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_OPENALEX_JSON));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/openalex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/works?search=attention`,
        searchQuery: "attention is all you need",
        minCitations: 100,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      success: boolean;
      data: { works: Array<{ title: string; citedByCount: number }> };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.works[0].title, "Attention Is All You Need");
    assert.equal(body.data.works[0].citedByCount, 105234);
  } finally {
    app.close();
    mockServer.close();
  }
});
