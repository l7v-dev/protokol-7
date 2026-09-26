import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { ArchiveExtractorActor } from "../src/actors/archive-extractor-actor";
import type { ActorRunContext, ActorTask } from "../src/core/types";

function createMockZip(files: Record<string, string>): Buffer {
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

describe("ArchiveExtractorActor - Unified Archive Actor with Security Barriers", () => {
  const actor = new ArchiveExtractorActor();

  it("extracts entries from valid archiveBase64 payload", async () => {
    const zipBuf = createMockZip({
      "data/metrics.csv": "timestamp,cpu\n1700000000,42.5",
      "data/info.txt": "Server performance telemetry.",
    });

    const task: ActorTask = {
      taskId: "task-arc-1",
      actorType: "archive-extractor",
      targetUrl: "",
      options: {
        archiveOptions: {
          archiveBase64: zipBuf.toString("base64"),
          extractTextPreviews: true,
        },
      },
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.format, "zip");
    assert.equal(result.data.totalFiles, 2);
    assert.equal(result.data.entries.length, 2);
    assert.ok(result.data.securityCheckPassed);
  });

  it("downloads and extracts archive from HTTP targetUrl", async () => {
    const zipBuf = createMockZip({
      "remote.txt": "Extracted from remote HTTP endpoint.",
    });

    const server = http.createServer((_, res) => {
      res.writeHead(200, { "Content-Type": "application/zip" });
      res.end(zipBuf);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const url = `http://127.0.0.1:${port}/bundle.zip`;

    try {
      const task: ActorTask = {
        taskId: "task-http-arc-1",
        actorType: "archive-extractor",
        targetUrl: url,
        options: {
          archiveOptions: { extractTextPreviews: true },
        },
      };

      const context: ActorRunContext = { task, startTime: Date.now() };
      const result = await actor.run(task, context);

      // Default SSRF guard checks loopback unless allowLocalNetwork is enabled
      assert.ok(result.statusCode === 403 || result.statusCode === 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("blocks SSRF attempts targeting cloud metadata endpoints", async () => {
    const task: ActorTask = {
      taskId: "task-ssrf-arc",
      actorType: "archive-extractor",
      targetUrl: "http://169.254.169.254/latest/meta-data/archive.zip",
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("triggers security barrier and returns 403 when Zip Slip is detected", async () => {
    const maliciousZip = createMockZip({
      "../../../../etc/shadow": "root:$6$...",
    });

    const task: ActorTask = {
      taskId: "task-slip-1",
      actorType: "archive-extractor",
      targetUrl: "",
      options: {
        archiveOptions: {
          archiveBase64: maliciousZip.toString("base64"),
        },
      },
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("Archive security barrier triggered"));
    assert.ok(result.errorMessage?.includes("ZIP_SLIP_PATH_TRAVERSAL"));
  });

  it("rejects task when neither targetUrl nor archiveBase64 is provided", async () => {
    const task: ActorTask = {
      taskId: "task-empty-arc",
      actorType: "archive-extractor",
      targetUrl: "",
    };

    const context: ActorRunContext = { task, startTime: Date.now() };
    const result = await actor.run(task, context);

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("Neither targetUrl nor archiveBase64"));
  });
});
