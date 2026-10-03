import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { DoajActor } from "../src/actors/corpus/doaj-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_DOAJ_SEARCH = {
  total: 42,
  page: 1,
  pageSize: 2,
  results: [
    {
      id: "doaj-article-001",
      created_date: "2026-03-01T12:00:00Z",
      bibjson: {
        title: "Quantum Machine Learning in Drug Discovery",
        abstract:
          "We examine variational quantum algorithms applied to molecular docking simulations, achieving quadratic speedups over classical Monte Carlo methods.",
        identifier: [
          { type: "doi", id: "10.1234/qml.2026.001" },
          { type: "pissn", id: "1111-2222" },
          { type: "eissn", id: "3333-4444" },
        ],
        journal: {
          title: "Journal of Computational Physics & Chemistry",
          publisher: "Quantum Science Press",
          language: ["EN"],
          issns: ["1111-2222", "3333-4444"],
        },
        year: "2026",
        author: [
          { name: "Dr. Alice Turing", affiliation: "Oxford Quantum Institute" },
          { name: "Dr. Bob Neumann", affiliation: "Princeton IAS" },
        ],
        keywords: ["quantum computing", "drug discovery", "docking"],
        subject: [
          { scheme: "LCC", term: "Physics" },
          { scheme: "LCC", term: "Chemistry" },
        ],
        link: [{ type: "fulltext", url: "https://example.org/qml-drug-discovery.pdf" }],
      },
    },
    {
      id: "doaj-article-002",
      created_date: "2026-03-05T09:30:00Z",
      bibjson: {
        title: "Fault-Tolerant Quantum Error Correction Protocols",
        abstract:
          "Surface codes and topological subsystems provide high-threshold quantum memory architectures under realistic depolarizing noise models.",
        identifier: [{ type: "doi", id: "10.1234/qml.2026.002" }],
        journal: {
          title: "Quantum Information Reports",
          publisher: "Open Access Quantum",
          language: ["EN"],
          issns: ["5555-6666"],
        },
        year: 2026,
        author: [{ name: "Charlie Shor", affiliation: "MIT Physics" }],
        keywords: ["error correction", "surface code"],
        subject: [{ scheme: "LCC", term: "Physics" }],
        link: [{ type: "fulltext", url: "https://example.org/qec-protocols.pdf" }],
      },
    },
  ],
};

const MOCK_DOAJ_SINGLE = {
  id: "doaj-article-single",
  created_date: "2026-02-20T14:15:00Z",
  bibjson: {
    title: "Benchmarking Deep Learning Models on Edge Devices",
    abstract:
      "This study presents an empirical analysis of lightweight convolutional and transformer architectures running on microcontrollers.",
    identifier: [{ type: "doi", id: "10.5678/edge.2026.100" }],
    journal: {
      title: "Embedded AI Letters",
      publisher: "Tech Open",
      language: ["EN"],
    },
    year: "2026",
    author: [{ name: "Elena Ramos", affiliation: "ETH Zurich" }],
    keywords: ["edge computing", "tinyML"],
    link: [{ type: "fulltext", url: "https://example.org/edge-ai.pdf" }],
  },
};

test("DoajActor searches articles with query and pageSize", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_DOAJ_SEARCH));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/search/articles`;

  try {
    const actor = new DoajActor();
    const result = await actor.run(
      {
        taskId: "test-doaj-search",
        actorType: "doaj",
        targetUrl,
        options: {
          doajOptions: {
            action: "search_articles",
            query: "quantum computing",
            pageSize: 2,
          },
        },
      },
      {
        task: { taskId: "test-doaj-search", actorType: "doaj", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.action, "search_articles");
    assert.equal(result.data.totalCount, 42);
    assert.equal(result.data.articles.length, 2);

    const art1 = result.data.articles[0];
    assert.equal(art1.id, "doaj-article-001");
    assert.equal(art1.doi, "10.1234/qml.2026.001");
    assert.equal(art1.year, 2026);
    assert.equal(art1.journal, "Journal of Computational Physics & Chemistry");
    assert.ok(art1.authors?.includes("Dr. Alice Turing"));
    assert.ok(art1.affiliations?.includes("Oxford Quantum Institute"));
    assert.ok(art1.markdown?.includes("# Quantum Machine Learning"));
    assert.ok(art1.markdown?.includes("## Abstract"));

    assert.ok(result.data.markdown.includes("# DOAJ (Directory of Open Access Journals) Results"));
    assert.ok(result.data.markdown.includes("10.1234/qml.2026.001"));
  } finally {
    server.close();
  }
});

test("DoajActor retrieves single article by ID", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_DOAJ_SINGLE));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/articles/doaj-article-single`;

  try {
    const actor = new DoajActor();
    const result = await actor.run(
      {
        taskId: "test-doaj-single",
        actorType: "doaj",
        targetUrl,
        options: {
          doajOptions: {
            action: "get_article",
            articleId: "doaj-article-single",
          },
        },
      },
      {
        task: { taskId: "test-doaj-single", actorType: "doaj", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.action, "get_article");
    assert.equal(result.data.totalCount, 1);
    assert.equal(result.data.articles.length, 1);

    const art = result.data.articles[0];
    assert.equal(art.id, "doaj-article-single");
    assert.equal(art.doi, "10.5678/edge.2026.100");
    assert.equal(art.journal, "Embedded AI Letters");
    assert.ok(result.data.markdown.includes("Benchmarking Deep Learning Models"));
  } finally {
    server.close();
  }
});

test("DoajActor handles upstream 500 error gracefully", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "DOAJ Internal Server Error" }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/search/articles`;

  try {
    const actor = new DoajActor();
    const result = await actor.run(
      {
        taskId: "test-doaj-err",
        actorType: "doaj",
        targetUrl,
      },
      {
        task: { taskId: "test-doaj-err", actorType: "doaj", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 500);
    assert.ok(result.errorMessage?.includes("HTTP 500"));
  } finally {
    server.close();
  }
});

test("Server REST endpoint POST /api/v1/doaj and /doaj return 200 with structured data", async () => {
  const mockUpstream = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_DOAJ_SEARCH));
  });

  await new Promise<void>((resolve) => mockUpstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (mockUpstream.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${upstreamPort}/search/articles`;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    // 1. Test /api/v1/doaj
    const resp1 = await fetch(`http://127.0.0.1:${appPort}/api/v1/doaj`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search_articles",
        query: "quantum computing",
        targetUrl,
      }),
    });

    assert.equal(resp1.status, 200);
    const data1 = (await resp1.json()) as {
      success: boolean;
      status: string;
      data: { articles: unknown[] };
    };
    assert.equal(data1.success, true);
    assert.equal(data1.status, "completed");
    assert.equal(data1.data.articles.length, 2);

    // 2. Test bare alias /doaj
    const resp2 = await fetch(`http://127.0.0.1:${appPort}/doaj`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search_articles",
        query: "quantum computing",
        targetUrl,
      }),
    });

    assert.equal(resp2.status, 200);
    const data2 = (await resp2.json()) as {
      success: boolean;
      status: string;
      data: { articles: unknown[] };
    };
    assert.equal(data2.success, true);
    assert.equal(data2.status, "completed");
    assert.equal(data2.data.articles.length, 2);
  } finally {
    app.close();
    mockUpstream.close();
  }
});
