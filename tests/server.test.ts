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
