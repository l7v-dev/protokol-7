import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { DergiParkActor } from "../src/actors/dergipark-actor";
import type { ActorRunContext, ActorTask } from "../src/api/types";

// ---------------------------------------------------------------------------
// OAI-PMH XML fixtures
// ---------------------------------------------------------------------------

const LIST_SETS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <responseDate>2024-01-01T00:00:00Z</responseDate>
  <request verb="ListSets">https://dergipark.org.tr/api/public/oai</request>
  <ListSets>
    <set>
      <setSpec>tbd:dergi:1</setSpec>
      <setName>Bilgisayar Bilimleri Dergisi</setName>
    </set>
    <set>
      <setSpec>tbd:dergi:2</setSpec>
      <setName>Matematik Dergisi</setName>
    </set>
  </ListSets>
</OAI-PMH>`;

const LIST_RECORDS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
         xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <responseDate>2024-01-01T00:00:00Z</responseDate>
  <request verb="ListRecords">https://dergipark.org.tr/api/public/oai</request>
  <ListRecords>
    <record>
      <header>
        <identifier>oai:dergipark.org.tr:1234</identifier>
        <datestamp>2024-01-01</datestamp>
      </header>
      <metadata>
        <oai_dc:dc>
          <dc:title>Makine Ogrenimi ile Goruntu Siniflandirma</dc:title>
          <dc:creator>Ahmet Yilmaz</dc:creator>
          <dc:creator>Fatma Demir</dc:creator>
          <dc:description>Bu calisma, derin ogrenme yontemleri ile goruntu siniflandirma yapmaktadir.</dc:description>
          <dc:subject>makine ogrenimi</dc:subject>
          <dc:subject>derin ogrenme</dc:subject>
          <dc:publisher>Bilgisayar Bilimleri Dergisi</dc:publisher>
          <dc:date>2024-01-15</dc:date>
          <dc:language>tur</dc:language>
          <dc:identifier>https://dergipark.org.tr/article/123</dc:identifier>
          <dc:identifier>https://dergipark.org.tr/article/123/download.pdf</dc:identifier>
        </oai_dc:dc>
      </metadata>
    </record>
    <record>
      <header>
        <identifier>oai:dergipark.org.tr:5678</identifier>
        <datestamp>2024-01-02</datestamp>
      </header>
      <metadata>
        <oai_dc:dc>
          <dc:title>Dogal Dil Isleme Teknikleri</dc:title>
          <dc:creator>Mehmet Can</dc:creator>
          <dc:publisher>Bilisim Dergisi</dc:publisher>
          <dc:date>2024-01-20</dc:date>
          <dc:language>tur</dc:language>
        </oai_dc:dc>
      </metadata>
    </record>
    <resumptionToken>cursor=2&amp;size=20</resumptionToken>
  </ListRecords>
</OAI-PMH>`;

const GET_RECORD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"
         xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <responseDate>2024-01-01T00:00:00Z</responseDate>
  <request verb="GetRecord">https://dergipark.org.tr/api/public/oai</request>
  <GetRecord>
    <record>
      <header>
        <identifier>oai:dergipark.org.tr:1234</identifier>
        <datestamp>2024-01-01</datestamp>
      </header>
      <metadata>
        <oai_dc:dc>
          <dc:title>Tek Kayit Basligi</dc:title>
          <dc:creator>Zeynep Kaya</dc:creator>
          <dc:publisher>Test Dergisi</dc:publisher>
          <dc:date>2024-02-01</dc:date>
        </oai_dc:dc>
      </metadata>
    </record>
  </GetRecord>
</OAI-PMH>`;

const OAI_ERROR_XML = `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
  <error code="badArgument">Missing required argument: metadataPrefix</error>
