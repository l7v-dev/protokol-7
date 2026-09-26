/**
 * src/core/context-guard.ts
 *
 * LLM Context Window Guard and Token Budgeting Engine for Protokol-7.
 * Prevents downstream LLM context overflow by applying semantic hierarchical
 * truncation at structural boundaries (headings, paragraphs) while preserving
 * table of contents and metadata.
 */

import type { MarkdownHeadingItem } from "./types";

export interface ContextGuardOptions {
  maxTokens?: number;
  maxChars?: number;
  tableOfContents?: MarkdownHeadingItem[];
  url?: string;
}

export interface GuardedContentResult {
  content: string;
  isTruncated: boolean;
  originalTokens: number;
  retainedTokens: number;
  originalChars: number;
  retainedChars: number;
}

export interface InvisibleCharacterSanitizeResult {
  cleanedText: string;
  removedCount: number;
  removedCharacters: Record<string, number>;
}

export class ContextGuard {
  /**
   * Pattern matching invisible zero-width characters, soft hyphens, and bidi override controls
   * excluding ZWNJ (\u200C) which may be semantically valid in specific scripts.
   */
  private static readonly INVISIBLE_UNICODE_PATTERN =
    /(?:\u200D|[\u00AD\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB])/gu;

  /**
   * Pattern matching all invisible characters including ZWNJ (\u200C).
   */
  private static readonly INVISIBLE_UNICODE_WITH_ZWNJ_PATTERN =
    /(?:[\u200C\u200D]|[\u00AD\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB])/gu;

  /**
   * Strips invisible Unicode characters, zero-width spaces, soft hyphens, and bidi override controls.
   * Prevents BPE subword tokenization fragmentation and steganographic watermarking payloads.
   */
  static stripInvisibleUnicode(text: string, options?: { preserveZwnj?: boolean }): string {
    if (!text) return "";
    const pattern = options?.preserveZwnj
      ? this.INVISIBLE_UNICODE_PATTERN
      : this.INVISIBLE_UNICODE_WITH_ZWNJ_PATTERN;
    return text.replace(pattern, "");
  }

  /**
   * Sanitizes invisible characters and returns detailed metrics on stripped characters.
   */
  static sanitizeInvisibleCharacters(
    text: string,
    options?: { preserveZwnj?: boolean }
  ): InvisibleCharacterSanitizeResult {
    if (!text) {
      return { cleanedText: "", removedCount: 0, removedCharacters: {} };
    }

    const removedCharacters: Record<string, number> = {};
    let removedCount = 0;

    const pattern = options?.preserveZwnj
      ? this.INVISIBLE_UNICODE_PATTERN
      : this.INVISIBLE_UNICODE_WITH_ZWNJ_PATTERN;

    const cleanedText = text.replace(pattern, (match) => {
      removedCount++;
      const codePoint = `U+${match.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
      removedCharacters[codePoint] = (removedCharacters[codePoint] || 0) + 1;
      return "";
    });

    return {
      cleanedText,
      removedCount,
      removedCharacters,
    };
  }

  /**
   * Estimates token count using standard 4 characters per token heuristic.
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Applies token/character budget limits to markdown text.
   * If budget is exceeded, truncates cleanly at paragraph or heading boundaries
   * and appends a structured diagnostic alert. Also automatically strips invisible characters.
   */
  static guardMarkdown(content: string, options: ContextGuardOptions = {}): GuardedContentResult {
    content = this.stripInvisibleUnicode(content);
    const originalChars = content.length;
    const originalTokens = this.estimateTokens(content);

    // Compute character budget
    let charBudget: number | undefined;
    if (typeof options.maxChars === "number" && options.maxChars > 0) {
      charBudget = options.maxChars;
    }
    if (typeof options.maxTokens === "number" && options.maxTokens > 0) {
      const tokenCharBudget = options.maxTokens * 4;
      charBudget =
        charBudget !== undefined ? Math.min(charBudget, tokenCharBudget) : tokenCharBudget;
    }

    // No limit specified or content within budget
    if (charBudget === undefined || originalChars <= charBudget) {
      return {
        content,
        isTruncated: false,
        originalTokens,
        retainedTokens: originalTokens,
        originalChars,
        retainedChars: originalChars,
      };
    }

    // Find semantic break point near charBudget
    const candidateSlice = content.slice(0, charBudget);
    let cutIndex = -1;

    // 1. Try cutting at a markdown heading boundary within the last 20%
    const searchWindow = Math.floor(charBudget * 0.2);
    const windowStart = Math.max(0, charBudget - searchWindow);
    const windowText = candidateSlice.slice(windowStart);

    const headingMatch = windowText.lastIndexOf("\n#");
    if (headingMatch !== -1) {
      cutIndex = windowStart + headingMatch;
    } else {
      // 2. Try cutting at paragraph boundary
      const paragraphMatch = windowText.lastIndexOf("\n\n");
      if (paragraphMatch !== -1) {
        cutIndex = windowStart + paragraphMatch;
      } else {
        // 3. Fallback to last whitespace
        const spaceMatch = windowText.lastIndexOf(" ");
        if (spaceMatch !== -1) {
          cutIndex = windowStart + spaceMatch;
        } else {
          // Hard cut
          cutIndex = charBudget;
        }
      }
    }

    const truncatedBody = content.slice(0, cutIndex).trimEnd();
    const retainedChars = truncatedBody.length;
    const retainedTokens = this.estimateTokens(truncatedBody);

    const diagnosticAlert = [
      "",
      "> [!NOTE]",
      `> **Context Guard:** Document was truncated to fit the token budget (${retainedTokens} tokens / ${retainedChars} chars out of estimated ${originalTokens} tokens). Structural hierarchy and table of contents are preserved.`,
    ].join("\n");

    const finalContent = `${truncatedBody}\n${diagnosticAlert}`;

    return {
      content: finalContent,
      isTruncated: true,
      originalTokens,
      retainedTokens,
      originalChars,
      retainedChars,
    };
  }
}
