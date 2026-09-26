import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { EuropePmcActor } from "../src/actors/europe-pmc-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_EUROPE_PMC_JSON = {
  hitCount: 1,
  nextCursorMark: "AoJ/12345678",
  resultList: {
    result: [
      {
        id: "31234567",
        source: "MED",
        pmid: "31234567",
        pmcid: "PMC6789012",
        doi: "10.1038/s41586-019-1234-5",
        title: "CRISPR-Cas9 structures and targeted genomic modifications",
        authorString: "Doudna JA, Charpentier E, Zhang F",
        journalInfo: {
          journal: {
            title: "Nature",
          },
          yearOfPublication: 2020,
        },
        pubYear: "2020",
        abstractText:
          "The RNA-guided Cas9 endonuclease from Streptococcus pyogenes uses RNA-DNA base pairing to target specific genomic loci for cleavage.",
        isOpenAccess: "Y",
        hasTextMinedTerms: "Y",
        fullTextUrlList: {
          fullTextUrl: [
            {
              url: "https://europepmc.org/articles/PMC6789012?pdf=render",
              documentStyle: "pdf",
              availability: "Open access",
            },
            {
              url: "https://europepmc.org/articles/PMC6789012",
              documentStyle: "html",
              availability: "Open access",
            },
          ],
        },
      },
    ],
  },
};

test("EuropePmcActor searches and parses biomedical articles and abstracts", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_EUROPE_PMC_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/webservices/rest/search`;

  try {
    const actor = new EuropePmcActor();
    const result = await actor.run(
      {
        taskId: "test-epmc-1",
        actorType: "europe-pmc",
        targetUrl,
        options: {
          europePmcOptions: {
            query: "CRISPR-Cas9",
            pageSize: 5,
          },
        },
      },
      {
        task: { taskId: "test-epmc-1", actorType: "europe-pmc", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.hitCount, 1);
    assert.equal(result.data.nextCursorMark, "AoJ/12345678");
    assert.equal(result.data.articles.length, 1);

    const article = result.data.articles[0];
    assert.equal(article.id, "31234567");
    assert.equal(article.pmid, "31234567");
    assert.equal(article.pmcid, "PMC6789012");
    assert.equal(article.doi, "10.1038/s41586-019-1234-5");
    assert.equal(article.title, "CRISPR-Cas9 structures and targeted genomic modifications");
    assert.equal(article.journalTitle, "Nature");
    assert.equal(article.pubYear, 2020);
    assert.ok(article.abstractText?.includes("RNA-guided Cas9 endonuclease"));
    assert.equal(article.isOpenAccess, true);
    assert.equal(article.hasTextMinedTerms, true);
    // PDF documentStyle is preferred
    assert.equal(article.fullTextUrl, "https://europepmc.org/articles/PMC6789012?pdf=render");
  } finally {
    server.close();
  }
});

test("EuropePmcActor appends openAccessOnly filter to query", async () => {
  let interceptedQuery: string | null = null;

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url || "", "http://127.0.0.1");
    interceptedQuery = parsed.searchParams.get("query");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_EUROPE_PMC_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/webservices/rest/search`;

  try {
    const actor = new EuropePmcActor();
    const result = await actor.run(
      {
        taskId: "test-epmc-2",
        actorType: "europe-pmc",
        targetUrl,
        options: {
          europePmcOptions: {
            query: "cancer immunotherapy",
            openAccessOnly: true,
          },
        },
      },
      {
        task: { taskId: "test-epmc-2", actorType: "europe-pmc", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(interceptedQuery, "(cancer immunotherapy) AND OPEN_ACCESS:y");
  } finally {
    server.close();
  }
});

test("EuropePmcActor recognizes ebi.ac.uk domain as valid baseEndpoint", () => {
  const actor = new EuropePmcActor();
  // Using public method via private buildApiUrl call or run test
  const task = {
    taskId: "test-ebi",
    actorType: "europe-pmc" as const,
    targetUrl: "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    options: {
      europePmcOptions: {
        query: "crispr",
      },
    },
  };
  // @ts-expect-error testing private method
  const apiUrl = actor.buildApiUrl(task.targetUrl, task.options.europePmcOptions);
  assert.ok(apiUrl.startsWith("https://www.ebi.ac.uk/europepmc/webservices/rest/search"));
});

test("EuropePmcActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new EuropePmcActor();
  const result = await actor.run(
    {
      taskId: "test-epmc-ssrf",
      actorType: "europe-pmc",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: {
        taskId: "test-epmc-ssrf",
        actorType: "europe-pmc",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF"));
});

test("POST /api/v1/europe-pmc executes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_EUROPE_PMC_JSON));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/europe-pmc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/webservices/rest/search`,
        query: "CRISPR-Cas9",
        openAccessOnly: true,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      success: boolean;
      data: { articles: Array<{ title: string; pmid: string }> };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.articles[0].pmid, "31234567");
    assert.ok(body.data.articles[0].title.includes("CRISPR-Cas9"));
  } finally {
    app.close();
    mockServer.close();
  }
});
