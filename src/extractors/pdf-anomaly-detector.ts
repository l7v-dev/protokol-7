import type { PdfDocumentAnomalyInfo } from "../core/types";

export interface PdfAnalysisInput {
  uint8Data: Uint8Array;
  totalPages?: number;
  rawPageTexts?: string[];
  parseError?: Error;
}

export class PdfAnomalyDetector {
  private static readonly PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  private static readonly MIN_CHARS_PER_PAGE_THRESHOLD = 15;
  private static readonly GLYPH_CORRUPTION_RATIO_THRESHOLD = 0.3;

  /**
   * Analyzes PDF binary content and extraction outputs to identify structural
   * defects, encryption barriers, or scanned image documents lacking text layers.
   */
  public static detect(input: PdfAnalysisInput): PdfDocumentAnomalyInfo {
    const { uint8Data, totalPages = 0, rawPageTexts = [], parseError } = input;

    // 1. Verify Magic Byte Signature
    if (!PdfAnomalyDetector.hasPdfMagicBytes(uint8Data)) {
      return {
        status: "CORRUPT_PAYLOAD",
        isAnomaly: true,
        reason: "Invalid binary payload: Missing '%PDF-' header signature.",
        averageCharsPerPage: 0,
        ocrRecommended: false,
      };
    }

    // 2. Parse Error Inspection
    if (parseError) {
      const errMsg = (parseError.message || "").toLowerCase();
      if (
        errMsg.includes("password") ||
        errMsg.includes("encrypt") ||
        parseError.name === "PasswordException"
      ) {
        return {
          status: "PASSWORD_PROTECTED",
          isAnomaly: true,
          reason: "Document is password protected or encrypted.",
          averageCharsPerPage: 0,
          ocrRecommended: false,
        };
      }

      if (
        errMsg.includes("font") ||
        errMsg.includes("encoding") ||
        errMsg.includes("cmap") ||
        errMsg.includes("glyph")
      ) {
        return {
          status: "ENCODING_ERROR",
          isAnomaly: true,
          reason: `Font encoding failure: ${parseError.message}`,
          averageCharsPerPage: 0,
          ocrRecommended: true,
        };
      }

      return {
        status: "CORRUPT_PAYLOAD",
        isAnomaly: true,
        reason: `PDF structural parse error: ${parseError.message}`,
        averageCharsPerPage: 0,
        ocrRecommended: false,
      };
    }

    // 3. Inspect Page Content Metrics
    if (totalPages === 0 && rawPageTexts.length === 0) {
      return {
        status: "CORRUPT_PAYLOAD",
        isAnomaly: true,
        reason: "Document reports 0 total pages or contains no extractable objects.",
        averageCharsPerPage: 0,
        ocrRecommended: false,
      };
    }

    const pagesToAnalyze = rawPageTexts.length > 0 ? rawPageTexts : [];
    const pageCount = totalPages > 0 ? totalPages : pagesToAnalyze.length;

    let totalCleanChars = 0;
    let replacementGlyphCount = 0;

    for (const text of pagesToAnalyze) {
      const trimmed = text.trim();
      totalCleanChars += trimmed.length;

      // Count replacement characters (\uFFFD) and control characters
      for (let i = 0; i < trimmed.length; i++) {
        const code = trimmed.charCodeAt(i);
        if (code === 0xfffd || (code < 32 && code !== 9 && code !== 10 && code !== 13)) {
          replacementGlyphCount++;
        }
      }
    }

    const averageCharsPerPage = pageCount > 0 ? totalCleanChars / pageCount : 0;

    // 4. Encoding Glitch Ratio
    if (totalCleanChars > 20) {
      const corruptionRatio = replacementGlyphCount / totalCleanChars;
      if (corruptionRatio >= PdfAnomalyDetector.GLYPH_CORRUPTION_RATIO_THRESHOLD) {
        return {
          status: "ENCODING_ERROR",
          isAnomaly: true,
          reason: `High ratio (${Math.round(corruptionRatio * 100)}%) of unmapped or replacement Unicode glyphs detected in text layer.`,
          averageCharsPerPage,
          ocrRecommended: true,
        };
      }
    }

    // 5. Detect Scanned Raster Imagery
    const imageInfo = PdfAnomalyDetector.detectRasterImagePresence(uint8Data);

    if (totalCleanChars === 0) {
      if (imageInfo.hasImages) {
        return {
          status: "SCANNED_IMAGE_ONLY",
          isAnomaly: true,
          reason: `Document contains ${imageInfo.estimatedImageCount} raster image objects but zero extractable text (scanned document).`,
          averageCharsPerPage: 0,
          ocrRecommended: true,
          detectedImageCount: imageInfo.estimatedImageCount,
        };
      }

      return {
        status: "EMPTY_TEXT_LAYER",
        isAnomaly: true,
        reason: "Document text layer contains zero characters.",
        averageCharsPerPage: 0,
        ocrRecommended: false,
      };
    }

    if (averageCharsPerPage < PdfAnomalyDetector.MIN_CHARS_PER_PAGE_THRESHOLD) {
      if (imageInfo.hasImages) {
        return {
          status: "SCANNED_IMAGE_ONLY",
          isAnomaly: true,
          reason: `Critically low text density (${averageCharsPerPage.toFixed(1)} chars/page) with embedded raster images detected (scanned document).`,
          averageCharsPerPage,
          ocrRecommended: true,
          detectedImageCount: imageInfo.estimatedImageCount,
        };
      }

      return {
        status: "EMPTY_TEXT_LAYER",
        isAnomaly: true,
        reason: `Low text density (${averageCharsPerPage.toFixed(1)} chars/page) without significant textual content.`,
        averageCharsPerPage,
        ocrRecommended: false,
      };
    }

    // 6. Healthy Extractable Document
    return {
      status: "EXTRACTABLE",
      isAnomaly: false,
      averageCharsPerPage,
      ocrRecommended: false,
      detectedImageCount: imageInfo.estimatedImageCount,
    };
  }

  private static hasPdfMagicBytes(data: Uint8Array): boolean {
    if (data.length < 5) return false;
    for (let i = 0; i < PdfAnomalyDetector.PDF_MAGIC.length; i++) {
      if (data[i] !== PdfAnomalyDetector.PDF_MAGIC[i]) {
        return false;
      }
    }
    return true;
  }

  private static detectRasterImagePresence(data: Uint8Array): {
    hasImages: boolean;
    estimatedImageCount: number;
  } {
    // Scan PDF stream buffer for common PDF image object tokens
    // /Subtype /Image or /Filter /DCTDecode (JPEG) or /JPXDecode (JPEG 2000) or /FlateDecode (PNG/raster)
    const textChunk = Buffer.from(data.slice(0, Math.min(data.length, 500_000))).toString("latin1");

    let count = 0;
    const matchesImage = textChunk.match(/\/Subtype\s*\/Image/g);
    if (matchesImage) {
      count += matchesImage.length;
    }

    const matchesDct = textChunk.match(/\/Filter\s*\/DCTDecode/g);
    if (matchesDct && count === 0) {
      count += matchesDct.length;
    }

    return {
      hasImages: count > 0,
      estimatedImageCount: count,
    };
  }
}
