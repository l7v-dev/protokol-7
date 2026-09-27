/**
 * Integration test suite for REST endpoints:
 * POST /api/v1/documents, POST /api/v1/archives, POST /api/v1/ocr
 */

import assert from "node:assert";
import type { Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { deflateRawSync } from "node:zlib";
import { createServer } from "../src/core/server";
import { globalOcrRegistry, type IOcrConnector } from "../src/ocr";

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

describe("REST Endpoints - Documents, Archives, and OCR", () => {
  let server: Server;
  let baseUrl: string;

  const mockOcrConnector: IOcrConnector = {
    name: "rest-test-ocr",
    isAvailable: async () => true,
    extract: async (req) => ({
      connectorName: "rest-test-ocr",
      text: `Transcribed text for prompt: ${req.prompt || "default"}`,
      pages: [
        {
          pageNumber: 1,
          text: `Transcribed text for prompt: ${req.prompt || "default"}`,
        },
      ],
      totalCharacters: 40,
      totalWords: 6,
    }),
  };

  before(async () => {
    globalOcrRegistry.register(mockOcrConnector);
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    globalOcrRegistry.unregister("rest-test-ocr");
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe("POST /api/v1/documents", () => {
    it("rejects request when neither targetUrl nor documentBase64 is provided", async () => {
      const res = await fetch(`${baseUrl}/api/v1/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as { code: string };
      assert.strictEqual(json.code, "INVALID_ARGUMENTS");
    });

    it("extracts tabular data from valid CSV payload", async () => {
      const csvData = "id,name,role\n1,Alice,Architect\n2,Bob,Engineer";
      const csvBase64 = Buffer.from(csvData).toString("base64");

      const res = await fetch(`${baseUrl}/api/v1/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentBase64: csvBase64,
          format: "csv",
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as {
        success: boolean;
        data?: {
          format: string;
          records?: Array<{ id: string; name: string }>;
          markdownTable?: string;
        };
      };

      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data?.format, "csv");
      assert.strictEqual(json.data?.records?.length, 2);
      assert.strictEqual(json.data?.records?.[0].name, "Alice");
      assert.ok(json.data?.markdownTable?.includes("Architect"));
    });
  });

  describe("POST /api/v1/archives", () => {
    it("rejects request when neither targetUrl nor archiveBase64 is provided", async () => {
      const res = await fetch(`${baseUrl}/api/v1/archives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as { code: string };
      assert.strictEqual(json.code, "INVALID_ARGUMENTS");
    });

    it("extracts entries from valid ZIP payload", async () => {
      const zipBytes = createMockZip({
        "contract.txt": "Protokol-7 safe archive extraction contract.",
      });
      const zipBase64 = zipBytes.toString("base64");

      const res = await fetch(`${baseUrl}/api/v1/archives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archiveBase64: zipBase64,
          format: "zip",
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as {
        success: boolean;
        data?: {
          format: string;
          totalFiles: number;
          entries?: Array<{ path?: string; name?: string; textPreview?: string }>;
        };
      };

      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data?.format, "zip");
      assert.strictEqual(json.data?.totalFiles, 1);
      assert.strictEqual(json.data?.entries?.[0].path, "contract.txt");
      assert.ok(json.data?.entries?.[0].textPreview?.includes("Protokol-7"));
    });
  });

  describe("POST /api/v1/ocr", () => {
    it("rejects request when imageBase64 is missing", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 400);
      const json = (await res.json()) as { code: string };
      assert.strictEqual(json.code, "INVALID_ARGUMENTS");
    });

    it("executes OCR via preferred connector", async () => {
      const fakeImage = Buffer.from("sample-image").toString("base64");

      const res = await fetch(`${baseUrl}/api/v1/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: fakeImage,
          connector: "rest-test-ocr",
          prompt: "extract invoice tables",
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = (await res.json()) as {
        success: boolean;
        data?: {
          connectorName: string;
          text: string;
          pages: Array<{ pageNumber: number; text: string }>;
        };
      };

      assert.strictEqual(json.success, true);
      assert.strictEqual(json.data?.connectorName, "rest-test-ocr");
      assert.ok(json.data?.text.includes("extract invoice tables"));
      assert.strictEqual(json.data?.pages.length, 1);
    });
  });
});
