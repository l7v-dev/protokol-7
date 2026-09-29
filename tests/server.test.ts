import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

import { createServer } from "@/server";

test("GET /health returns healthy status and metadata", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { status: string; service: string };
    assert.equal(data.status, "healthy");
    assert.equal(data.service, "protokol-7");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("GET /api/v1/actors lists registered actors", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/actors`);
    assert.equal(res.status, 200);

    const json = (await res.json()) as { actors: Array<{ actorType: string }>; total: number };
    assert.ok(Array.isArray(json.actors));
    assert.ok(json.total >= 4);

    const actorTypes = json.actors.map((a) => a.actorType);
    assert.ok(actorTypes.includes("cheerio-scraper"));
    assert.ok(actorTypes.includes("playwright-browser"));
    assert.ok(actorTypes.includes("api-extractor"));
    assert.ok(actorTypes.includes("crawler"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/actors validates input and rejects missing parameters", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    // Missing targetUrl
    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/actors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorType: "cheerio-scraper" }),
    });
    assert.equal(res1.status, 400);

    // Missing actorType
    const res2 = await fetch(`http://127.0.0.1:${port}/api/v1/actors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl: "https://example.com" }),
    });
    assert.equal(res2.status, 400);

    // Unknown actorType
    const res3 = await fetch(`http://127.0.0.1:${port}/api/v1/actors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorType: "non-existent-actor", targetUrl: "https://example.com" }),
    });
    assert.equal(res3.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/scrape executes cheerio scrape on HTML content", async () => {
  // Spawn mock web page
  const targetServer = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<html><head><title>Scrape Test</title></head><body><p>Clean extracted text</p></body></html>"
    );
  });
  await new Promise<void>((resolve) => targetServer.listen(0, "127.0.0.1", resolve));
  const targetPort = (targetServer.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${targetPort}`;

  // Spawn protokol-7 server
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl,
        renderJavaScript: false,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: { title: string; content: string };
    };
    assert.equal(json.success, true);
    assert.equal(json.data.title, "Scrape Test");
    assert.ok(json.data.content.includes("Clean extracted text"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => targetServer.close(() => resolve()));
  }
});

