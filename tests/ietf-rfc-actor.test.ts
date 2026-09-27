import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { IetfRfcActor } from "../src/actors/corpus/ietf-rfc-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_RFC_TEXT = `Internet Engineering Task Force (IETF)                   R. Fielding, Ed.
Request for Comments: 7230                                         Adobe
Obsoletes: 2616, 2068                                    J. Reschke, Ed.
Category: Standards Track                                     greenbytes
ISSN: 2070-1721                                                June 2014


         Hypertext Transfer Protocol (HTTP/1.1): Message Syntax and Routing

Abstract

   The Hypertext Transfer Protocol (HTTP) is a stateless application-
   level protocol for distributed, collaborative, hypertext information
   systems.

Status of This Memo

   This is an Internet Standards Track document.
\f
Fielding & Reschke           Standards Track                    [Page 1]
RFC 7230                 HTTP/1.1 Message Syntax               June 2014

1.  Introduction

   The Hypertext Transfer Protocol (HTTP) is a request/response
   protocol.
\f
Fielding & Reschke           Standards Track                    [Page 2]
RFC 7230                 HTTP/1.1 Message Syntax               June 2014

2.  Architecture

   HTTP is a stateless client-server protocol.
`;

const MOCK_DATATRACKER_JSON = {
  meta: { total_count: 1 },
  objects: [
    {
      name: "rfc7230",
      title: "Hypertext Transfer Protocol (HTTP/1.1): Message Syntax and Routing",
      abstract: "The Hypertext Transfer Protocol (HTTP) is a stateless application-level protocol.",
      std_level: "Proposed Standard",
      rfc_number: 7230,
      time: "2014-06-01T00:00:00Z",
      obsoletes: ["rfc2616", "rfc2068"],
      obsoleted_by: ["rfc9112"],
    },
  ],
};

test("IetfRfcActor fetches RFC text and parses preamble metadata", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(MOCK_RFC_TEXT);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/rfc/rfc7230.txt`;

  try {
    const actor = new IetfRfcActor();
    const result = await actor.run(
      {
        taskId: "test-rfc-1",
        actorType: "ietf-rfc",
        targetUrl,
        options: {
          ietfRfcOptions: {
            rfcNumber: 7230,
          },
        },
      },
      {
        task: { taskId: "test-rfc-1", actorType: "ietf-rfc", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalResults, 1);
    assert.equal(result.data.rfcs.length, 1);

    const rfc = result.data.rfcs[0];
    assert.equal(rfc.rfcNumber, 7230);
    assert.equal(rfc.title, "Hypertext Transfer Protocol (HTTP/1.1): Message Syntax and Routing");
    assert.equal(rfc.status, "Standards Track");
    assert.equal(rfc.pubDate, "June 2014");
    assert.deepEqual(rfc.obsoletes, ["2616", "2068"]);
    assert.ok(rfc.abstract?.includes("stateless application-level protocol"));
    assert.ok(rfc.cleanText);
    assert.ok(!rfc.cleanText.includes("\f"));
    assert.ok(!rfc.cleanText.includes("[Page 1]"));
    assert.ok(!rfc.cleanText.includes("[Page 2]"));
    assert.ok(rfc.cleanText.includes("1.  Introduction"));
    assert.ok(rfc.cleanText.includes("2.  Architecture"));
  } finally {
    server.close();
  }
});

test("IetfRfcActor searches Datatracker index by title query", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_DATATRACKER_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/v1/doc/document`;

  try {
    const actor = new IetfRfcActor();
    const result = await actor.run(
      {
        taskId: "test-rfc-2",
        actorType: "ietf-rfc",
        targetUrl,
        options: {
          ietfRfcOptions: {
            query: "HTTP/1.1",
            limit: 5,
          },
        },
      },
      {
        task: { taskId: "test-rfc-2", actorType: "ietf-rfc", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalResults, 1);

    const rfc = result.data.rfcs[0];
    assert.equal(rfc.rfcNumber, 7230);
    assert.equal(rfc.title, "Hypertext Transfer Protocol (HTTP/1.1): Message Syntax and Routing");
    assert.equal(rfc.status, "Proposed Standard");
    assert.deepEqual(rfc.obsoletes, ["rfc2616", "rfc2068"]);
    assert.deepEqual(rfc.obsoletedBy, ["rfc9112"]);
  } finally {
    server.close();
  }
});

test("IetfRfcActor.cleanRfcText strips form feeds and page headers accurately", () => {
  const actor = new IetfRfcActor();
  const cleaned = actor.cleanRfcText(MOCK_RFC_TEXT);
  assert.ok(!cleaned.includes("\f"));
  assert.ok(!cleaned.includes("[Page 1]"));
  assert.ok(!cleaned.includes("[Page 2]"));
  assert.ok(cleaned.includes("1.  Introduction"));
  assert.ok(cleaned.includes("2.  Architecture"));
});

test("IetfRfcActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new IetfRfcActor();
  const result = await actor.run(
    {
      taskId: "test-rfc-ssrf",
      actorType: "ietf-rfc",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: {
        taskId: "test-rfc-ssrf",
        actorType: "ietf-rfc",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF"));
});

test("POST /api/v1/ietf-rfc executes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(MOCK_RFC_TEXT);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/ietf-rfc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/rfc/rfc7230.txt`,
        rfcNumber: 7230,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      success: boolean;
      data: { rfcs: Array<{ rfcNumber: number; title: string }> };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.rfcs[0].rfcNumber, 7230);
    assert.ok(body.data.rfcs[0].title.includes("Hypertext Transfer Protocol"));
  } finally {
    app.close();
    mockServer.close();
  }
});
