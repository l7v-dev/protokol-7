/**
 * Unit test suite for OCR connectors and OcrConnectorRegistry.
 */

import assert from "node:assert";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  CloudVisionOcrConnector,
  GenericHttpOcrConnector,
  type IOcrConnector,
  LocalLlmVisionOcrConnector,
  LocalTesseractOcrConnector,
  MistralOcrConnector,
  NoAvailableOcrConnectorError,
  OcrConnectorRegistry,
} from "../src/ocr";

describe("OCR Subsystem - Connectors and Registry", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("LocalLlmVisionOcrConnector", () => {
    it("initializes with default options for Ollama endpoint", () => {
      const connector = new LocalLlmVisionOcrConnector({
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.2-vision",
      });
      assert.strictEqual(connector.name, "local-llm");
    });

    it("detects availability when ping endpoint responds with 200 OK", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ models: [{ name: "llama3.2-vision" }] }), {
          status: 200,
        });

      const connector = new LocalLlmVisionOcrConnector({
        endpoint: "http://127.0.0.1:11434",
      });

      const available = await connector.isAvailable();
      assert.strictEqual(available, true);
    });

    it("detects unavailablility when endpoint throws connection error", async () => {
      globalThis.fetch = async () => {
        throw new Error("ECONNREFUSED");
      };

      const connector = new LocalLlmVisionOcrConnector({
        endpoint: "http://127.0.0.1:11434",
      });

      const available = await connector.isAvailable();
      assert.strictEqual(available, false);
    });

    it("extracts text via Ollama chat API format", async () => {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.strictEqual(body.model, "llama3.2-vision");
        assert.ok(Array.isArray(body.messages));
        assert.ok(body.messages[0].images.length > 0);

        return new Response(
          JSON.stringify({
            message: {
              content: "# INVOICE\n\nTotal Due: $1,250.00\nDate: 2026-09-26",
            },
          }),
          { status: 200 }
        );
      };

      const connector = new LocalLlmVisionOcrConnector({
        endpoint: "http://127.0.0.1:11434",
        model: "llama3.2-vision",
      });

      const fakeImage = Buffer.from("fake-png-binary");
      const result = await connector.extract({ imageBuffer: fakeImage });

      assert.strictEqual(result.connectorName, "local-llm");
      assert.ok(result.text.includes("INVOICE"));
      assert.ok(result.text.includes("$1,250.00"));
      assert.strictEqual(result.pages.length, 1);
      assert.ok(result.totalCharacters > 0);
      assert.ok(result.totalWords > 0);
    });

    it("extracts text via OpenAI-compatible vision format", async () => {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init?.body as string);
        assert.strictEqual(body.model, "qwen2.5-vl");
        assert.strictEqual(body.messages[0].content[1].type, "image_url");

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Scanned document text from local vLLM.",
                },
              },
            ],
          }),
          { status: 200 }
        );
      };

      const connector = new LocalLlmVisionOcrConnector({
        endpoint: "http://127.0.0.1:8000",
        model: "qwen2.5-vl",
        apiType: "openai-compatible",
      });

      const result = await connector.extract({
        imageBase64: "data:image/png;base64,ZmFrZQ==",
      });

      assert.strictEqual(result.connectorName, "local-llm");
      assert.strictEqual(result.text, "Scanned document text from local vLLM.");
      assert.strictEqual(result.pages[0].pageNumber, 1);
    });

    it("throws error when neither imageBuffer nor imageBase64 is provided", async () => {
      const connector = new LocalLlmVisionOcrConnector();
      await assert.rejects(
        async () => connector.extract({}),
        /requires either imageBuffer or imageBase64/
      );
    });
  });

  describe("CloudVisionOcrConnector", () => {
    it("reports availability based on API key presence", async () => {
      const withKey = new CloudVisionOcrConnector({ apiKey: "test-vision-key" });
      assert.strictEqual(await withKey.isAvailable(), true);

      const oldKey = process.env.GOOGLE_VISION_API_KEY;
      delete process.env.GOOGLE_VISION_API_KEY;
      const withoutKey = new CloudVisionOcrConnector();
      assert.strictEqual(await withoutKey.isAvailable(), false);
      if (oldKey) process.env.GOOGLE_VISION_API_KEY = oldKey;
    });

    it("extracts text using DOCUMENT_TEXT_DETECTION structure", async () => {
      globalThis.fetch = async (url) => {
        assert.ok(String(url).includes("key=test-vision-key"));
        return new Response(
          JSON.stringify({
            responses: [
              {
                fullTextAnnotation: {
                  text: "Line 1: Account Overview\nLine 2: Balance 5000",
                },
                textAnnotations: [{ confidence: 0.98 }],
              },
            ],
          }),
          { status: 200 }
        );
      };

      const connector = new CloudVisionOcrConnector({ apiKey: "test-vision-key" });
      const result = await connector.extract({
        imageBuffer: Buffer.from("image-bytes"),
      });

      assert.strictEqual(result.connectorName, "cloud-vision");
      assert.ok(result.text.includes("Account Overview"));
      assert.strictEqual(result.metadata?.confidence, 0.98);
    });
  });

  describe("MistralOcrConnector", () => {
    it("reports availability based on API key presence", async () => {
      const withKey = new MistralOcrConnector({ apiKey: "test-mistral-key" });
      assert.strictEqual(await withKey.isAvailable(), true);
    });

    it("extracts markdown pages from Mistral OCR response", async () => {
      globalThis.fetch = async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        assert.strictEqual(headers.Authorization, "Bearer test-mistral-key");

        return new Response(
          JSON.stringify({
            pages: [
              { index: 0, markdown: "## Table of Contents\n1. Introduction" },
              { index: 1, markdown: "### Chapter 1\nBody text." },
            ],
          }),
          { status: 200 }
        );
      };

      const connector = new MistralOcrConnector({ apiKey: "test-mistral-key" });
      const result = await connector.extract({
        imageBuffer: Buffer.from("fake-buffer"),
      });

      assert.strictEqual(result.connectorName, "mistral");
      assert.strictEqual(result.pages.length, 2);
      assert.strictEqual(result.pages[0].pageNumber, 1);
      assert.strictEqual(result.pages[1].pageNumber, 2);
      assert.ok(result.text.includes("Table of Contents"));
      assert.ok(result.text.includes("Chapter 1"));
    });
  });

  describe("GenericHttpOcrConnector", () => {
    it("reports available if endpoint is configured", async () => {
      const connector = new GenericHttpOcrConnector({
        endpoint: "https://ocr.example.internal/api/v1/extract",
      });
      assert.strictEqual(await connector.isAvailable(), true);
    });

    it("extracts text and resolves nested json path", async () => {
      globalThis.fetch = async (_url, init) => {
        const headers = init?.headers as Record<string, string>;
        assert.strictEqual(headers.Authorization, "Bearer custom-key");

        return new Response(
          JSON.stringify({
            data: {
              extractedText: "Proprietary internal document text.",
            },
          }),
          { status: 200 }
        );
      };

      const connector = new GenericHttpOcrConnector({
        endpoint: "https://ocr.example.internal/api/v1/extract",
        apiKey: "custom-key",
        textJsonPath: "data.extractedText",
      });

      const result = await connector.extract({
        imageBuffer: Buffer.from("custom-image"),
      });

      assert.strictEqual(result.connectorName, "generic-http");
      assert.strictEqual(result.text, "Proprietary internal document text.");
    });
  });

  describe("LocalTesseractOcrConnector", () => {
    it("initializes with tesseract binary configuration", () => {
      const connector = new LocalTesseractOcrConnector({
        binaryPath: "non-existent-tesseract",
      });
      assert.strictEqual(connector.name, "tesseract");
    });

    it("reports unavailable if binary does not exist on PATH", async () => {
      const connector = new LocalTesseractOcrConnector({
        binaryPath: "/path/to/missing/tesseract",
      });
      const available = await connector.isAvailable();
      assert.strictEqual(available, false);
    });
  });

  describe("OcrConnectorRegistry", () => {
    let registry: OcrConnectorRegistry;

    beforeEach(() => {
      registry = new OcrConnectorRegistry();
    });

    it("contains all 5 default connectors on instantiation", () => {
      const list = registry.list();
      assert.ok(list.includes("local-llm"));
      assert.ok(list.includes("cloud-vision"));
      assert.ok(list.includes("mistral"));
      assert.ok(list.includes("tesseract"));
      assert.ok(list.includes("generic-http"));
    });

    it("allows registering and unregistering custom connectors", () => {
      const mockConnector: IOcrConnector = {
        name: "mock-custom-ocr",
        isAvailable: async () => true,
        extract: async () => ({
          connectorName: "mock-custom-ocr",
          text: "Mock text",
          pages: [{ pageNumber: 1, text: "Mock text" }],
          totalCharacters: 9,
          totalWords: 2,
        }),
      };

      registry.register(mockConnector);
      assert.strictEqual(registry.get("mock-custom-ocr"), mockConnector);

      const unregistered = registry.unregister("mock-custom-ocr");
      assert.strictEqual(unregistered, true);
      assert.strictEqual(registry.get("mock-custom-ocr"), undefined);
    });

    it("executes preferred connector when specified and available", async () => {
      const mockA: IOcrConnector = {
        name: "connector-a",
        isAvailable: async () => true,
        extract: async () => ({
          connectorName: "connector-a",
          text: "Output from A",
          pages: [{ pageNumber: 1, text: "Output from A" }],
          totalCharacters: 13,
          totalWords: 3,
        }),
      };

      const mockB: IOcrConnector = {
        name: "connector-b",
        isAvailable: async () => true,
        extract: async () => ({
          connectorName: "connector-b",
          text: "Output from B",
          pages: [{ pageNumber: 1, text: "Output from B" }],
          totalCharacters: 13,
          totalWords: 3,
        }),
      };

      registry.register(mockA);
      registry.register(mockB);

      const res = await registry.executeOcr({ imageBuffer: Buffer.from("test") }, "connector-b");
      assert.strictEqual(res.connectorName, "connector-b");
      assert.strictEqual(res.text, "Output from B");
    });

    it("falls back to next candidate when first connector fails", async () => {
      const customRegistry = new OcrConnectorRegistry();
      // Remove all default connectors for test isolation
      for (const name of customRegistry.list()) {
        customRegistry.unregister(name);
      }

      const failingConnector: IOcrConnector = {
        name: "local-llm",
        isAvailable: async () => true,
        extract: async () => {
          throw new Error("Local model out of memory");
        },
      };

      const fallbackConnector: IOcrConnector = {
        name: "cloud-vision",
        isAvailable: async () => true,
        extract: async () => ({
          connectorName: "cloud-vision",
          text: "Recovered via cloud fallback.",
          pages: [{ pageNumber: 1, text: "Recovered via cloud fallback." }],
          totalCharacters: 29,
          totalWords: 4,
        }),
      };

      customRegistry.register(failingConnector);
      customRegistry.register(fallbackConnector);

      const result = await customRegistry.executeOcr(
        { imageBuffer: Buffer.from("test") },
        "local-llm"
      );

      assert.strictEqual(result.connectorName, "cloud-vision");
      assert.strictEqual(result.text, "Recovered via cloud fallback.");
    });

    it("throws NoAvailableOcrConnectorError when all candidates fail", async () => {
      const customRegistry = new OcrConnectorRegistry();
      for (const name of customRegistry.list()) {
        customRegistry.unregister(name);
      }

      await assert.rejects(
        async () => customRegistry.executeOcr({ imageBuffer: Buffer.from("test") }),
        NoAvailableOcrConnectorError
      );
    });

    it("orchestrates multi-page OCR across page buffers", async () => {
      const customRegistry = new OcrConnectorRegistry();
      for (const name of customRegistry.list()) {
        customRegistry.unregister(name);
      }

      let callCount = 0;
      const mockConnector: IOcrConnector = {
        name: "paged-ocr",
        isAvailable: async () => true,
        extract: async () => {
          callCount++;
          return {
            connectorName: "paged-ocr",
            text: `Page content ${callCount}`,
            pages: [{ pageNumber: callCount, text: `Page content ${callCount}` }],
            totalCharacters: 14,
            totalWords: 3,
          };
        },
      };

      customRegistry.register(mockConnector);

      const pages = [Buffer.from("page-1"), Buffer.from("page-2"), Buffer.from("page-3")];
      const multiResult = await customRegistry.executeMultiPageOcr(pages, "paged-ocr");

      assert.strictEqual(multiResult.connectorName, "paged-ocr");
      assert.strictEqual(multiResult.pages.length, 3);
      assert.strictEqual(multiResult.pages[0].pageNumber, 1);
      assert.strictEqual(multiResult.pages[1].pageNumber, 2);
      assert.strictEqual(multiResult.pages[2].pageNumber, 3);
      assert.ok(multiResult.text.includes("Page content 1"));
      assert.ok(multiResult.text.includes("Page content 3"));
    });
  });
});