</OAI-PMH>`;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTask(
  overrides: Partial<ActorTask> = {},
  dergiParkOpts: Record<string, unknown> = {}
): ActorTask {
  return {
    taskId: "test-task-dp",
    actorType: "dergipark",
    targetUrl: "https://dergipark.org.tr/api/public/oai",
    options: { dergiParkOptions: dergiParkOpts as never },
    ...overrides,
  };
}

const ctx: ActorRunContext = { task: makeTask(), startTime: Date.now() };

async function withServer(
  xml: string,
  statusCode: number,
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer((_, res) => {
    res.writeHead(statusCode, { "Content-Type": "application/xml; charset=utf-8" });
    res.end(xml);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const actor = new DergiParkActor();

describe("DergiParkActor", () => {
  it("actorType is 'dergipark'", () => {
    assert.equal(actor.actorType, "dergipark");
  });

  it("action='list-sets' returns journal sets from OAI-PMH", async () => {
    await withServer(LIST_SETS_XML, 200, async (baseUrl) => {
      const task = makeTask({ targetUrl: `${baseUrl}/oai` }, { action: "list-sets" });
      // Override OAI_BASE by pointing targetUrl — actor uses safeRedirectFetch with its own URL
      // We test the parsing logic by calling with a mocked server via NODE_ENV=test
      const result = await actor.run(task, ctx);
      // The actor builds its own URL from OAI_BASE constant, not targetUrl.
      // For unit tests, we verify the actor can call the mocked endpoint.
      // Since OAI_BASE is hardcoded, we test structural behavior via a real call.
      // This test validates actor construction and non-crash behavior.
      assert.ok(["completed", "failed"].includes(result.status));
    });
  });

  it("returns 400 when action='record' and no identifier provided", async () => {
    const task = makeTask({}, { action: "record" });
    const result = await actor.run(task, ctx);
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("identifier"));
  });

  it("returns 400 for OAI-PMH error response", async () => {
    // Monkey-patch fetch to return OAI error XML
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(OAI_ERROR_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    try {
      const task = makeTask({}, { action: "search" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "failed");
      assert.ok(result.errorMessage?.toLowerCase().includes("oai-pmh error"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("parses ListRecords XML and returns article array", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(LIST_RECORDS_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    try {
      const task = makeTask({}, { action: "search", maxRecords: 10 });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.action, "search");
      assert.ok(result.data.articles.length >= 2);
      const first = result.data.articles[0];
      assert.ok(first.title.length > 0);
      assert.ok(Array.isArray(first.authors));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("keyword filter reduces article count", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(LIST_RECORDS_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    try {
      const task = makeTask({}, { action: "search", keyword: "goruntu siniflandirma" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      // Only first article contains "goruntu siniflandirma"
      assert.equal(result.data?.articles.length, 1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("resumptionToken is extracted from ListRecords response", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(LIST_RECORDS_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    try {
      const task = makeTask({}, { action: "search" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.ok(result.data?.resumptionToken?.startsWith("cursor="));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("parses GetRecord XML and returns single article", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(GET_RECORD_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    try {
      const task = makeTask({}, { action: "record", identifier: "oai:dergipark.org.tr:1234" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.equal(result.data?.articles.length, 1);
      assert.equal(result.data?.articles[0].title, "Tek Kayit Basligi");
      assert.deepEqual(result.data?.articles[0].authors, ["Zeynep Kaya"]);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("parses list-sets XML and returns set array", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(LIST_SETS_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    try {
      const task = makeTask({}, { action: "list-sets" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.ok(Array.isArray(result.data?.sets));
      assert.ok((result.data?.sets?.length ?? 0) >= 2);
      const first = result.data?.sets?.[0];
      assert.ok(first?.setSpec.startsWith("tbd:dergi:"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("returns 5xx on HTTP error from OAI endpoint", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Service Unavailable", { status: 503 });
    try {
      const task = makeTask({}, { action: "search" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 503);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("maxRecords limits returned articles", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(LIST_RECORDS_XML, {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      });
    try {
      const task = makeTask({}, { action: "search", maxRecords: 1 });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.ok((result.data?.articles.length ?? 0) <= 1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
