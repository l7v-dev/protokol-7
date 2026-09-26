import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PdfAnomalyDetector } from "../src/extractors/pdf-anomaly-detector";

describe("PdfAnomalyDetector - Structural and Text Layer Anomaly Classification", () => {
  it("classifies non-PDF payloads as CORRUPT_PAYLOAD", () => {
    const invalidBuffer = Buffer.from("<html><body>Not a PDF</body></html>");
    const result = PdfAnomalyDetector.detect({
      uint8Data: new Uint8Array(invalidBuffer),
    });

    assert.equal(result.status, "CORRUPT_PAYLOAD");
    assert.equal(result.isAnomaly, true);
    assert.ok(result.reason?.includes("Missing '%PDF-'"));
  });

  it("classifies password-protected parse exceptions as PASSWORD_PROTECTED", () => {
    const pdfHeader = Buffer.from("%PDF-1.7\n%stream\n%%EOF");
    const parseError = new Error("PasswordException: Password required to decrypt document");
    const result = PdfAnomalyDetector.detect({
      uint8Data: new Uint8Array(pdfHeader),
      parseError,
    });

    assert.equal(result.status, "PASSWORD_PROTECTED");
    assert.equal(result.isAnomaly, true);
    assert.equal(result.ocrRecommended, false);
    assert.ok(result.reason?.includes("password"));
  });

  it("identifies scanned raster PDFs with zero text layer as SCANNED_IMAGE_ONLY", () => {
    // Construct mock PDF containing /Subtype /Image
    const scannedPdf = Buffer.from(
      "%PDF-1.5\n1 0 obj\n<< /Type /XObject /Subtype /Image /Width 800 /Height 600 /Filter /DCTDecode >>\nstream\n...binary...\nendstream\nendobj\n%%EOF"
    );

    const result = PdfAnomalyDetector.detect({
      uint8Data: new Uint8Array(scannedPdf),
      totalPages: 1,
      rawPageTexts: [""],
    });

    assert.equal(result.status, "SCANNED_IMAGE_ONLY");
    assert.equal(result.isAnomaly, true);
    assert.equal(result.ocrRecommended, true);
    assert.equal(result.averageCharsPerPage, 0);
    assert.ok((result.detectedImageCount || 0) > 0);
  });

  it("identifies scanned raster PDFs with critically low text density as SCANNED_IMAGE_ONLY", () => {
    const scannedPdfWithFooter = Buffer.from(
      "%PDF-1.5\n<< /Type /XObject /Subtype /Image >>\nstream\n...data...\nendstream\n%%EOF"
    );

    const result = PdfAnomalyDetector.detect({
      uint8Data: new Uint8Array(scannedPdfWithFooter),
      totalPages: 2,
      rawPageTexts: ["Page 1", "P. 2"], // Avg 5 chars/page, below threshold of 15
    });

    assert.equal(result.status, "SCANNED_IMAGE_ONLY");
    assert.equal(result.isAnomaly, true);
    assert.equal(result.ocrRecommended, true);
    assert.ok(result.averageCharsPerPage < 15);
  });

  it("identifies documents with empty text layer without raster images as EMPTY_TEXT_LAYER", () => {
    const emptyPdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");

    const result = PdfAnomalyDetector.detect({
      uint8Data: new Uint8Array(emptyPdf),
      totalPages: 1,
      rawPageTexts: [""],
    });

    assert.equal(result.status, "EMPTY_TEXT_LAYER");
    assert.equal(result.isAnomaly, true);
    assert.equal(result.ocrRecommended, false);
  });

  it("detects high font encoding corruption as ENCODING_ERROR", () => {
    const corruptedFontPdf = Buffer.from("%PDF-1.4\n...font-corrupted...\n%%EOF");
    // 50% replacement characters
    const corruptedText =
      "Valid text \uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD\uFFFD";

    const result = PdfAnomalyDetector.detect({
      uint8Data: new Uint8Array(corruptedFontPdf),
      totalPages: 1,
      rawPageTexts: [corruptedText],
    });

    assert.equal(result.status, "ENCODING_ERROR");
    assert.equal(result.isAnomaly, true);
    assert.equal(result.ocrRecommended, true);
  });

  it("passes healthy textual documents as EXTRACTABLE without anomaly", () => {
    const validPdf = Buffer.from("%PDF-1.7\n<< /Type /Catalog >>\n%%EOF");
    const samplePageText =
      "This is a standard academic publication article text with paragraphs, citations, and comprehensive documentation.";

    const result = PdfAnomalyDetector.detect({
      uint8Data: new Uint8Array(validPdf),
      totalPages: 1,
      rawPageTexts: [samplePageText],
    });

    assert.equal(result.status, "EXTRACTABLE");
    assert.equal(result.isAnomaly, false);
    assert.equal(result.ocrRecommended, false);
    assert.ok(result.averageCharsPerPage > 50);
  });
});
