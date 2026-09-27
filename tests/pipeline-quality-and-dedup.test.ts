/**
 * Test Suite: LLM Pipeline Normalization, Quality Gates, and Deduplication Engine.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RegistryDatabase } from "../src/api/registry-database";
import type { ExecutionResult, ExecutionTarget } from "../src/pipeline/execution";
import { PipelineRunner } from "../src/pipeline/pipeline-runner";
import { DedupFilter } from "../src/pipeline/processors/dedup-filter";
import { QualityFilter } from "../src/pipeline/processors/quality-filter";
import { TextNormalizer } from "../src/pipeline/processors/text-normalizer";

describe("LLM Pipeline - TextNormalizer", () => {
  it("normalizes Unicode NFKC and strips zero-width and control characters", () => {
    const normalizer = new TextNormalizer();
    // 'ﬁ' (U+FB01 ligature), zero-width space (U+200B), form feed (U+000C)
    const raw = "The ﬁnal\u200B draft\x0C of the document.\r\nNext line.";
    const result = normalizer.normalize(raw);

    assert.equal(result, "The final draft of the document.\nNext line.");
  });

  it("collapses horizontal spaces and multiple blank lines", () => {
    const normalizer = new TextNormalizer({ maxConsecutiveNewlines: 2 });
    const raw = "Title   with   spaces\n\n\n\n\nParagraph   body.";
    const result = normalizer.normalize(raw);

    assert.equal(result, "Title with spaces\n\n\nParagraph body.");
  });

  it("attaches cryptographic raw_sha256 and normalized_sha256 lineage", () => {
    const normalizer = new TextNormalizer();
    const item = {
      id: "doc-1",
      content: "Hello   \u200Bworld!\r\nSecond line.",
    };

    const processed = normalizer.processItem(item);
    assert.equal(processed.item.content, "Hello world!\nSecond line.");
    assert.ok(processed.rawSha256);
    assert.ok(processed.normalizedSha256);
    assert.notEqual(processed.rawSha256, processed.normalizedSha256);
    const itemRecord = processed.item as Record<string, unknown>;
    assert.equal(itemRecord.raw_sha256, processed.rawSha256);
    assert.equal(itemRecord.normalized_sha256, processed.normalizedSha256);
  });
});

describe("LLM Pipeline - QualityFilter (FineWeb/Gopher Heuristics)", () => {
  const filter = new QualityFilter({
    minWords: 20,
    minCharCount: 80,
    maxSymbolRatio: 0.15,
    minAlphaRatio: 0.65,
    maxDuplicateLineFraction: 0.3,
  });

  it("passes high-quality prose document", () => {
    const text =
      "Artificial intelligence represents a transformational discipline within computer science. " +
      "It encompasses machine learning, deep neural representations, and natural language understanding. " +
      "Modern foundation models require vast amounts of curated training data to minimize hallucinations.";

    const evalResult = filter.evaluate(text);
    assert.equal(evalResult.passed, true);
    assert.equal(evalResult.reasons.length, 0);
    assert.ok(evalResult.metrics.wordCount >= 20);
    assert.ok(evalResult.metrics.alphaRatio >= 0.7);
    assert.ok(evalResult.metrics.symbolRatio < 0.1);
  });

  it("vetoes short, low-word-count snippets", () => {
    const text = "Too short to be an informative article.";
    const evalResult = filter.evaluate(text);

    assert.equal(evalResult.passed, false);
    assert.ok(evalResult.reasons.some((r) => r.includes("Word count")));
  });

  it("vetoes symbol-heavy or garbled spam", () => {
    const text =
      "%%%% $$$$ #### @@@@ **** ~~~~ ^^^^ &&&& |||| " +
      "%%%% $$$$ #### @@@@ **** ~~~~ ^^^^ &&&& |||| " +
      "%%%% $$$$ #### @@@@ **** ~~~~ ^^^^ &&&& |||| " +
      "Sample words here to meet word count limit easily.";

    const evalResult = filter.evaluate(text);
    assert.equal(evalResult.passed, false);
    assert.ok(evalResult.reasons.some((r) => r.includes("Symbol ratio")));
  });

  it("vetoes documents with high line repetition (boilerplate loop)", () => {
    const repeated = "This is a repetitive boilerplate line that loops repeatedly.";
    const text = [
      repeated,
      repeated,
      repeated,
      repeated,
      repeated,
      "Unique line one describing actual content.",
      "Unique line two describing another detail.",
    ].join("\n");

    const evalResult = filter.evaluate(text);
    assert.equal(evalResult.passed, false);
    assert.ok(evalResult.reasons.some((r) => r.includes("Duplicate line fraction")));
  });

  it("filters batch dropping low quality items or flagging them according to config", () => {
    const dropFilter = new QualityFilter({ minWords: 10, minCharCount: 40, action: "drop" });
    const flagFilter = new QualityFilter({ minWords: 10, minCharCount: 40, action: "flag" });

    const items = [
      { id: "1", content: "Short" },
      {
        id: "2",
        content: "This is a sufficiently long sentence that has more than ten words in total.",
      },
    ];

    const dropped = dropFilter.filterBatch(items);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].id, "2");

    const flagged = flagFilter.filterBatch(items);
    assert.equal(flagged.length, 2);
    assert.equal((flagged[0] as Record<string, unknown>).quality_passed, false);
    assert.equal((flagged[1] as Record<string, unknown>).quality_passed, true);
  });
});

describe("LLM Pipeline - DedupFilter", () => {
  it("drops exact duplicates based on SHA-256 fingerprint", () => {
    const dedup = new DedupFilter({ exact: true, action: "drop" });
    const items = [
      { id: "doc-1", content: "Identical content body across two distinct entries." },
      { id: "doc-2", content: "Identical content body across two distinct entries." },
      { id: "doc-3", content: "Different unique content body." },
    ];

    const result = dedup.filterBatch(items);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "doc-1");
    assert.equal(result[1].id, "doc-3");
  });

  it("detects near-duplicates using 64-bit SimHash and Hamming distance", () => {
    const dedup = new DedupFilter({
      exact: true,
      nearDuplicate: true,
      maxHammingDistance: 10,
      action: "drop",
    });

    const docA =
      "Distributed consensus algorithms ensure state machine replication in modern cluster systems. " +
      "Raft and Paxos are standard implementations used in cloud architectures.";

    // Slightly modified version (one word changed)
    const docB =
      "Distributed consensus protocols ensure state machine replication in modern cluster systems. " +
      "Raft and Paxos are standard implementations used in cloud architectures.";

    const docC =
      "Photosynthesis is a biological process used by plants to convert light energy into chemical energy. " +
      "Cellular respiration is the complementary metabolic process.";

    const items = [
      { id: "a", content: docA },
      { id: "b", content: docB },
      { id: "c", content: docC },
    ];

    const result = dedup.filterBatch(items);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "a");
    assert.equal(result[1].id, "c");
  });
});

describe("LLM Pipeline - PipelineRunner Integration with Quality, Dedup & RegistryDatabase", () => {
  class MockQualityExecutor implements ExecutionTarget {
    readonly name = "mock-quality";

    async run(): Promise<ExecutionResult> {
      return {
        success: true,
        items: [
          // Item 1: High quality
          {
            id: "article-1",
            content:
              "Quantum mechanics is a fundamental theory in physics that describes nature at the scale of atoms. " +
              "It underpins modern chemistry, semiconductor technology, and quantum information science.",
          },
          // Item 2: Low quality (too short)
          {
            id: "article-2",
            content: "Too short.",
          },
          // Item 3: Exact duplicate of Item 1
          {
            id: "article-3",
            content:
              "Quantum mechanics is a fundamental theory in physics that describes nature at the scale of atoms. " +
              "It underpins modern chemistry, semiconductor technology, and quantum information science.",
          },
          // Item 4: High quality unique
          {
            id: "article-4",
            content:
              "Linear algebra forms the mathematical foundation of deep learning and multi-dimensional geometry. " +
              "Matrix multiplication and tensor decompositions are fundamental computational primitives.",
          },
        ],
        itemCount: 4,
        durationMs: 10,
      };
    }
  }

  it("executes normalization, quality gate, and dedup in pipeline runner and writes audit ledger", async () => {
    const registryDb = new RegistryDatabase({ inMemory: true });
    const runner = new PipelineRunner({
      executor: new MockQualityExecutor(),
      registryDb,
    });

    const yamlConfig = `
name: physics-llm-corpus
version: 1
actor:
  id: cheerio-scraper
  config:
    targetUrl: "https://example.com"
normalization:
  enabled: true
  nfkc: true
quality_gate:
  enabled: true
  min_words: 15
  min_chars: 80
  action: drop
dedup:
  enabled: true
  exact: true
  action: drop
output:
  format: jsonl
storage:
  backend: local
`;

    const result = await runner.runYaml(yamlConfig);
    assert.equal(result.status, "succeeded");
    // Out of 4 items:
    // article-2 dropped (too short)
    // article-3 dropped (exact duplicate of article-1)
    // Only article-1 and article-4 survive!
    assert.equal(result.itemCount, 2);

    // Verify dataset shards were written to SQLite
    const shards = registryDb.listDatasetShards("physics-llm-corpus");
    assert.equal(shards.length, 1);
    assert.equal(shards[0].recordCount, 2);

    // Verify verification audit ledger was written
    const audits = registryDb.listVerificationAudits(result.runId);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].recordCountMatches, true);
    assert.equal(audits[0].verificationPassed, true);
    assert.equal(audits[0].verifierIdentity, "PipelineRunner-Gatekeeper-v1.0");

    registryDb.close();
  });
});
