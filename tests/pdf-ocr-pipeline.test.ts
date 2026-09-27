/**
 * Integration test suite for PdfDocumentActor with OCR fallback pipeline.
 */

import assert from "node:assert";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { PdfDocumentActor } from "../src/actors/pdf-document-actor";
import { BrowserPool } from "../src/browser/browser-pool";
import type { ActorTask } from "../src/core/types";
import { globalOcrRegistry, type IOcrConnector } from "../src/ocr";

describe("PdfDocumentActor with OCR Fallback Pipeline", () => {
  after(async () => {
    await BrowserPool.shutdown();
  });
  // Scanned PDF with /Subtype /Image and empty text layer
  const scannedPdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /XObject << /Im0 4 0 R >> >> >>\nendobj\n" +
      "4 0 obj\n<< /Type /XObject /Subtype /Image /Width 100 /Height 100 /ColorSpace /DeviceRGB /BitsPerComponent 8 >>\nstream\n" +
      "\x00".repeat(100) +
      "\nendstream\nendobj\n" +
      "xref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000220 00000 n \n" +
      "trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n340\n%%EOF"
  );

  const mockOcrConnector: IOcrConnector = {
    name: "mock-test-ocr",
    isAvailable: async () => true,
    extract: async () => ({
      connectorName: "mock-test-ocr",
      text: "# SCANNED CONTRACT\n\nParties: Party A and Party B\nStatus: Active",
      pages: [
        {
          pageNumber: 1,
          text: "# SCANNED CONTRACT\n\nParties: Party A and Party B\nStatus: Active",
        },
      ],
      totalCharacters: 60,
      totalWords: 10,
    }),
  };

  beforeEach(() => {
    globalOcrRegistry.register(mockOcrConnector);
  });

  afterEach(() => {
    globalOcrRegistry.unregister("mock-test-ocr");
  });

  it("retains anomaly and quarantine when enableOcrFallback is false", async () => {
    const actor = new PdfDocumentActor();
    const task: ActorTask = {
      taskId: "task-no-ocr",
      actorType: "pdf-document",
      targetUrl: "file://scanned.pdf",
      options: {
        pdfOptions: {
          pdfBase64: scannedPdf.toString("base64"),
          quarantineOnAnomaly: true,
          enableOcrFallback: false,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.statusCode, 200);
    assert.ok(result.data?.anomaly?.isAnomaly);
    assert.strictEqual(result.data?.anomaly?.ocrRecommended, true);
    assert.strictEqual(result.data?.quarantined, true);
    assert.strictEqual(result.data?.ocrApplied, false);
  });

  it("automatically recovers scanned PDF via OCR fallback when enableOcrFallback is true", async () => {
    const actor = new PdfDocumentActor();
    const task: ActorTask = {
      taskId: "task-with-ocr",
      actorType: "pdf-document",
      targetUrl: "file://scanned.pdf",
      options: {
        pdfOptions: {
          pdfBase64: scannedPdf.toString("base64"),
          quarantineOnAnomaly: true,
          enableOcrFallback: true,
          ocrConnector: "mock-test-ocr",
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.strictEqual(result.status, "completed");
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.data?.ocrApplied, true);
    assert.strictEqual(result.data?.ocrConnectorUsed, "mock-test-ocr");
    assert.strictEqual(result.data?.quarantined, false);
    assert.strictEqual(result.data?.anomaly?.status, "EXTRACTABLE");
    assert.strictEqual(result.data?.anomaly?.isAnomaly, false);
    assert.ok(result.data?.fullText.includes("SCANNED CONTRACT"));
    assert.ok(result.data?.fullText.includes("Parties: Party A and Party B"));
    assert.strictEqual(result.data?.pages.length, 1);
    assert.ok((result.data?.totalCharacters || 0) > 0);
  });
});
