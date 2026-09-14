/**
 * Multi-page breadth-first web crawler actor.
 * Orchestrates deduplicated link queueing, domain politeness limiting,
 * robots.txt policy compliance, and Cheerio/Playwright rendering.
 */

import { CheerioScraperActor } from "./cheerio-scraper-actor";
import { CrawlUrlAccumulator } from "./crawl-url-accumulator";
import { PlaywrightBrowserActor } from "./playwright-browser-actor";
import { PolitenessLimiter } from "./politeness-limiter";
import { RobotsParser } from "./robots-parser";
import {
  ActorResult,
  ActorRunContext,
  ActorTask,
  CrawledPageData,
  CrawlerResult,
  IActor,
  ScrapedPageResult,
} from "./types";
import { normalizeUrl } from "./url-normalizer";

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_DEPTH = 2;
const MAX_CRAWL_LIMIT = 50;

export class CrawlerActor implements IActor<CrawlerResult> {
  readonly actorType = "crawler" as const;
  readonly description =
    "Breadth-first multi-page crawler with robots.txt compliance, politeness delays, and deduplication.";

  async run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<CrawlerResult>> {
    const startTime = Date.now();
    const normalized = normalizeUrl(task.targetUrl);

    if (!normalized.valid || !normalized.url) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: normalized.errorMessage ?? "Invalid start URL for crawling.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const startUrl = normalized.url;
    const crawlerOptions = task.options?.crawlerOptions;

    const maxPages = Math.min(
      Math.max(1, crawlerOptions?.maxPages ?? DEFAULT_MAX_PAGES),
      MAX_CRAWL_LIMIT
    );
    const maxDepth = Math.max(0, crawlerOptions?.maxDepth ?? DEFAULT_MAX_DEPTH);
    const respectRobotsTxt = crawlerOptions?.respectRobotsTxt !== false;
    const renderJavaScript = Boolean(
      crawlerOptions?.renderJavaScript || task.options?.renderJavaScript
    );

    const accumulator = new CrawlUrlAccumulator({
      startUrl,
      maxPages,
      maxDepth,
      includePatterns: crawlerOptions?.includePatterns,
      excludePatterns: crawlerOptions?.excludePatterns,
      sameDomainOnly: crawlerOptions?.sameDomainOnly !== false,
    });

    const politenessLimiter = new PolitenessLimiter();
    let robotsParser: RobotsParser | undefined;

    if (respectRobotsTxt) {
      robotsParser = await RobotsParser.fetchForOrigin(startUrl, {
        allowLocalNetwork: process.env.NODE_ENV === "test",
      });
    }

    const underlyingActor: IActor<ScrapedPageResult> = renderJavaScript
      ? new PlaywrightBrowserActor()
      : new CheerioScraperActor();

    const crawledPages: CrawledPageData[] = [];
    const failedUrls: string[] = [];
    let subTaskCounter = 0;

    while (accumulator.hasMore()) {
      const current = accumulator.next();
      if (!current) break;

      // 1. Robots.txt policy compliance check
      if (robotsParser && !robotsParser.isAllowed(current.url)) {
        continue;
      }

      // 2. Enforce domain politeness delay
      await politenessLimiter.waitForSlot(current.url);

      const subTask: ActorTask = {
        taskId: `${task.taskId}-sub-${++subTaskCounter}`,
        actorType: underlyingActor.actorType,
        targetUrl: current.url,
        options: {
          timeoutMs: task.options?.timeoutMs ?? 15000,
          renderJavaScript,
          extractTables: crawlerOptions?.extractTables ?? task.options?.extractTables,
          extractJsonLd: crawlerOptions?.extractJsonLd ?? task.options?.extractJsonLd,
          blockAssets: task.options?.blockAssets !== false,
        },
      };

      try {
        const result = await underlyingActor.run(subTask, {
          task: subTask,
          startTime: Date.now(),
        });

        if (result.statusCode === 429 || result.statusCode === 503) {
          politenessLimiter.recordRateLimit(current.url);
          failedUrls.push(current.url);
          continue;
        }

        if (result.status === "completed" && result.data) {
          politenessLimiter.recordSuccess(current.url);
          const page = result.data;

          crawledPages.push({
            url: page.url,
            title: page.title,
            description: page.description,
            content: page.content,
            links: page.links ?? [],
            tables: page.tables,
          });

          // Feed child links back into accumulator queue
          if (page.links && page.links.length > 0) {
            accumulator.addUrls(page.links, current.depth + 1);
          }
        } else {
          failedUrls.push(current.url);
        }
      } catch {
        failedUrls.push(current.url);
      }
    }

    const crawlerResult: CrawlerResult = {
      startUrl,
      totalCrawled: crawledPages.length,
      pages: crawledPages,
      failedUrls,
    };

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      data: crawlerResult,
      executionDurationMs: Date.now() - startTime,
    };
  }
}
