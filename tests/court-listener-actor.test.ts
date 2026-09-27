import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { CourtListenerActor } from "../src/actors/corpus/court-listener-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SEARCH_RESULTS_JSON = {
  count: 42,
  next: "http://127.0.0.1/api/rest/v4/search/?page=2",
  previous: null,
  results: [
    {
      id: 98765,
      caseName: "Oracle America, Inc. v. Google LLC",
      court: "Supreme Court of the United States",
      court_exact: "scotus",
      dateFiled: "2021-04-05",
      judge: "Breyer",
      citation: ["141 S. Ct. 1183", "209 L. Ed. 2d 311"],
      snippet:
        "The question presented is whether Google's copy of certain Java API packages constitutes fair use.",
      absolute_url: "/opinion/4862590/google-llc-v-oracle-america-inc/",
    },
    {
      id: 98766,
      caseName: "Campbell v. Acuff-Rose Music, Inc.",
      court: "Supreme Court of the United States",
      court_exact: "scotus",
      dateFiled: "1994-03-07",
      judge: "Souter",
      citation: ["510 U.S. 569"],
      snippet: "2 Live Crew's commercial parody of Roy Orbison song held fair use.",
      absolute_url: "/opinion/117826/campbell-v-acuff-rose-music-inc/",
    },
  ],
};

const MOCK_SINGLE_OPINION_JSON = {
  id: 4862590,
  absolute_url: "/opinion/4862590/google-llc-v-oracle-america-inc/",
  cluster: "http://127.0.0.1/api/rest/v4/clusters/4862590/",
  author: "http://127.0.0.1/api/rest/v4/people/1447/",
  type: "010combined",
  html_with_citations:
    "<p>Justice Breyer delivered the opinion of the Court.</p><p>We conclude that the copying here at issue happened to be a fair use.</p>",
  plain_text:
    "Justice Breyer delivered the opinion of the Court.\n\nWe conclude that the copying here at issue happened to be a fair use.",
  date_created: "2021-04-05T14:30:00Z",
  date_modified: "2021-04-05T15:00:00Z",
};

test("CourtListenerActor searches case law opinions with query and court filter", async () => {
  let interceptedQuery: string | null = null;
  let interceptedCourt: string | null = null;

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url || "", "http://127.0.0.1");
    interceptedQuery = parsed.searchParams.get("q");
    interceptedCourt = parsed.searchParams.get("court");

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SEARCH_RESULTS_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/rest/v4/search/`;

  try {
    const actor = new CourtListenerActor();
    const result = await actor.run(
      {
        taskId: "test-cl-1",
        actorType: "court-listener",
        targetUrl,
        options: {
          courtListenerOptions: {
            query: "fair use api",
            court: "scotus",
          },
        },
      },
      {
        task: { taskId: "test-cl-1", actorType: "court-listener", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 42);
    assert.equal(result.data.results.length, 2);
    assert.equal(result.data.results[0].caseName, "Oracle America, Inc. v. Google LLC");
    assert.equal(result.data.results[0].judge, "Breyer");
    assert.ok(result.data.markdown?.includes("# CourtListener Case Law Search: fair use api"));
    assert.ok(result.data.markdown?.includes("Oracle America, Inc. v. Google LLC"));
    assert.equal(interceptedQuery, "fair use api");
    assert.equal(interceptedCourt, "scotus");
  } finally {
    server.close();
  }
});

test("CourtListenerActor fetches single opinion by opinionId", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SINGLE_OPINION_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/rest/v4/opinions/4862590/`;

  try {
    const actor = new CourtListenerActor();
    const result = await actor.run(
      {
        taskId: "test-cl-2",
        actorType: "court-listener",
        targetUrl,
        options: {
          courtListenerOptions: {
            opinionId: 4862590,
          },
        },
      },
      {
        task: { taskId: "test-cl-2", actorType: "court-listener", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.results.length, 1);
    assert.equal(result.data.results[0].id, 4862590);
    assert.ok(result.data.markdown?.includes("# CourtListener Opinion #4862590"));
    assert.ok(result.data.markdown?.includes("Justice Breyer delivered the opinion"));
  } finally {
    server.close();
  }
});

test("CourtListenerActor fails when no search parameters are given", async () => {
  const actor = new CourtListenerActor();
  const result = await actor.run(
    {
      taskId: "test-cl-3",
      actorType: "court-listener",
      targetUrl: "https://www.courtlistener.com/api/rest/v4/search/",
      options: {
        courtListenerOptions: {},
      },
    },
    {
      task: {
        taskId: "test-cl-3",
        actorType: "court-listener",
        targetUrl: "https://www.courtlistener.com/api/rest/v4/search/",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("search parameter"));
});
