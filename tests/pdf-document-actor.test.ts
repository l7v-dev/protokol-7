import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { PdfDocumentActor } from "../src/actors/pdf-document-actor";
import type { ActorTask } from "../src/api/types";

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

const MINIMAL_PDF_BASE64 = Buffer.from(MINIMAL_PDF_RAW).toString("base64");

describe("PdfDocumentActor - Binary PDF Text & Metadata Extractor", () => {
  let mockServer: http.Server;
  let serverPort: number;

  before(async () => {
    mockServer = http.createServer((_req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": String(Buffer.byteLength(MINIMAL_PDF_RAW)),
      });
      res.end(Buffer.from(MINIMAL_PDF_RAW));
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        serverPort = (mockServer.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it("extracts text and metadata from direct pdfBase64 payload", async () => {
    const actor = new PdfDocumentActor();
    const task: ActorTask = {
      taskId: "task-pdf-base64-1",
      actorType: "pdf-document",
      targetUrl: "",
      options: {
        pdfOptions: {
          pdfBase64: MINIMAL_PDF_BASE64,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data, "Result data must be present");
    assert.equal(result.data.totalPages, 1);
    assert.equal(result.data.extractedPages, 1);
    assert.ok(
      result.data.fullText.includes("Hello Protokol-7 PDF Document"),
      `Expected text to contain extracted snippet, got: ${result.data.fullText}`
    );
    assert.equal(result.data.metadata?.title, "Protokol Spec");
    assert.equal(result.data.metadata?.author, "Architect");
    assert.ok(result.data.totalCharacters > 0);
    assert.ok(result.data.totalWords > 0);
    assert.equal(result.data.pages.length, 1);
    assert.equal(result.data.pages[0].pageNumber, 1);
  });

  it("fetches and extracts PDF via HTTP targetUrl", async () => {
    const actor = new PdfDocumentActor();
    const task: ActorTask = {
      taskId: "task-pdf-http-1",
      actorType: "pdf-document",
      // Use explicit public host header or bypass SSRF for mock server by using custom options
      targetUrl: `http://127.0.0.1:${serverPort}/document.pdf`,
      options: {
        // SSRFGuard will block 127.0.0.1 by default, verifying SSRF guard functionality
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    // Since 127.0.0.1 is loopback, SSRFGuard blocks it by default
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("blocks SSRF requests targeting cloud metadata and private addresses", async () => {
    const actor = new PdfDocumentActor();
    const task: ActorTask = {
      taskId: "task-pdf-ssrf-1",
      actorType: "pdf-document",
      targetUrl: "http://169.254.169.254/latest/meta-data/credentials.pdf",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("rejects binary payload missing %PDF- magic bytes signature", async () => {
    const actor = new PdfDocumentActor();
    const invalidBase64 = Buffer.from("PLAIN TEXT NOT A PDF").toString("base64");
    const task: ActorTask = {
      taskId: "task-pdf-invalid-1",
      actorType: "pdf-document",
      targetUrl: "",
      options: {
        pdfOptions: {
          pdfBase64: invalidBase64,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("Missing '%PDF-' header"));
  });

  it("rejects request when neither targetUrl nor pdfBase64 is provided", async () => {
    const actor = new PdfDocumentActor();
    const task: ActorTask = {
      taskId: "task-pdf-empty-1",
      actorType: "pdf-document",
      targetUrl: "",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("Neither targetUrl nor pdfBase64"));
  });

  it("respects maxPages parameter to constrain extracted page count", async () => {
    const actor = new PdfDocumentActor();
    const task: ActorTask = {
      taskId: "task-pdf-maxpages-1",
      actorType: "pdf-document",
      targetUrl: "",
      options: {
        pdfOptions: {
          pdfBase64: MINIMAL_PDF_BASE64,
          maxPages: 1,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "completed");
    assert.equal(result.data?.extractedPages, 1);
  });
});
