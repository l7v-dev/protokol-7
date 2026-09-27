import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { EurLexActor } from "../src/actors/eur-lex-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_EUR_LEX_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Regulation (EU) 2016/679 of the European Parliament and of the Council</title>
</head>
<body>
  <div id="title">Regulation (EU) 2016/679 on the protection of natural persons with regard to the processing of personal data</div>
  <p class="oj-ref">OJ L 119, 4.5.2016, p. 1–88</p>
  <p class="doc-date">27.04.2016</p>
  <div class="content">
    <h2>CHAPTER I - General provisions</h2>
    <p><strong>Article 1</strong></p>
    <p>Subject-matter and objectives</p>
    <p>1. This Regulation lays down rules relating to the protection of natural persons with regard to the processing of personal data.</p>
  </div>
</body>
</html>
`;

const MOCK_SPARQL_RESULTS_JSON = {
  head: { vars: ["work", "celex", "title"] },
  results: {
    bindings: [
      {
        work: { type: "uri", value: "http://publications.europa.eu/resource/cellar/32016R0679" },
        celex: { type: "literal", value: "32016R0679" },
        title: {
          type: "literal",
          value: "Regulation (EU) 2016/679 of the European Parliament and of the Council (GDPR)",
        },
      },
      {
        work: { type: "uri", value: "http://publications.europa.eu/resource/cellar/32024R1689" },
        celex: { type: "literal", value: "32024R1689" },
        title: {
          type: "literal",
          value:
            "Regulation (EU) 2024/1689 of the European Parliament and of the Council (Artificial Intelligence Act)",
        },
      },
    ],
  },
};

test("EurLexActor fetches and normalizes EU regulation by CELEX number", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(MOCK_EUR_LEX_HTML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/legal-content/en/TXT/HTML/?uri=CELEX:32016R0679`;

  try {
    const actor = new EurLexActor();
    const result = await actor.run(
      {
        taskId: "test-eur-1",
        actorType: "eur-lex",
        targetUrl,
        options: {
          eurLexOptions: {
            celex: "32016R0679",
            language: "en",
          },
        },
      },
      {
        task: { taskId: "test-eur-1", actorType: "eur-lex", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.celex, "32016R0679");
    assert.equal(result.data.documents.length, 1);
    assert.equal(result.data.documents[0].documentType, "Regulation");
    assert.ok(result.data.markdown.includes("# EUR-Lex Document: CELEX 32016R0679"));
    assert.ok(result.data.markdown.includes("Article 1"));
    assert.ok(result.data.markdown.includes("Subject-matter and objectives"));
  } finally {
    server.close();
  }
});

test("EurLexActor queries CELLAR SPARQL endpoint for legal acts", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/sparql-results+json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SPARQL_RESULTS_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/webapi/rdf/sparql`;

  try {
    const actor = new EurLexActor();
    const result = await actor.run(
      {
        taskId: "test-eur-2",
        actorType: "eur-lex",
        targetUrl,
        options: {
          eurLexOptions: {
            query: "artificial intelligence",
          },
        },
      },
      {
        task: { taskId: "test-eur-2", actorType: "eur-lex", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.documents.length, 2);
    assert.equal(result.data.documents[0].celex, "32016R0679");
    assert.equal(result.data.documents[1].celex, "32024R1689");
    assert.ok(result.data.markdown.includes("# EUR-Lex Legal Act Search"));
    assert.ok(result.data.markdown.includes("32024R1689"));
  } finally {
    server.close();
  }
});

test("EurLexActor fails when neither CELEX nor query is provided", async () => {
  const actor = new EurLexActor();
  const result = await actor.run(
    {
      taskId: "test-eur-3",
      actorType: "eur-lex",
      targetUrl: "https://eur-lex.europa.eu",
      options: {
        eurLexOptions: {},
      },
    },
    {
      task: { taskId: "test-eur-3", actorType: "eur-lex", targetUrl: "https://eur-lex.europa.eu" },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("CELEX"));
});
