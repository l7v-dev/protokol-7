import assert from "node:assert/strict";
import test from "node:test";
import { MarkdownReaderActor } from "@/actors/markdown-reader-actor";
import { ContextGuard } from "@/core/context-guard";

test("ContextGuard.estimateTokens returns expected token counts", () => {
  assert.equal(ContextGuard.estimateTokens(""), 0);
  assert.equal(ContextGuard.estimateTokens("1234"), 1);
  assert.equal(ContextGuard.estimateTokens("12345678"), 2);
  assert.equal(ContextGuard.estimateTokens("a".repeat(100)), 25);
});

test("ContextGuard.guardMarkdown leaves content below budget untouched", () => {
  const shortText = "# Heading\n\nThis is a short document.\n";
  const result = ContextGuard.guardMarkdown(shortText, { maxTokens: 100 });

  assert.equal(result.isTruncated, false);
  assert.equal(result.content, shortText);
  assert.equal(result.originalTokens, ContextGuard.estimateTokens(shortText));
  assert.equal(result.retainedTokens, result.originalTokens);
});

test("ContextGuard.guardMarkdown truncates content exceeding maxTokens at semantic boundaries", () => {
  const longParagraphs = [
    "# Section 1",
    "This is the first section of the document with extensive text describing protocol mechanisms.",
    "# Section 2",
    "This is the second section of the document providing architecture details and domain contracts.",
    "# Section 3",
    "This is the third section discussing deployment, performance tuning, and storage optimizations.",
  ].join("\n\n");

  // Restrict to ~25 tokens (~100 chars)
  const result = ContextGuard.guardMarkdown(longParagraphs, { maxTokens: 25 });

  assert.equal(result.isTruncated, true);
  assert.ok(result.content.includes("Context Guard:"));
  assert.ok(result.content.includes("Section 1"));
  assert.ok(!result.content.includes("Section 3"));
  assert.ok(result.retainedTokens <= 35);
  assert.ok(result.retainedChars > 0 && result.retainedChars <= 100);
});

test("MarkdownReaderActor integrates ContextGuard when maxTokens is provided", () => {
  const actor = new MarkdownReaderActor();
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>Long Test Article</title></head>
      <body>
        <article>
          <h1>Long Test Article</h1>
          <p>${"Sentence describing the system architecture and data pipelines. ".repeat(50)}</p>
          <h2>Subheading 1</h2>
          <p>${"More details on streaming, decompressors, and Parquet sharding. ".repeat(50)}</p>
        </article>
      </body>
    </html>
  `;

  // Without token budget
  const unlimitedResult = actor.distillHtml(sampleHtml, "https://example.com/test", {
    includeFrontmatter: true,
  });
  assert.equal(unlimitedResult.isTruncated, false);
  assert.ok(unlimitedResult.estimatedTokenCount > 500);

  // With strict token budget (100 tokens)
  const guardedResult = actor.distillHtml(sampleHtml, "https://example.com/test", {
    includeFrontmatter: true,
    maxTokens: 100,
  });
  assert.equal(guardedResult.isTruncated, true);
  assert.ok(guardedResult.contentMarkdown.includes("Context Guard:"));
  assert.ok((guardedResult.retainedTokenCount || 0) <= 150);
});

test("ContextGuard.stripInvisibleUnicode removes zero-width and bidi override characters", () => {
  const dirtyText =
    "Hel\u200Blo W\uFEFForld\u200D!\u00AD This is a \u202Etest\u202C string with \u2060invisibles.";
  const cleanText = ContextGuard.stripInvisibleUnicode(dirtyText);

  assert.equal(cleanText, "Hello World! This is a test string with invisibles.");
});

test("ContextGuard.sanitizeInvisibleCharacters returns accurate metrics and breakdown", () => {
  const payload = "User\u200B123\uFEFF\u200BToken";
  const result = ContextGuard.sanitizeInvisibleCharacters(payload);

  assert.equal(result.cleanedText, "User123Token");
  assert.equal(result.removedCount, 3);
  assert.equal(result.removedCharacters["U+200B"], 2);
  assert.equal(result.removedCharacters["U+FEFF"], 1);
});

test("ContextGuard.stripInvisibleUnicode respects preserveZwnj option", () => {
  const persianTextWithZwnj = "می\u200Cخواهم\u200B";

  // Default: strips ZWNJ as well
  assert.equal(ContextGuard.stripInvisibleUnicode(persianTextWithZwnj), "میخواهم");

  // With preserveZwnj: keeps ZWNJ, strips ZWSP
  assert.equal(
    ContextGuard.stripInvisibleUnicode(persianTextWithZwnj, { preserveZwnj: true }),
    "می\u200Cخواهم"
  );
});

test("ContextGuard.guardMarkdown automatically purges invisible unicode payloads", () => {
  const textWithWatermark = "# Title\u200B\n\nParagraph with hidden\uFEFF steganography.\n";
  const result = ContextGuard.guardMarkdown(textWithWatermark);

  assert.ok(!result.content.includes("\u200B"));
  assert.ok(!result.content.includes("\uFEFF"));
  assert.equal(result.content, "# Title\n\nParagraph with hidden steganography.\n");
});
