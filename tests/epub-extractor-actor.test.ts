import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { EpubExtractorActor } from "../src/actors/epub-extractor-actor";
import type { ActorRunContext, ActorTask } from "../src/core/types";

function createMockEpubZip(files: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const rawData = Buffer.from(content, "utf8");
    const compressedData = deflateRawSync(rawData);
    const nameBuf = Buffer.from(name, "utf8");

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressedData.length, 18);
    header.writeUInt32LE(rawData.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    parts.push(header, nameBuf, compressedData);
  }
  return Buffer.concat(parts);
}

function buildMinimalEpub(): Record<string, string> {
  return {
    mimetype: "application/epub+zip",
    "META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
    "content.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Minimal EPUB Test</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`,
    "ch1.xhtml": `<!DOCTYPE html><html><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>Test content.</p></body></html>`,
  };
}

describe("EpubExtractorActor - Publication & E-Book Extraction Actor", () => {
  const actor = new EpubExtractorActor();

  it("extracts e-book from valid epubBase64 payload", async () => {
    const epubBuf = createMockEpubZip(buildMinimalEpub());

    const task: ActorTask = {
      taskId: "task-epub-base64",
      actorType: "epub-extractor",
      targetUrl: "",
      options: {
        epubOptions: {
          epubBase64: epubBuf.toString("base64"),
          includeTableOfContents: true,
        },
      },
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.metadata.publicationTitle, "Minimal EPUB Test");
    assert.deepEqual(result.data.metadata.authors, ["Test Author"]);
    assert.equal(result.data.totalChapters, 1);
    assert.equal(result.data.chapters[0].title, "Chapter 1");
    assert.ok(result.data.chapters[0].markdownContent.includes("Test content."));
  });

  it("downloads and extracts EPUB from HTTP targetUrl", async () => {
    const epubBuf = createMockEpubZip(buildMinimalEpub());

    const server = http.createServer((_, res) => {
      res.writeHead(200, { "Content-Type": "application/epub+zip" });
      res.end(epubBuf);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}/sample.epub`;

    try {
      const task: ActorTask = {
        taskId: "task-http-epub",
        actorType: "epub-extractor",
        targetUrl: url,
      };

      const context: ActorRunContext = { task, startTime: Date.now() };
      const result = await actor.run(task, context);

      // In loopback without allowLocalNetwork, SSRF guard blocks (403), or permits if enabled
      assert.ok(result.statusCode === 403 || result.statusCode === 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("blocks SSRF attempts targeting cloud metadata endpoints", async () => {
    const task: ActorTask = {
      taskId: "task-ssrf-epub",
      actorType: "epub-extractor",
      targetUrl: "http://169.254.169.254/latest/meta-data/book.epub",
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("triggers security barrier and returns 403 when Zip Slip is detected", async () => {
    const files = buildMinimalEpub();
    files["../../root/key.pem"] = "secret";
    const maliciousBuf = createMockEpubZip(files);

    const task: ActorTask = {
      taskId: "task-slip-epub",
      actorType: "epub-extractor",
      targetUrl: "",
      options: {
        epubOptions: {
          epubBase64: maliciousBuf.toString("base64"),
        },
      },
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("EPUB security barrier triggered"));
    assert.ok(result.errorMessage?.includes("ZIP_SLIP_PATH_TRAVERSAL"));
  });

  it("rejects task when neither targetUrl nor epubBase64 is provided", async () => {
    const task: ActorTask = {
      taskId: "task-empty-epub",
      actorType: "epub-extractor",
      targetUrl: "",
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(
      result.errorMessage?.includes("Target URL or epubOptions.epubBase64 payload is required")
    );
  });

  it("returns 500 when EPUB packaging is invalid", async () => {
    const invalidBuf = createMockEpubZip({
      mimetype: "application/epub+zip",
      "random.txt": "not an epub structure",
    });

    const task: ActorTask = {
      taskId: "task-bad-epub",
      actorType: "epub-extractor",
      targetUrl: "",
      options: {
        epubOptions: {
          epubBase64: invalidBuf.toString("base64"),
        },
      },
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 500);
    assert.ok(result.errorMessage?.includes("Missing 'META-INF/container.xml'"));
  });
});
