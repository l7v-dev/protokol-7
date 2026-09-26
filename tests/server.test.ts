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
