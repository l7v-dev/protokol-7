/**
 * Text Normalizer Processor.
 * Applies Unicode NFKC normalization, whitespace canonicalization,
 * control character filtration, and cryptographic lineage tracking.
 */

import { createHash } from "node:crypto";

export interface NormalizerOptions {
  nfkc?: boolean;
  stripControlChars?: boolean;
  stripZeroWidth?: boolean;
  collapseWhitespace?: boolean;
  maxConsecutiveNewlines?: number;
  contentFieldNames?: string[];
}

export interface NormalizedItemResult<T = Record<string, unknown>> {
  item: T;
  rawSha256: string;
  normalizedSha256: string;
  charCountOriginal: number;
  charCountNormalized: number;
}

const DEFAULT_OPTIONS: Required<NormalizerOptions> = {
  nfkc: true,
  stripControlChars: true,
  stripZeroWidth: true,
  collapseWhitespace: true,
  maxConsecutiveNewlines: 2,
  contentFieldNames: ["content", "markdown", "text", "body", "rawContent"],
};

export class TextNormalizer {
  private readonly options: Required<NormalizerOptions>;

  constructor(options?: NormalizerOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Normalizes a single string using configured normalization policy.
   */
  normalize(text: string): string {
    if (!text || typeof text !== "string") {
      return "";
    }

    let result = text;

    // 1. Unicode NFKC normalization
    if (this.options.nfkc) {
      result = result.normalize("NFKC");
    }

    // 2. Strip zero-width and invisible control characters
    if (this.options.stripZeroWidth) {
      result = result.replace(/[\u200B-\u200D\uFEFF\u2060\u00A0]/g, (match) => {
        return match === "\u00A0" ? " " : "";
      });
    }

    // 3. Strip ASCII control characters except \t (0x09), \n (0x0A) and \r (0x0D)
    if (this.options.stripControlChars) {
      let cleaned = "";
      for (let i = 0; i < result.length; i++) {
        const code = result.charCodeAt(i);
        if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
          cleaned += result[i];
        }
      }
      result = cleaned;
    }

    // 4. Line ending normalization: CRLF / CR -> LF
    result = result.replace(/\r\n|\r/g, "\n");

    // 5. Horizontal whitespace canonicalization per line
    if (this.options.collapseWhitespace) {
      // Replace tabs or multiple spaces within lines with a single space
      result = result
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n");
    }

    // 6. Collapse excessive consecutive blank lines
    if (this.options.maxConsecutiveNewlines > 0) {
      const maxLfs = this.options.maxConsecutiveNewlines + 1;
      const regex = new RegExp(`\\n{${maxLfs},}`, "g");
      const replacement = "\n".repeat(maxLfs);
      result = result.replace(regex, replacement);
    }

    return result.trim();
  }

  /**
   * Processes a document item, normalizing candidate content fields and attaching SHA-256 lineage.
   */
  processItem<T extends Record<string, unknown>>(item: T): NormalizedItemResult<T> {
    const cloned = { ...item } as Record<string, unknown>;

    // Locate primary content field
    let primaryField: string | undefined;
    for (const field of this.options.contentFieldNames) {
      if (typeof cloned[field] === "string" && cloned[field]) {
        primaryField = field;
        break;
      }
    }

    if (!primaryField) {
      const rawJson = JSON.stringify(item);
      const hash = createHash("sha256").update(rawJson).digest("hex");
      return {
        item,
        rawSha256: hash,
        normalizedSha256: hash,
        charCountOriginal: rawJson.length,
        charCountNormalized: rawJson.length,
      };
    }

    const originalText = cloned[primaryField] as string;
    const normalizedText = this.normalize(originalText);

    const rawSha256 = createHash("sha256").update(originalText, "utf8").digest("hex");
    const normalizedSha256 = createHash("sha256").update(normalizedText, "utf8").digest("hex");

    cloned[primaryField] = normalizedText;
    cloned.raw_sha256 = rawSha256;
    cloned.normalized_sha256 = normalizedSha256;

    return {
      item: cloned as T,
      rawSha256,
      normalizedSha256,
      charCountOriginal: originalText.length,
      charCountNormalized: normalizedText.length,
    };
  }

  /**
   * Batch processes a stream or array of items.
   */
  processBatch<T extends Record<string, unknown>>(items: T[]): T[] {
    return items.map((item) => this.processItem(item).item);
  }
}
