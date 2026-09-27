import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { CrawledPageData } from "../src/api/types";
import { CrawlFrontier } from "../src/network/crawl-frontier";

describe("CrawlFrontier - Disk-Backed Queue & Streaming Sink", () => {
  const testDir = join(__dirname, ".tmp-crawl-frontier-test");
  const customJsonl = join(testDir, "custom-output", "streamed.jsonl");

  before(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("enqueues and deduplicates URLs", () => {
    const frontier = new CrawlFrontier({ frontierDirectory: testDir });
    assert.equal(frontier.size(), 0);

    assert.equal(frontier.enqueue("https://example.com/page1", 0), true);
    assert.equal(frontier.enqueue("https://example.com/page1", 0), false);
    assert.equal(frontier.enqueue("https://example.com/page2", 1), true);

    assert.equal(frontier.size(), 2);
  });

  it("dequeues in FIFO order and marks URLs as visited", () => {
    const frontier = new CrawlFrontier({ frontierDirectory: testDir });
    frontier.clear();

    frontier.enqueue("https://example.com/first", 0);
    frontier.enqueue("https://example.com/second", 1);

    const first = frontier.dequeue();
    assert.deepEqual(first, { url: "https://example.com/first", depth: 0 });
    assert.equal(frontier.isVisited("https://example.com/first"), true);

    // Cannot re-enqueue visited URL
    assert.equal(frontier.enqueue("https://example.com/first", 2), false);

    const second = frontier.dequeue();
    assert.deepEqual(second, { url: "https://example.com/second", depth: 1 });
    assert.equal(frontier.hasMore(), false);
  });

  it("streams crawled pages to JSONL output file", () => {
    const frontier = new CrawlFrontier({
      frontierDirectory: testDir,
      outputJsonlPath: customJsonl,
    });

    const page1: CrawledPageData = {
      url: "https://example.com/p1",
      title: "Page 1",
      content: "Content 1",
      links: ["https://example.com/p2"],
    };
    const page2: CrawledPageData = {
      url: "https://example.com/p2",
      title: "Page 2",
      content: "Content 2",
      links: [],
    };

    frontier.appendPage(page1);
    frontier.appendPage(page2);

    assert.equal(frontier.getTotalCrawled(), 2);
    assert.equal(existsSync(customJsonl), true);

    const raw = readFileSync(customJsonl, "utf8");
    const lines = raw.trim().split("\n");
    assert.equal(lines.length, 2);

    const readPages = frontier.readAllPages();
    assert.equal(readPages.length, 2);
    assert.deepEqual(readPages[0], page1);
    assert.deepEqual(readPages[1], page2);
  });

  it("saves checkpoint and resumes state on restart", () => {
    const subDir = join(testDir, "resumable-frontier");
    const f1 = new CrawlFrontier({ frontierDirectory: subDir });

    f1.enqueue("https://example.com/item1", 0);
    f1.enqueue("https://example.com/item2", 1);
    f1.enqueue("https://example.com/item3", 1);

    // Dequeue item1 (it becomes visited)
    f1.dequeue();
    f1.appendPage({
      url: "https://example.com/item1",
      title: "Item 1",
      content: "Crawled",
      links: [],
    });

    f1.saveCheckpoint();

    // Create new instance with resume: true
    const f2 = new CrawlFrontier({ frontierDirectory: subDir, resume: true });

    assert.equal(f2.size(), 2);
    assert.equal(f2.isVisited("https://example.com/item1"), true);
    assert.equal(f2.getTotalCrawled(), 1);

    const next = f2.dequeue();
    assert.deepEqual(next, { url: "https://example.com/item2", depth: 1 });
  });
});
