/**
 * Disk-backed crawl frontier and streaming page sink.
 * Provides FIFO crawl queueing, URL deduplication, crash-resilient checkpointing,
 * and memory-safe append-only JSONL page streaming.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { CrawledPageData } from "../core/types";

export interface FrontierItem {
  url: string;
  depth: number;
}

export interface FrontierCheckpoint {
  queue: FrontierItem[];
  visited: string[];
  totalCrawled: number;
  updatedAt: number;
}

export interface CrawlFrontierOptions {
  frontierDirectory: string;
  outputJsonlPath?: string;
  resume?: boolean;
}

export class CrawlFrontier {
  private readonly directory: string;
  private readonly checkpointFile: string;
  private readonly visitedFile: string;
  private readonly jsonlOutputFile: string;

  private queue: FrontierItem[] = [];
  private queuedSet = new Set<string>();
  private visitedSet = new Set<string>();
  private totalCrawled = 0;

  constructor(options: CrawlFrontierOptions) {
    this.directory = options.frontierDirectory;
    if (!existsSync(this.directory)) {
      mkdirSync(this.directory, { recursive: true });
    }

    this.checkpointFile = join(this.directory, "checkpoint.json");
    this.visitedFile = join(this.directory, "visited.txt");
    this.jsonlOutputFile = options.outputJsonlPath ?? join(this.directory, "crawled-pages.jsonl");

    const jsonlDir = dirname(this.jsonlOutputFile);
    if (!existsSync(jsonlDir)) {
      mkdirSync(jsonlDir, { recursive: true });
    }

    if (options.resume && existsSync(this.checkpointFile)) {
      this.loadCheckpoint();
    }
  }

  private loadCheckpoint(): void {
    try {
      const raw = readFileSync(this.checkpointFile, "utf8");
      const checkpoint: FrontierCheckpoint = JSON.parse(raw);
      if (checkpoint && Array.isArray(checkpoint.queue) && Array.isArray(checkpoint.visited)) {
        this.queue = checkpoint.queue;
        this.queuedSet = new Set(this.queue.map((item) => item.url));
        this.visitedSet = new Set(checkpoint.visited);
        this.totalCrawled = checkpoint.totalCrawled ?? 0;
      }
    } catch {
      // If corrupted, fallback to empty queue
    }
  }

  enqueue(url: string, depth: number): boolean {
    if (this.visitedSet.has(url) || this.queuedSet.has(url)) {
      return false;
    }
    this.queuedSet.add(url);
    this.queue.push({ url, depth });
    return true;
  }

  dequeue(): FrontierItem | undefined {
    const item = this.queue.shift();
    if (!item) return undefined;
    this.queuedSet.delete(item.url);
    this.visitedSet.add(item.url);
    try {
      appendFileSync(this.visitedFile, `${item.url}\n`, "utf8");
    } catch {
      // Ignored
    }
    return item;
  }

  hasMore(): boolean {
    return this.queue.length > 0;
  }

  size(): number {
    return this.queue.length;
  }

  getVisitedCount(): number {
    return this.visitedSet.size;
  }

  getTotalCrawled(): number {
    return this.totalCrawled;
  }

  isVisited(url: string): boolean {
    return this.visitedSet.has(url);
  }

  appendPage(page: CrawledPageData): void {
    this.totalCrawled += 1;
    const line = `${JSON.stringify(page)}\n`;
    appendFileSync(this.jsonlOutputFile, line, "utf8");
  }

  saveCheckpoint(): void {
    const checkpoint: FrontierCheckpoint = {
      queue: this.queue,
      visited: Array.from(this.visitedSet),
      totalCrawled: this.totalCrawled,
      updatedAt: Date.now(),
    };
    writeFileSync(this.checkpointFile, JSON.stringify(checkpoint, null, 2), "utf8");
  }

  readAllPages(): CrawledPageData[] {
    if (!existsSync(this.jsonlOutputFile)) {
      return [];
    }
    const content = readFileSync(this.jsonlOutputFile, "utf8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);
    const pages: CrawledPageData[] = [];
    for (const line of lines) {
      try {
        pages.push(JSON.parse(line));
      } catch {
        // Skip malformed line
      }
    }
    return pages;
  }

  clear(): void {
    this.queue = [];
    this.queuedSet.clear();
    this.visitedSet.clear();
    this.totalCrawled = 0;
    if (existsSync(this.checkpointFile)) {
      rmSync(this.checkpointFile, { force: true });
    }
    if (existsSync(this.visitedFile)) {
      rmSync(this.visitedFile, { force: true });
    }
    if (existsSync(this.jsonlOutputFile)) {
      rmSync(this.jsonlOutputFile, { force: true });
    }
  }
}