test("DELETE /browser/session/:id closes session using root alias", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/browser/session/test-sess-123`, {
      method: "DELETE",
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as { success: boolean; closedSessionId: string };
    assert.equal(data.success, true);
    assert.equal(data.closedSessionId, "test-sess-123");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/network/intercept validates targetUrl", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/network/intercept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.ok(json.error.includes("targetUrl"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/search validates query and targetUrl", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.ok(json.error.includes("query") || json.error.includes("targetUrl"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/pdf validates targetUrl and pdfBase64", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.ok(json.error.includes("targetUrl") || json.error.includes("pdfBase64"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/pdf extracts text from valid base64 payload", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  const minimalPdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj
4 0 obj<</Length 41>>stream
BT
/F1 12 Tf
72 712 Td
(API Test PDF) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000195 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
286
%%EOF`;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pdfBase64: Buffer.from(minimalPdf).toString("base64"),
      }),
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data: { fullText: string; totalPages: number };
    };
    assert.equal(json.success, true);
    assert.equal(json.data.totalPages, 1);
    assert.ok(json.data.fullText.includes("API Test PDF"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("GET /openapi.json returns valid OpenAPI 3.1.0 specification", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/openapi.json`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("application/json"));

    const schema = (await res.json()) as {
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    };

    assert.equal(schema.openapi, "3.1.0");
    assert.equal(schema.info.title, "Protokol-7 Microservice API");
    assert.ok(schema.paths["/health"]);
    assert.ok(schema.paths["/openapi.json"]);
    assert.ok(schema.paths["/docs"]);
    assert.ok(schema.paths["/api/v1/scrape"]);
    assert.ok(schema.paths["/api/v1/browser/action"]);
    assert.ok(schema.paths["/api/v1/epub"]);
    assert.ok(schema.paths["/api/v1/dergipark"]);
    assert.ok(schema.paths["/api/v1/internet-archive"]);
    assert.ok(schema.paths["/api/v1/devdocs"]);
    assert.ok(schema.paths["/api/v1/rosetta-code"]);
    assert.ok(schema.paths["/api/v1/papers-with-code"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/epub validates payload and rejects empty request", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/epub`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const json = (await res.json()) as { error: string };
    assert.ok(json.error.includes("targetUrl or epubBase64"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/dergipark routes correctly via server router", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/dergipark`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "record" }),
    });
    // Record action without identifier should return 400 from DergiParkActor
    assert.equal(res.status, 400);
    const json = (await res.json()) as { success: boolean; errorMessage?: string };
    assert.equal(json.success, false);
    assert.ok(json.errorMessage?.includes("identifier"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/internet-archive routes correctly via server router", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/internet-archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "search" }),
    });
    // Search action without searchQuery should return 400 from InternetArchiveActor
    assert.equal(res.status, 400);
    const json = (await res.json()) as { success: boolean; errorMessage?: string };
    assert.equal(json.success, false);
    assert.ok(json.errorMessage?.includes("searchQuery"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/clinical-trials routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        totalCount: 1,
        studies: [
          {
            protocolSection: {
              identificationModule: {
                nctId: "NCT00000001",
                briefTitle: "Server Router Test Trial",
              },
            },
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/clinical-trials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/api/v2/studies`,
        query: "melanoma",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { totalCount: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.totalCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/open-fda routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        meta: { results: { total: 1, skip: 0, limit: 1 } },
        results: [{ openfda: { brand_name: ["Aspirin"] } }],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/open-fda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/drug/label.json`,
        search: "aspirin",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { total: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.total, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/sec-edgar queries SEC filings through HTTP endpoint", async () => {
  const mockSubmissions = {
    cik: "0000320193",
    name: "Apple Inc.",
    filings: {
      recent: {
        accessionNumber: ["0000320193-23-000106"],
        filingDate: ["2023-11-03"],
        reportDate: ["2023-09-30"],
        form: ["10-K"],
        primaryDocument: ["aapl-20230930.htm"],
      },
    },
  };

  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(mockSubmissions));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/sec-edgar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/submissions/CIK0000320193.json`,
        cik: "0000320193",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: { cik: string; entityName: string };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.cik, "0000320193");
    assert.equal(json.data?.entityName, "Apple Inc.");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/court-listener queries legal opinions through HTTP endpoint", async () => {
  const mockSearchResults = {
    count: 1,
    results: [
      {
        id: 12345,
        caseName: "Test Case v. Respondent",
        court: "Supreme Court",
        snippet: "Fair use precedent.",
      },
    ],
  };

  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(mockSearchResults));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/court-listener`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest/v4/search/`,
        query: "fair use",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { totalCount: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.totalCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/software-heritage fetches code through HTTP endpoint", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end('fn main() { println!("Test"); }');
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/software-heritage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/api/1/content/sha1_git:94a9ed024d3859793618152ea559a168bbcbb5e2/raw/`,
        swhid: "swh:1:cnt:94a9ed024d3859793618152ea559a168bbcbb5e2",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { action: string } };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "content");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/eur-lex fetches regulation through HTTP endpoint", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end('<div id="title">Regulation 2016/679</div><p>Article 1</p>');
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/eur-lex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/legal-content/en/TXT/HTML/?uri=CELEX:32016R0679`,
        celex: "32016R0679",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { celex: string } };
    assert.equal(json.success, true);
    assert.equal(json.data?.celex, "32016R0679");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/openstax returns textbook catalog", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        meta: { total_count: 1 },
        items: [
          {
            id: 38,
            title: "Algebra and Trigonometry",
            slug: "algebra-and-trigonometry",
            description: "Algebra text",
          },
        ],
      })
    );
  });
  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverPort = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/v1/openstax`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/apps/cms/api/v2/pages/?type=books.Book`,
        action: "catalog",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { totalCount: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.totalCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/mit-ocw returns courses search results", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        hits: {
          total: { value: 1 },
          hits: [
            {
              _id: "test-course",
              _source: {
                id: 101,
                title: "Linear Algebra",
                coursenum: "18.06",
              },
            },
          ],
        },
      })
    );
  });
  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverPort = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/v1/mit-ocw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/api/v0/search/`,
        query: "linear algebra",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { totalCount: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.totalCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("GET /docs returns interactive Swagger UI HTML", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/docs`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/html"));

    const html = await res.text();
    assert.ok(html.includes("Protokol-7 // API Documentation"));
    assert.ok(html.includes("swagger-ui-dist"));
    assert.ok(html.includes("/openapi.json"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Server error responses adhere to SelfHealingError contract", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    // 400 Missing parameter test
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);

    const json = (await res.json()) as {
      success: boolean;
      error: string;
      code: string;
      retryable: boolean;
      remedy: string;
      timestamp: string;
    };

    assert.equal(json.success, false);
    assert.ok(json.error.includes("targetUrl"));
    assert.equal(json.code, "MISSING_REQUIRED_PARAMETER");
    assert.equal(json.retryable, false);
    assert.ok(json.remedy.length > 5);
    assert.ok(Date.parse(json.timestamp) > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Route aliases (/markdown, /intercept, /serp, /document, /archive) reach valid handlers", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    // /api/v1/markdown alias should return 400 when targetUrl is missing rather than 404
    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/markdown`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res1.status, 400);

    // /api/v1/intercept alias
    const res2 = await fetch(`http://127.0.0.1:${port}/api/v1/intercept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res2.status, 400);

    // /api/v1/serp alias
    const res3 = await fetch(`http://127.0.0.1:${port}/api/v1/serp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res3.status, 400);

    // /api/v1/document alias
    const res4 = await fetch(`http://127.0.0.1:${port}/api/v1/document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res4.status, 400);

    // /api/v1/archive alias
    const res5 = await fetch(`http://127.0.0.1:${port}/api/v1/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res5.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/browser/action handles action execution error with 400 BROWSER_ACTION_FAILED", async () => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/browser/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess-1",
        action: "navigate",
        params: {},
      }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { success: boolean; code?: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "BROWSER_ACTION_FAILED");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("POST /api/v1/resmi-gazete routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <html>
        <head><title>Resmi Gazete</title></head>
        <body>
          <h2>YÜRÜTME VE İDARE BÖLÜMÜ</h2>
          <h3>KANUNLAR</h3>
          <p><a href="/eskiler/2024/03/20240315-1.htm">7499 Sayılı Kanun</a></p>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/resmi-gazete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/eskiler/2024/03/20240315.htm`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { totalItems: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.totalItems, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/yargitay routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        data: [
          {
            daire: "1. Hukuk Dairesi",
            esasNo: "2023/100",
            kararNo: "2023/200",
            kararTarihi: "01/03/2023",
            ozet: "Miras taksim sözleşmesi uyuşmazlığı.",
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/yargitay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/kararlar`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { totalCount: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.totalCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/kap routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify([
        {
          disclosureIndex: "777888",
          stockCodes: "THYAO",
          companyTitle: "TÜRK HAVA YOLLARI A.O.",
          publishDate: "20.03.2024 10:00:00",
          summaryTitle: "Yolcu Sayısı Trafik Sonuçları",
        },
      ])
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/kap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/disclosures`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data?: { totalCount: number } };
    assert.equal(json.success, true);
    assert.equal(json.data?.totalCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/github routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        name: "linux",
        full_name: "torvalds/linux",
        description: "Linux kernel source tree",
        stargazers_count: 180000,
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/repos/torvalds/linux`,
        owner: "torvalds",
        repo: "linux",
        action: "repo",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: { owner: string; repo: string; action: string };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.owner, "torvalds");
    assert.equal(json.data?.repo, "linux");
    assert.equal(json.data?.action, "repo");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/openreview routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        notes: [
          {
            id: "paper-sample-1",
            content: {
              title: "Reasoning with Transformers",
              authors: ["John von Neumann"],
              abstract: "Mathematical reasoning in deep models.",
            },
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/openreview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/notes`,
        action: "submissions",
        venue: "ICLR.cc/2024/Conference",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: { action: string; totalCount: number };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "submissions");
    assert.equal(json.data?.totalCount, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/hacker-news routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        hits: [
          {
            objectID: "38870197",
            title: "Distributed Cache Architecture Post-Mortem",
            author: "lead_infra",
            points: 500,
            num_comments: 80,
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/hacker-news`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/search?tags=front_page`,
        action: "top",
        limit: 10,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: { action: string; totalStories: number };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "top");
    assert.equal(json.data?.totalStories, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/huggingface-datasets routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        rows: [
          {
            row_idx: 0,
            row: { question: "2+2?", answer: "4" },
          },
        ],
        features: [
          { feature_idx: 0, name: "question", type: { dtype: "string" } },
          { feature_idx: 1, name: "answer", type: { dtype: "string" } },
        ],
        num_rows_total: 100,
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/huggingface-datasets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataset: "test/dataset",
        targetUrl: `http://127.0.0.1:${mockPort}/rows?dataset=test%2Fdataset`,
        action: "rows",
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: { dataset: string; totalRows: number; rows: Array<unknown> };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.dataset, "test/dataset");
    assert.equal(json.data?.totalRows, 100);
    assert.equal(json.data?.rows?.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/math-reasoning routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        rows: [
          {
            row_idx: 0,
            row: { question: "What is 5 + 7?", answer: "5 + 7 = 12\n#### 12" },
          },
        ],
        num_rows_total: 100,
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/math-reasoning`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        benchmark: "gsm8k",
        targetUrl: `http://127.0.0.1:${mockPort}/rows?dataset=openai%2Fgsm8k`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: { benchmark: string; totalProblems: number; problems: Array<{ answer: string }> };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.benchmark, "gsm8k");
    assert.equal(json.data?.totalProblems, 1);
    assert.equal(json.data?.problems?.[0]?.answer, "12");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/code-eval routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        rows: [
          {
            row_idx: 0,
            row: {
              task_id: "HumanEval/0",
              prompt: "def has_close_elements():\n",
              entry_point: "has_close_elements",
              canonical_solution: "    return True\n",
              test: "assert has_close_elements() == True",
            },
          },
        ],
        num_rows_total: 164,
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/code-eval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        benchmark: "humaneval",
        targetUrl: `http://127.0.0.1:${mockPort}/rows?dataset=openai%2Fopenai_humaneval`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        benchmark: string;
        totalTasks: number;
        tasks: Array<{ taskId: string; entryPoint: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.benchmark, "humaneval");
    assert.equal(json.data?.totalTasks, 1);
    assert.equal(json.data?.tasks?.[0]?.taskId, "HumanEval/0");
    assert.equal(json.data?.tasks?.[0]?.entryPoint, "has_close_elements");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/proofwiki routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        parse: {
          title: "Pythagorean Theorem",
          pageid: 1234,
          wikitext: {
            "*": "== Theorem ==\n<math>a^2 + b^2 = c^2</math>\n== Proof ==\nBy geometry.\n{{QED}}",
          },
          categories: [{ "*": "Theorems" }],
        },
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/proofwiki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "theorem",
        title: "Pythagorean Theorem",
        targetUrl: `http://127.0.0.1:${mockPort}/test?action=parse`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        totalResults: number;
        items: Array<{ title: string; theorem: string; proofs: string[] }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "theorem");
    assert.equal(json.data?.totalResults, 1);
    assert.equal(json.data?.items?.[0]?.title, "Pythagorean Theorem");
    assert.ok(json.data?.items?.[0]?.theorem?.includes("a^2 + b^2 = c^2"));
    assert.equal(json.data?.items?.[0]?.proofs?.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/lean-mathlib routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "/-- Order preserving. -/\ntheorem succ_le_succ (h : n ≤ m) : succ n ≤ succ m := by\n  exact h\n"
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/lean-mathlib`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "file",
        path: "Mathlib/Data/Nat/Basic.lean",
        targetUrl: `http://127.0.0.1:${mockPort}/test/Basic.lean`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        totalDeclarations: number;
        items: Array<{ name: string; kind: string; tactics?: string[] }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "file");
    assert.equal(json.data?.totalDeclarations, 1);
    assert.equal(json.data?.items?.[0]?.name, "succ_le_succ");
    assert.equal(json.data?.items?.[0]?.kind, "theorem");
    assert.equal(json.data?.items?.[0]?.tactics?.[0], "exact h");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/lesswrong routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        data: {
          posts: {
            results: [
              {
                _id: "post123",
                title: "Twelve Virtues of Rationality",
                slug: "twelve-virtues-of-rationality",
                pageUrl: "https://www.lesswrong.com/posts/post123/twelve-virtues-of-rationality",
                postedAt: "2024-01-01T10:00:00.000Z",
                baseScore: 150,
                user: {
                  username: "EliezerYudkowsky",
                  displayName: "Eliezer Yudkowsky",
                },
                htmlBody: "<p>The first virtue is curiosity.</p>",
              },
            ],
            totalCount: 1,
          },
        },
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/lesswrong`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "posts",
        platform: "lesswrong",
        targetUrl: `http://127.0.0.1:${mockPort}/graphql`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        platform: string;
        totalResults: number;
        posts: Array<{ id: string; title: string; author: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "posts");
    assert.equal(json.data?.platform, "lesswrong");
    assert.equal(json.data?.totalResults, 1);
    assert.equal(json.data?.posts?.[0]?.id, "post123");
    assert.equal(json.data?.posts?.[0]?.title, "Twelve Virtues of Rationality");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/wikisource routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        title: "Nutuk",
        extract: "1919 senesi Mayisinin 19'uncu gunu Samsun'a ciktim.",
        description: "Mustafa Kemal Ataturk'un eseri",
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/wikisource`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lang: "tr",
        action: "summary",
        title: "Nutuk",
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest_v1/page/summary/Nutuk`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        lang: string;
        action: string;
        items: Array<{ title: string; extract: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.lang, "tr");
    assert.equal(json.data?.action, "summary");
    assert.equal(json.data?.items?.[0]?.title, "Nutuk");
    assert.ok(json.data?.items?.[0]?.extract?.includes("Samsun"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/wiktionary routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        en: [
          {
            partOfSpeech: "Noun",
            language: "English",
            definitions: [
              {
                definition: "A set of rules for solving a problem.",
              },
            ],
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/wiktionary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lang: "en",
        action: "definition",
        word: "algorithm",
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest_v1/page/definition/algorithm`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        lang: string;
        action: string;
        items: Array<{ word: string; partsOfSpeech?: Array<{ partOfSpeech: string }> }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.lang, "en");
    assert.equal(json.data?.action, "definition");
    assert.equal(json.data?.items?.[0]?.word, "algorithm");
    assert.equal(json.data?.items?.[0]?.partsOfSpeech?.[0]?.partOfSpeech, "Noun");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/wikiquote routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        title: "Albert Einstein",
        extract: "Albert Einstein was a theoretical physicist.",
        content_urls: { desktop: { page: "https://en.wikiquote.org/wiki/Albert_Einstein" } },
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/wikiquote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lang: "en",
        action: "summary",
        title: "Albert Einstein",
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest_v1/page/summary/Albert_Einstein`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        lang: string;
        action: string;
        items: Array<{ title: string; extract?: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.lang, "en");
    assert.equal(json.data?.items?.[0]?.title, "Albert Einstein");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/wikidata routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        entities: {
          Q42: {
            id: "Q42",
            labels: { en: { value: "Douglas Adams" } },
            descriptions: { en: { value: "English author" } },
            claims: {},
          },
        },
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/wikidata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId: "Q42",
        lang: "en",
        action: "entity",
        targetUrl: `http://127.0.0.1:${mockPort}/w/api.php?action=wbgetentities&ids=Q42`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        items: Array<{ id: string; label?: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.items?.[0]?.id, "Q42");
    assert.equal(json.data?.items?.[0]?.label, "Douglas Adams");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/stanford-phil returns philosophical entry through HTTP endpoint", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <div id="auhead">
        <h1>Gödel's Incompleteness Theorems</h1>
        <span class="author">Panu Raatikainen</span>
      </div>
      <div id="main-text">
        <h2>1. Introduction</h2>
        <p>In 1931 Kurt Gödel proved his incompleteness theorems.</p>
      </div>
    `);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/stanford-phil`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: "goedel-incompleteness",
        action: "entry",
        targetUrl: `http://127.0.0.1:${mockPort}/entries/goedel-incompleteness/`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        entry?: { title: string; authors: string[] };
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.entry?.title, "Gödel's Incompleteness Theorems");
    assert.ok(json.data?.entry?.authors.includes("Panu Raatikainen"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/metamath returns formal theorem through HTTP endpoint", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <title>Theorem mpc2</title>
      <p>Modus ponens corollary.</p>
      <table>
        <tr><td>Assertion</td><td>⊢ ψ</td></tr>
      </table>
    `);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/metamath`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        theorem: "mpc2",
        database: "set.mm",
        action: "theorem",
        targetUrl: `http://127.0.0.1:${mockPort}/mpeuni/mpc2.html`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        theorem?: { name: string; assertion: string };
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.theorem?.name, "mpc2");
    assert.equal(json.data?.theorem?.assertion, "⊢ ψ");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/devdocs routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify([
        {
          name: "Rust",
          slug: "rust",
          type: "rust",
          version: "1.75",
        },
      ])
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/devdocs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list_docs",
        targetUrl: `http://127.0.0.1:${mockPort}/docs/docs.json`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        docs?: Array<{ name: string; slug: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "list_docs");
    assert.equal(json.data?.docs?.[0]?.slug, "rust");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/rosetta-code routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        parse: {
          title: "100 doors",
          sections: [{ toclevel: 1, level: "2", line: "Python", anchor: "Python" }],
          text: {
            "*": "<div><p>Task description</p><h2 id='Python'>Python</h2><pre><code>print(1)</code></pre></div>",
          },
        },
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/rosetta-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "task",
        task: "100 doors",
        targetUrl: `http://127.0.0.1:${mockPort}/wiki/100_doors`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        taskDetails?: { title: string };
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "task");
    assert.equal(json.data?.taskDetails?.title, "100 doors");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/papers-with-code routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "1706.03762",
        title: "Attention Is All You Need",
        summary: "Transformer model.",
        authors: [{ name: "Ashish Vaswani" }],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/papers-with-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "paper",
        arxivId: "1706.03762",
        targetUrl: `http://127.0.0.1:${mockPort}/papers/1706.03762`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        paper?: { id: string; title: string };
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "paper");
    assert.equal(json.data?.paper?.title, "Attention Is All You Need");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/libretexts routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        page: [
          {
            id: 101,
            title: "Quantum Mechanics",
            "uri.ui": "http://127.0.0.1/Bookshelves/Physics/QM",
            summary: "Principles of quantum physics.",
          },
        ],
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/libretexts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search",
        query: "quantum",
        library: "phys",
        targetUrl: `http://127.0.0.1:${mockPort}/@api/deki/site/query?q=quantum`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        pages?: Array<{ title: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "search");
    assert.equal(json.data?.pages?.[0]?.title, "Quantum Mechanics");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/open-textbook routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <html>
        <body>
          <article class="textbook">
            <h2><a href="/opentextbooks/textbooks/101">Calculus Volume 1</a></h2>
            <p class="author">By: Edwin Herman</p>
          </article>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/open-textbook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search",
        query: "calculus",
        targetUrl: `http://127.0.0.1:${mockPort}/opentextbooks/textbooks?term=calculus`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        books?: Array<{ title: string }>;
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "search");
    assert.equal(json.data?.books?.[0]?.title, "Calculus Volume 1");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});

test("POST /api/v1/semantic-scholar routes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
        title: "Attention Is All You Need",
        year: 2017,
        citationCount: 120000,
      })
    );
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/semantic-scholar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "paper",
        paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
        targetUrl: `http://127.0.0.1:${mockPort}/paper/649def34f8be52c8b66281af98ae884c09aef38b`,
      }),
    });

    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        action: string;
        paper?: { title: string; year: number };
      };
    };
    assert.equal(json.success, true);
    assert.equal(json.data?.action, "paper");
    assert.equal(json.data?.paper?.title, "Attention Is All You Need");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  }
});
