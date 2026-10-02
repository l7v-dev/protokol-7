import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { BiorxivActor } from "../src/actors/corpus/biorxiv-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_BIORXIV_COLLECTION = {
  messages: [
    {
      status: "ok",
      interval: "2026-01-01:2026-10-02",
      category: "neuroscience",
      cursor: 0,
      count: 2,
      total: "150",
    },
  ],
  collection: [
    {
      doi: "10.1101/2026.01.01.697424",
      title:
        "Single-nucleus transcriptomics reveals convergent effects of THC exposure on nucleus accumbens",
      authors: "Smith, J. A.; Doe, M. K.",
      author_corresponding: "Smith, J. A.",
      author_corresponding_institution: "Department of Neurobiology, Stanford University",
      date: "2026-01-01",
      version: "1",
      type: "new results",
      license: "cc_by_nc_nd",
      category: "neuroscience",
      jatsxml: "https://api.biorxiv.org/jats/biorxiv/10.1101/2026.01.01.697424",
      abstract:
        "Adolescence represents a critical window of neurodevelopment vulnerable to cannabinoid exposure. Here we performed single-nucleus RNA sequencing across 45,000 cells in rodent models.",
      published: "na",
      server: "biorxiv",
    },
    {
      doi: "10.1101/2026.03.10.710022",
      title: "Optogenetic dissection of striatal projection pathways during decision making",
      authors: "Taylor, L. E.; Miller, R. S.",
      author_corresponding: "Taylor, L. E.",
      author_corresponding_institution: "Harvard Brain Institute",
      date: "2026-03-10",
      version: "2",
      type: "confirmatory results",
      license: "cc_by",
      category: "neuroscience",
      jatsxml: "https://api.biorxiv.org/jats/biorxiv/10.1101/2026.03.10.710022",
      abstract:
        "Striatal pathways arbitrate value-based decisions through balanced direct and indirect pathway activation.",
      published: "10.1038/s41593-026-00999-x",
      server: "biorxiv",
    },
  ],
};

const MOCK_MEDRXIV_DOI = {
  messages: [{ status: "ok", count: 1, total: "1" }],
  collection: [
    {
      doi: "10.1101/2026.02.15.26300123",
      title:
        "Phase 2 randomized evaluation of oral kinase inhibitors in refractory rheumatoid arthritis",
      authors: "Johnson, R. L.; Williams, P. T.",
      author_corresponding: "Johnson, R. L.",
      author_corresponding_institution: "Division of Rheumatology, Johns Hopkins University",
      date: "2026-02-15",
      version: "2",
      type: "clinical trial",
      license: "cc_by",
      category: "rheumatology",
      abstract:
        "We conducted a double-blind, placebo-controlled clinical trial assessing efficacy and safety endpoints in 350 patients with active rheumatoid arthritis.",
      published: "10.1016/j.clinther.2026.05.001",
      server: "medrxiv",
    },
  ],
};

test("BiorxivActor queries bioRxiv with interval and category", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_BIORXIV_COLLECTION));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/details`;

  try {
    const actor = new BiorxivActor();
    const result = await actor.run(
      {
        taskId: "test-biorxiv-interval",
        actorType: "biorxiv",
        targetUrl,
        options: {
          biorxivOptions: {
            server: "biorxiv",
            interval: "2026-01-01/2026-10-02",
            category: "neuroscience",
          },
        },
      },
      {
        task: { taskId: "test-biorxiv-interval", actorType: "biorxiv", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.server, "biorxiv");
    assert.equal(result.data.totalCount, 150);
    assert.equal(result.data.articles.length, 2);

    const art1 = result.data.articles[0];
    assert.equal(art1.doi, "10.1101/2026.01.01.697424");
    assert.equal(art1.category, "neuroscience");
    assert.equal(art1.pubYear, 2026);
    assert.equal(art1.authors, "Smith, J. A.; Doe, M. K.");
    assert.equal(art1.institution, "Department of Neurobiology, Stanford University");
    assert.ok(art1.markdown?.includes("# Single-nucleus transcriptomics"));
    assert.ok(art1.markdown?.includes("## Abstract"));

    assert.ok(result.data.markdown.includes("# bioRxiv Preprint Corpus Results"));
    assert.ok(result.data.markdown.includes("10.1101/2026.01.01.697424"));
  } finally {
    server.close();
  }
});

test("BiorxivActor queries medRxiv preprint by direct DOI", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_MEDRXIV_DOI));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/doi`;

  try {
    const actor = new BiorxivActor();
    const result = await actor.run(
      {
        taskId: "test-medrxiv-doi",
        actorType: "biorxiv",
        targetUrl,
        options: {
          biorxivOptions: {
            server: "medrxiv",
            doi: "10.1101/2026.02.15.26300123",
          },
        },
      },
      {
        task: { taskId: "test-medrxiv-doi", actorType: "biorxiv", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.server, "medrxiv");
    assert.equal(result.data.articles.length, 1);

    const art = result.data.articles[0];
    assert.equal(art.doi, "10.1101/2026.02.15.26300123");
    assert.equal(art.publishedDoi, "10.1016/j.clinther.2026.05.001");
    assert.equal(art.category, "rheumatology");
    assert.equal(art.version, 2);
    assert.ok(result.data.markdown.includes("# medRxiv Preprint Corpus Results"));
  } finally {
    server.close();
  }
});

test("BiorxivActor filters preprints using client-side query matching", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_BIORXIV_COLLECTION));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/details`;

  try {
    const actor = new BiorxivActor();
    const result = await actor.run(
      {
        taskId: "test-biorxiv-query",
        actorType: "biorxiv",
        targetUrl,
        options: {
          biorxivOptions: {
            server: "biorxiv",
            query: "transcriptomics",
          },
        },
      },
      {
        task: { taskId: "test-biorxiv-query", actorType: "biorxiv", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    // Only 1 article matches "transcriptomics"
    assert.equal(result.data.articles.length, 1);
    assert.equal(result.data.articles[0].doi, "10.1101/2026.01.01.697424");
  } finally {
    server.close();
  }
});

test("BiorxivActor handles upstream HTTP 500 error gracefully", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/error`;

  try {
    const actor = new BiorxivActor();
    const result = await actor.run(
      {
        taskId: "test-biorxiv-err",
        actorType: "biorxiv",
        targetUrl,
      },
      {
        task: { taskId: "test-biorxiv-err", actorType: "biorxiv", targetUrl },
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

test("Server REST endpoint POST /api/v1/biorxiv and /biorxiv return 200 with structured data", async () => {
  const mockUpstream = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_BIORXIV_COLLECTION));
  });

  await new Promise<void>((resolve) => mockUpstream.listen(0, "127.0.0.1", resolve));
  const upstreamPort = (mockUpstream.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${upstreamPort}/details`;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    // 1. Test /api/v1/biorxiv
    const resp1 = await fetch(`http://127.0.0.1:${appPort}/api/v1/biorxiv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server: "biorxiv",
        targetUrl,
        category: "neuroscience",
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

    // 2. Test bare alias /biorxiv
    const resp2 = await fetch(`http://127.0.0.1:${appPort}/biorxiv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        server: "biorxiv",
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
    assert.equal(data2.data.articles.length, 2);
  } finally {
    app.close();
    mockUpstream.close();
  }
});
