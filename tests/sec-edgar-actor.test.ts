import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { SecEdgarActor } from "../src/actors/sec-edgar-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_TICKERS_JSON = {
  "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  "1": { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corp" },
};

const MOCK_SUBMISSIONS_JSON = {
  cik: "0000320193",
  entityType: "operating",
  sic: "3571",
  sicDescription: "Electronic Computers",
  name: "Apple Inc.",
  tickers: ["AAPL"],
  exchanges: ["Nasdaq"],
  filings: {
    recent: {
      accessionNumber: ["0000320193-23-000106", "0000320193-23-000077", "0000320193-23-000064"],
      filingDate: ["2023-11-03", "2023-08-04", "2023-05-05"],
      reportDate: ["2023-09-30", "2023-07-01", "2023-04-01"],
      acceptanceDateTime: [
        "2023-11-03T18:08:27.000Z",
        "2023-08-04T18:05:12.000Z",
        "2023-05-05T18:10:02.000Z",
      ],
      act: ["34", "34", "34"],
      form: ["10-K", "10-Q", "10-Q"],
      fileNumber: ["001-36743", "001-36743", "001-36743"],
      filmNumber: ["231376045", "231145678", "231012345"],
      items: ["", "", ""],
      size: [1234567, 789012, 654321],
      isXBRL: [1, 1, 1],
      isInlineXBRL: [1, 1, 1],
      primaryDocument: ["aapl-20230930.htm", "aapl-20230701.htm", "aapl-20230401.htm"],
      primaryDocDescription: ["10-K", "10-Q", "10-Q"],
    },
  },
};

test("SecEdgarActor queries corporate filings by CIK directly", async () => {
  let userAgentHeader: string | undefined;

  const server = http.createServer((req, res) => {
    userAgentHeader = req.headers["user-agent"];
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SUBMISSIONS_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/submissions/CIK0000320193.json`;

  try {
    const actor = new SecEdgarActor();
    const result = await actor.run(
      {
        taskId: "test-sec-1",
        actorType: "sec-edgar",
        targetUrl,
        options: {
          secEdgarOptions: {
            cik: "320193",
          },
        },
      },
      {
        task: { taskId: "test-sec-1", actorType: "sec-edgar", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.cik, "0000320193");
    assert.equal(result.data.entityName, "Apple Inc.");
    assert.equal(result.data.sic, "3571");
    assert.equal(result.data.filings.length, 3);
    assert.equal(result.data.filings[0].form, "10-K");
    assert.ok(result.data.markdown?.includes("# SEC EDGAR Filings: Apple Inc. (CIK: 0000320193)"));
    assert.ok(result.data.markdown?.includes("10-K"));
    assert.ok(String(userAgentHeader).includes("protokol-7"));
  } finally {
    server.close();
  }
});

test("SecEdgarActor filters filings by formType and limit", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SUBMISSIONS_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/submissions/CIK0000320193.json`;

  try {
    const actor = new SecEdgarActor();
    const result = await actor.run(
      {
        taskId: "test-sec-2",
        actorType: "sec-edgar",
        targetUrl,
        options: {
          secEdgarOptions: {
            cik: "0000320193",
            formType: "10-K",
            limit: 5,
          },
        },
      },
      {
        task: { taskId: "test-sec-2", actorType: "sec-edgar", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.filings.length, 1);
    assert.equal(result.data.filings[0].form, "10-K");
    assert.equal(result.data.filings[0].accessionNumber, "0000320193-23-000106");
  } finally {
    server.close();
  }
});

test("SecEdgarActor resolves ticker symbol to CIK via ticker endpoint", async () => {
  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url || "", "http://127.0.0.1");
    if (parsed.pathname.includes("company_tickers")) {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_TICKERS_JSON));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SUBMISSIONS_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/submissions/CIK0000320193.json`;

  try {
    const actor = new SecEdgarActor();
    const result = await actor.run(
      {
        taskId: "test-sec-3",
        actorType: "sec-edgar",
        targetUrl,
        options: {
          secEdgarOptions: {
            ticker: "AAPL",
          },
        },
      },
      {
        task: { taskId: "test-sec-3", actorType: "sec-edgar", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.entityName, "Apple Inc.");
  } finally {
    server.close();
  }
});

test("SecEdgarActor fails when neither ticker nor CIK is provided", async () => {
  const actor = new SecEdgarActor();
  const result = await actor.run(
    {
      taskId: "test-sec-4",
      actorType: "sec-edgar",
      targetUrl: "https://data.sec.gov",
      options: {
        secEdgarOptions: {},
      },
    },
    {
      task: { taskId: "test-sec-4", actorType: "sec-edgar", targetUrl: "https://data.sec.gov" },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("ticker"));
});
