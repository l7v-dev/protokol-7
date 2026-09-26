import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { ArxivActor } from "../src/actors/arxiv-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <link href="http://arxiv.org/api/query?search_query=cat:cs.AI" rel="self" type="application/atom+xml"/>
  <title type="html">arXiv Query: cat:cs.AI</title>
  <id>http://arxiv.org/api/12345</id>
  <updated>2023-01-20T00:00:00Z</updated>
  <opensearch:totalResults>42</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <opensearch:itemsPerPage>1</opensearch:itemsPerPage>
  <entry>
    <id>http://arxiv.org/abs/2301.07067v1</id>
    <updated>2023-01-18T18:00:00Z</updated>
    <published>2023-01-17T15:00:00Z</published>
    <title>
      Scalable Diffusion Models with Transformers
    </title>
    <summary>
      We explore a new class of diffusion models based on the Transformer architecture.
      We train Diffusion Transformers (DiTs).
    </summary>
    <author>
      <name>William Peebles</name>
      <arxiv:affiliation>UC Berkeley</arxiv:affiliation>
    </author>
    <author>
      <name>Saining Xie</name>
      <arxiv:affiliation>New York University</arxiv:affiliation>
    </author>
    <arxiv:doi>10.1109/ICCV.2023.01234</arxiv:doi>
    <arxiv:comment>ICCV 2023. 12 pages, 8 figures</arxiv:comment>
    <arxiv:journal_ref>IEEE Conference on Computer Vision</arxiv:journal_ref>
    <link href="http://arxiv.org/abs/2301.07067v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2301.07067v1" rel="related" type="application/pdf"/>
    <arxiv:primary_category term="cs.CV" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.CV" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>
