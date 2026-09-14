/**
 * Asynchronous breadth-first URL crawl accumulator and queue.
 * Manages deduplication, depth bounding, and wildcard pattern filtering.
 */

import { normalizeUrl } from "./url-normalizer";
import { matchUrlPattern } from "./url-pattern-matcher";

export interface CrawlAccumulatorConfig {
  startUrl: string;
  maxPages?: number;
  maxDepth?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface CrawlItem {
  url: string;
  depth: number;
}

export class CrawlUrlAccumulator {
  private readonly visited = new Set<string>();
  private readonly queued = new Set<string>();
  private readonly queue: CrawlItem[] = [];

  readonly maxPages: number;
  readonly maxDepth: number;
  readonly includePatterns: string[];
  readonly excludePatterns: string[];

  constructor(config: CrawlAccumulatorConfig) {
    this.maxPages = config.maxPages ?? 10;
    this.maxDepth = config.maxDepth ?? 2;
    this.includePatterns = config.includePatterns ?? [];
    this.excludePatterns = config.excludePatterns ?? [];

    this.addUrls([config.startUrl], 0);
  }

  addUrls(urls: string[], depth: number): void {
    if (depth > this.maxDepth) return;

    for (const rawUrl of urls) {
      if (this.visited.size + this.queue.length >= this.maxPages) {
        break;
      }

      const normalized = normalizeUrl(rawUrl);
      if (!normalized.valid || !normalized.url) {
        continue;
      }

      const url = normalized.url;

      if (this.visited.has(url) || this.queued.has(url)) {
        continue;
      }

      // Include patterns: if specified, at least one must match
      if (
        this.includePatterns.length > 0 &&
        !this.includePatterns.some((pattern) => matchUrlPattern(url, pattern))
      ) {
        continue;
      }

      // Exclude patterns: if any matches, skip
      if (
        this.excludePatterns.some((pattern) => matchUrlPattern(url, pattern))
      ) {
        continue;
      }

      this.queued.add(url);
      this.queue.push({ url, depth });
    }
  }

  next(): CrawlItem | undefined {
    const item = this.queue.shift();
    if (item) {
      this.queued.delete(item.url);
      this.visited.add(item.url);
    }
    return item;
  }

  hasMore(): boolean {
    return this.queue.length > 0 && this.visited.size < this.maxPages;
  }

  getVisitedUrls(): string[] {
    return Array.from(this.visited);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getVisitedCount(): number {
    return this.visited.size;
  }
}
