/**
 * High-throughput static HTML scraping actor powered by Cheerio.
 * Provides DOM selector querying, metadata extraction, and body text sanitization.
 */

import * as cheerio from "cheerio";
import { normalizeUrl } from "./url-normalizer";
import { SSRFGuard } from "./ssrf-guard";
import { StructuredExtractor } from "./structured-extractor";
import { ReadabilityExtractor } from "./readability-extractor";
import {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  ScrapedPageResult,
} from "./types";

const DEFAULT_TIMEOUT_MS = 20000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; AgentSmithScraper/1.0; +https://agent-smith.local)";

export class CheerioScraperActor implements IActor<ScrapedPageResult> {
  readonly actorType = "cheerio-scraper" as const;
  readonly description =
    "Fast static HTML scraper for extracting readable text, metadata, and structured CSS selectors.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<ScrapedPageResult>> {
    const startTime = Date.now();
    const timeout = task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const normalized = normalizeUrl(task.targetUrl);
    if (!normalized.valid || !normalized.url) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: normalized.errorMessage ?? "Invalid target URL.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const targetUrl = normalized.url;

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(targetUrl, {
      allowLocalNetwork: process.env.NODE_ENV === "test",
    });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: ssrfCheck.reason ?? "SSRF guard blocked request.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          ...task.options?.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(timeout),
      });

      const statusCode = response.status;
      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode,
          errorMessage: `HTTP request failed with status ${statusCode}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawHtml = await response.text();
      const $ = cheerio.load(rawHtml);

      // Metadata extraction
      const title =
        $("title").first().text().trim() ||
        $('meta[property="og:title"]').attr("content")?.trim() ||
        "";

      const description =
        $('meta[name="description"]').attr("content")?.trim() ||
        $('meta[property="og:description"]').attr("content")?.trim() ||
        undefined;

      let favicon =
        $('link[rel="icon"]').attr("href") ||
        $('link[rel="shortcut icon"]').attr("href") ||
        undefined;

      if (favicon && !favicon.startsWith("http")) {
        try {
          favicon = new URL(favicon, targetUrl).toString();
        } catch {
          // Keep raw if URL parsing fails
        }
      }

      // Collect links
      const links: string[] = [];
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          try {
            const resolved = new URL(href, targetUrl).toString();
            if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
              links.push(resolved);
            }
          } catch {
            // Ignore malformed href
          }
        }
      });

      // Extract selectors if requested
      let selectedData: Record<string, string> | undefined;
      if (task.selectors && Object.keys(task.selectors).length > 0) {
        selectedData = {};
        for (const [key, selector] of Object.entries(task.selectors)) {
          const match = $(selector);
          selectedData[key] = match.length > 0 ? match.text().trim() : "";
        }
      }

      // Extract structured data before DOM sanitization
      const tables = task.options?.extractTables
        ? StructuredExtractor.extractTables(rawHtml)
        : undefined;

      const jsonLd = task.options?.extractJsonLd
        ? StructuredExtractor.extractJsonLd(rawHtml)
        : undefined;

      // Extract structured markdown via ReadabilityExtractor
      const readabilityResult = ReadabilityExtractor.extract(rawHtml, targetUrl, {
        includeTables: task.options?.extractTables !== false,
      });

      // If specific waitForSelector requested, extract its text
      let selectedContent = "";
      if (task.options?.waitForSelector && $(task.options.waitForSelector).length > 0) {
        selectedContent = $(task.options.waitForSelector).text().replace(/\s+/g, " ").trim();
      }

      let content = selectedContent || readabilityResult.markdown || readabilityResult.text;
      if (task.options?.contentType === "text") {
        content = selectedContent || readabilityResult.text;
      } else if (task.options?.contentType === "html") {
        content = rawHtml;
      }

      const pageResult: ScrapedPageResult = {
        url: targetUrl,
        title: title || readabilityResult.title,
        description: description || readabilityResult.excerpt,
        favicon,
        content,
        markdown: readabilityResult.markdown,
        byline: readabilityResult.byline,
        siteName: readabilityResult.siteName,
        excerpt: readabilityResult.excerpt,
        isArticle: readabilityResult.isArticle,
        rawHtml,
        selectedData,
        links: Array.from(new Set(links)),
        tables: tables && tables.length > 0 ? tables : undefined,
        jsonLd: jsonLd && jsonLd.length > 0 ? jsonLd : undefined,
      };

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode,
        data: pageResult,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const isTimeout =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }
}