`;

test("ArxivActor parses Atom 1.0 XML response and normalizes paper metadata", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8" });
    res.end(MOCK_ATOM_XML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/query?search_query=cat:cs.AI`;

  try {
    const actor = new ArxivActor();
    const result = await actor.run(
      {
        taskId: "test-arxiv-1",
        actorType: "arxiv",
        targetUrl,
      },
      {
        task: { taskId: "test-arxiv-1", actorType: "arxiv", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalResults, 42);
    assert.equal(result.data.startIndex, 0);
    assert.equal(result.data.itemsPerPage, 1);
    assert.equal(result.data.papers.length, 1);

    const paper = result.data.papers[0];
    assert.equal(paper.id, "2301.07067v1");
    assert.equal(paper.title, "Scalable Diffusion Models with Transformers");
    assert.ok(paper.summary.includes("Diffusion Transformers (DiTs)"));
    assert.equal(paper.authors.length, 2);
    assert.equal(paper.authors[0].name, "William Peebles");
    assert.equal(paper.authors[0].affiliation, "UC Berkeley");
    assert.equal(paper.authors[1].name, "Saining Xie");
    assert.equal(paper.authors[1].affiliation, "New York University");
    assert.equal(paper.published, "2023-01-17T15:00:00Z");
    assert.equal(paper.updated, "2023-01-18T18:00:00Z");
    assert.equal(paper.primaryCategory, "cs.CV");
    assert.deepEqual(paper.categories, ["cs.CV", "cs.AI", "cs.LG"]);
    assert.equal(paper.doi, "10.1109/ICCV.2023.01234");
    assert.equal(paper.comment, "ICCV 2023. 12 pages, 8 figures");
    assert.equal(paper.journalRef, "IEEE Conference on Computer Vision");
    assert.equal(paper.pdfUrl, "http://arxiv.org/pdf/2301.07067v1");
    assert.equal(paper.htmlUrl, "http://arxiv.org/abs/2301.07067v1");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("ArxivActor constructs correct query URL from options and targetUrl ID", async () => {
  let capturedUrl = "";

  const server = http.createServer((req, res) => {
    capturedUrl = req.url || "";
    res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8" });
    res.end(MOCK_ATOM_XML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new ArxivActor();
    const result = await actor.run(
      {
        taskId: "test-arxiv-query",
        actorType: "arxiv",
        targetUrl: `http://127.0.0.1:${port}/api/query`,
        options: {
          arxivOptions: {
            searchQuery: "cat:cs.AI AND ti:diffusion",
            idList: ["2301.07067"],
            start: 10,
            maxResults: 5,
            sortBy: "submittedDate",
            sortOrder: "descending",
          },
        },
      },
      {
        task: { taskId: "test-arxiv-query", actorType: "arxiv", targetUrl: "" },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.ok(capturedUrl.includes("search_query=cat%3Acs.AI+AND+ti%3Adiffusion"));
    assert.ok(capturedUrl.includes("id_list=2301.07067"));
    assert.ok(capturedUrl.includes("start=10"));
    assert.ok(capturedUrl.includes("max_results=5"));
    assert.ok(capturedUrl.includes("sortBy=submittedDate"));
    assert.ok(capturedUrl.includes("sortOrder=descending"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("ArxivActor extracts arXiv ID from paper abstract URL", async () => {
  let requestedId = "";

  const server = http.createServer((req, res) => {
    const u = new URL(req.url || "", "http://localhost");
    requestedId = u.searchParams.get("id_list") || "";
    res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8" });
    res.end(MOCK_ATOM_XML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new ArxivActor();
    const result = await actor.run(
      {
        taskId: "test-arxiv-abs",
        actorType: "arxiv",
        targetUrl: `http://127.0.0.1:${port}/api/query`,
        options: {
          arxivOptions: {
            idList: ["1706.03762"],
          },
        },
      },
      {
        task: { taskId: "test-arxiv-abs", actorType: "arxiv", targetUrl: "" },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(requestedId, "1706.03762");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("ArxivActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new ArxivActor();
  const result = await actor.run(
    {
      taskId: "test-arxiv-ssrf",
      actorType: "arxiv",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: { taskId: "test-arxiv-ssrf", actorType: "arxiv", targetUrl: "" },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF validation failed"));
});

test("POST /api/v1/arxiv routes request to ArxivActor successfully", async () => {
  // Start temporary mock backend for arXiv API
  const mockArxivServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8" });
    res.end(MOCK_ATOM_XML);
  });

  await new Promise<void>((resolve) => mockArxivServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockArxivServer.address() as { port: number }).port;

  // Start HTTP REST server
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const serverPort = (server.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/api/v1/arxiv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/api/query`,
        searchQuery: "cat:cs.AI",
        maxResults: 1,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean; data: { papers: unknown[] } };
    assert.equal(body.success, true);
    assert.ok(body.data.papers.length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockArxivServer.close(() => resolve()));
  }
});

test("ArxivActor enriches paper with PDF full text when downloadPdf is true", async () => {
  const MINIMAL_PDF_RAW = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj
4 0 obj<</Length 51>>stream
BT
/F1 12 Tf
72 712 Td
(Hello Protokol-7 PDF Document) Tj
ET
endstream
endobj
5 0 obj<</Title (Protokol Spec)/Author (Architect)>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000052 00000 n 
0000000101 00000 n 
0000000195 00000 n 
0000000296 00000 n 
trailer<</Size 6/Root 1 0 R/Info 5 0 R>>
startxref
355
%%EOF`;

  let serverPort = 0;
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/paper.pdf")) {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": Buffer.byteLength(MINIMAL_PDF_RAW),
      });
      res.end(MINIMAL_PDF_RAW);
      return;
    }

    const xmlWithLocalPdf = MOCK_ATOM_XML.replace(
      'href="http://arxiv.org/pdf/2301.07067v1"',
      `href="http://127.0.0.1:${serverPort}/paper.pdf"`
    );
    res.writeHead(200, { "Content-Type": "application/atom+xml; charset=utf-8" });
    res.end(xmlWithLocalPdf);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverPort = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${serverPort}/api/query?search_query=cat:cs.AI`;

  try {
    const actor = new ArxivActor();
    const result = await actor.run(
      {
        taskId: "test-arxiv-pdf",
        actorType: "arxiv",
        targetUrl,
        options: {
          arxivOptions: {
            downloadPdf: true,
          },
        },
      },
      {
        task: { taskId: "test-arxiv-pdf", actorType: "arxiv", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    const paper = result.data.papers[0];
    assert.ok(paper.fullText?.includes("Hello Protokol-7 PDF Document"));
    assert.ok(paper.pageCount !== undefined && paper.pageCount >= 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
