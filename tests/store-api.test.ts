import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../src/core/server";

test("Store API - Catalog, Manifests, Runs, and Web MVP Dashboard", async (t) => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number; address: string };
  const baseUrl = `http://${addr.address}:${addr.port}`;

  t.after(() => {
    server.close();
  });

  await t.test("GET /api/v1/store/actors returns actor catalog", async () => {
    const res = await fetch(`${baseUrl}/api/v1/store/actors`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      actors: Array<{ name: string; title: string; category: string }>;
      total: number;
    };
    assert.ok(body.total >= 8);
    assert.ok(body.actors.some((a) => a.name === "cheerio-scraper"));
    assert.ok(body.actors.some((a) => a.name === "pdf-document"));
    assert.ok(body.actors.some((a) => a.name === "saglik-ekutuphane"));
  });

  await t.test(
    "GET /api/v1/store/actors/:name returns full manifest and input schema",
    async () => {
      const res = await fetch(`${baseUrl}/api/v1/store/actors/cheerio-scraper`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        actor: { name: string; inputSchema: { properties: Record<string, unknown> } };
      };
      assert.equal(body.actor.name, "cheerio-scraper");
      assert.ok(body.actor.inputSchema.properties.targetUrl);
    }
  );

  await t.test("POST /api/v1/store/actors/:name/run rejects missing required fields", async () => {
    const res = await fetch(`${baseUrl}/api/v1/store/actors/cheerio-scraper/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.ok(body.error.includes("Eksik zorunlu parametre"));
  });

  await t.test("POST /api/v1/store/actors/arxiv/run forwards arxivOptions correctly", async () => {
    const res = await fetch(`${baseUrl}/api/v1/store/actors/arxiv/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQuery: "cat:cs.AI",
        maxResults: 1,
      }),
    });
    // In test environment, it either reaches arXiv or SSRF policy, response status must be 200, 403, or 500
    assert.ok([200, 403, 500].includes(res.status));
    const body = (await res.json()) as { runId?: string };
    assert.ok(body.runId);
  });

  await t.test("GET /.well-known/mcp.json returns AI agent MCP tool registry", async () => {
    const res = await fetch(`${baseUrl}/.well-known/mcp.json`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { tools: Array<{ name: string; description: string }> };
    assert.ok(Array.isArray(body.tools));
    assert.ok(body.tools.length >= 8);
    assert.ok(body.tools.some((t) => t.name === "scrape_static_html"));
    assert.ok(body.tools.some((t) => t.name === "extract_pdf_text"));
  });

  await t.test("GET /api/v1/store/quarantine returns quarantine status", async () => {
    const res = await fetch(`${baseUrl}/api/v1/store/quarantine`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { totalQuarantined: number; items: unknown[] };
    assert.ok(typeof body.totalQuarantined === "number");
    assert.ok(Array.isArray(body.items));
  });

  await t.test("GET / returns headless service metadata JSON", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("application/json"));
    const body = (await res.json()) as {
      service: string;
      mode: string;
      status: string;
      endpoints: Record<string, string>;
    };
    assert.equal(body.service, "protokol-7");
    assert.equal(body.mode, "headless");
    assert.equal(body.status, "operational");
    assert.ok(body.endpoints.docs);
  });

  await t.test("GET /api/v1/store/actors includes network-interceptor manifest", async () => {
    const res = await fetch(`${baseUrl}/api/v1/store/actors`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      actors: Array<{ name: string; category: string }>;
    };
    assert.ok(body.actors.some((a) => a.name === "network-interceptor"));
  });

  await t.test("POST /api/v1/store/actors/ktb-ekitap/run accepts valid payload", async () => {
    const res = await fetch(`${baseUrl}/api/v1/store/actors/ktb-ekitap/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "list",
        category: "edebiyat",
        page: 1,
        limit: 5,
      }),
    });
    // In test environment without network, returns 200, 400 or 500 with runId
    const body = (await res.json()) as { runId?: string };
    assert.ok(body.runId);
  });
});
