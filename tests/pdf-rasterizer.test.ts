/**
 * Integration and unit tests for PdfRasterizer.
 */

import assert from "node:assert";
import { after, describe, it } from "node:test";
import { BrowserPool } from "../src/browser/browser-pool";
import { PdfRasterizer } from "../src/ocr/pdf-rasterizer";

describe("PdfRasterizer", () => {
  after(async () => {
    await BrowserPool.shutdown();
  });
  // Minimal valid PDF with 1 page
  const samplePdf = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>\nendobj\n" +
      "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n" +
      "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n188\n%%EOF"
  );

  it("extracts embedded images returning empty array when none exist", async () => {
    const images = await PdfRasterizer.extractEmbeddedImages(samplePdf, 1);
    assert.ok(Array.isArray(images));
    assert.strictEqual(images.length, 0);
  });

  it("rasterizes a PDF page to a valid PNG buffer via Chromium canvas", async () => {
    const pngBuffer = await PdfRasterizer.rasterizePage(samplePdf, 1, 1.0, 20000);

    assert.ok(Buffer.isBuffer(pngBuffer));
    assert.ok(pngBuffer.length > 100);

    // Verify PNG magic bytes (\x89PNG\r\n\x1a\n)
    assert.strictEqual(pngBuffer[0], 0x89);
    assert.strictEqual(pngBuffer[1], 0x50); // 'P'
    assert.strictEqual(pngBuffer[2], 0x4e); // 'N'
    assert.strictEqual(pngBuffer[3], 0x47); // 'G'
  });

  it("rasterizes all pages respecting maxPages option", async () => {
    const pages = await PdfRasterizer.rasterizeAllPages(samplePdf, {
      maxPages: 1,
      scale: 1.0,
      timeoutMs: 20000,
    });

    assert.strictEqual(pages.length, 1);
    assert.ok(Buffer.isBuffer(pages[0]));
    assert.strictEqual(pages[0][0], 0x89);
    assert.strictEqual(pages[0][1], 0x50);
  });
});
