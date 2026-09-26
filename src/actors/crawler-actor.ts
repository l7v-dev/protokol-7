/**
 * Multi-page breadth-first web crawler actor.
 * Orchestrates deduplicated link queueing, domain politeness limiting,
 * robots.txt policy compliance, disk-backed frontier streaming, and Cheerio/Playwright rendering.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  CrawledPageData,
  CrawlerResult,
  IActor,
  ScrapedPageResult,
} from "../core/types";
import { RobotsParser } from "../extractors/robots-parser";
import { CrawlFrontier } from "../network/crawl-frontier";
import { CrawlUrlAccumulator } from "../network/crawl-url-accumulator";
import { PolitenessLimiter } from "../network/politeness-limiter";
import { normalizeUrl } from "../network/url-normalizer";
import { matchUrlPattern } from "../network/url-pattern-matcher";
import { CheerioScraperActor } from "./cheerio-scraper-actor";
import { PlaywrightBrowserActor } from "./playwright-browser-actor";

const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_DEPTH = 2;
const MAX_CRAWL_LIMIT = 10000;

function shouldCrawlUrl(
  url: string,
  startHostname: string,
  sameDomainOnly: boolean,
  includePatterns: string[],
  excludePatterns: string[]
): boolean {
  if (sameDomainOnly && startHostname) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.toLowerCase() !== startHostname) {
        return false;
      }
    } catch {
      return false;
    }
  }

  if (
    includePatterns.length > 0 &&
    !includePatterns.some((pattern) => matchUrlPattern(url, pattern))
  ) {
    return false;
  }

  if (excludePatterns.some((pattern) => matchUrlPattern(url, pattern))) {
    return false;
  }

  return true;
}

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

    let startHostname = "";
    try {
      startHostname = new URL(startUrl).hostname.toLowerCase();
    } catch {
      // Ignored
    }

    const includePatterns = crawlerOptions?.includePatterns ?? [];
    const excludePatterns = crawlerOptions?.excludePatterns ?? [];
    const sameDomainOnly = crawlerOptions?.sameDomainOnly !== false;

    // Use disk-backed CrawlFrontier if frontierDirectory is configured, otherwise in-memory accumulator
    const frontier = crawlerOptions?.frontierDirectory
      ? new CrawlFrontier({
          frontierDirectory: crawlerOptions.frontierDirectory,
          outputJsonlPath: crawlerOptions.outputJsonlPath,
          resume: crawlerOptions.resume,
        })
      : undefined;

    let accumulator: CrawlUrlAccumulator | undefined;
    if (frontier) {
      if (!crawlerOptions?.resume || frontier.size() === 0) {
        frontier.enqueue(startUrl, 0);
      }
    } else {
      accumulator = new CrawlUrlAccumulator({
        startUrl,
        maxPages,
        maxDepth,
        includePatterns,
        excludePatterns,
        sameDomainOnly,
      });
    }

    const politenessLimiter = new PolitenessLimiter();
    let robotsParser: RobotsParser | undefined;

    if (respectRobotsTxt) {
      robotsParser = await RobotsParser.fetchForOrigin(startUrl, {
        allowLocalNetwork: process.env.NODE_ENV === "test",
      });
      if (robotsParser) {
        const crawlDelay = robotsParser.getCrawlDelay();
        if (crawlDelay !== undefined && crawlDelay > 0) {
          politenessLimiter.setMinInterval(crawlDelay * 1000);
        }
      }
    }

    const underlyingActor: IActor<ScrapedPageResult> = renderJavaScript
      ? new PlaywrightBrowserActor()
      : new CheerioScraperActor();

    const crawledPages: CrawledPageData[] = [];
    const failedUrls: string[] = [];
    let totalSuccessCount = 0;
    let subTaskCounter = 0;

    const hasMoreItems = (): boolean => {
      if (frontier) {
        return frontier.hasMore() && totalSuccessCount + failedUrls.length < maxPages;
      }
      return accumulator ? accumulator.hasMore() : false;
    };

    const getNextItem = () => {
      if (frontier) {
        return frontier.dequeue();
      }
      return accumulator ? accumulator.next() : undefined;
    };

    while (hasMoreItems()) {
      const current = getNextItem();
      if (!current) break;

      // 1. Robots.txt policy compliance check
      if (robotsParser && !robotsParser.isAllowed(current.url)) {
        failedUrls.push(current.url);
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
          proxy: crawlerOptions?.proxy ?? task.options?.proxy,
          retryOptions: crawlerOptions?.retryOptions ?? task.options?.retryOptions,
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
          totalSuccessCount += 1;
          const page = result.data;

          const pageData: CrawledPageData = {
            url: page.url,
            title: page.title,
            description: page.description,
            content: page.content,
            links: page.links ?? [],
            tables: page.tables,
          };

          if (frontier) {
            frontier.appendPage(pageData);
            frontier.saveCheckpoint();

            // Feed child links back into frontier queue
            if (current.depth < maxDepth && page.links && page.links.length > 0) {
              for (const rawChild of page.links) {
                const normChild = normalizeUrl(rawChild);
                if (normChild.valid && normChild.url) {
                  if (
                    shouldCrawlUrl(
                      normChild.url,
                      startHostname,
                      sameDomainOnly,
                      includePatterns,
                      excludePatterns
                    )
                  ) {
                    frontier.enqueue(normChild.url, current.depth + 1);
                  }
                }
              }
            }
          } else if (accumulator) {
            // Feed child links back into accumulator queue
            if (page.links && page.links.length > 0) {
              accumulator.addUrls(page.links, current.depth + 1);
            }
          }

          // Bound in-memory array to prevent heap exhaustion during large crawls
          if (crawledPages.length < 1000) {
            crawledPages.push(pageData);
          }
        } else {
          failedUrls.push(current.url);
        }
      } catch {
        failedUrls.push(current.url);
      }
    }

    if (frontier) {
      frontier.saveCheckpoint();
    }

    const totalCrawled = frontier ? frontier.getTotalCrawled() : totalSuccessCount;

    const crawlerResult: CrawlerResult = {
      startUrl,
      totalCrawled,
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
