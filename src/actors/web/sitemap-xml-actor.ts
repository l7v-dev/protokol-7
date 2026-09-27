import { gunzipSync } from "node:zlib";
import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  SitemapResult,
  SitemapUrlEntry,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";
import { matchUrlPattern } from "../../network/url-pattern-matcher";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_URLS = 5000;
const DEFAULT_MAX_DEPTH = 2;

export class SitemapXmlActor implements IActor<SitemapResult> {
  readonly actorType = "sitemap-xml" as const;
  readonly description =
    "XML sitemap and RSS/Atom feed crawler with gzip decompression and index traversal.";

  async run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<SitemapResult>> {
    const startTime = Date.now();
    const timeoutMs =
      task.options?.timeoutMs ?? task.options?.sitemapOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxUrls = task.options?.sitemapOptions?.maxUrls ?? DEFAULT_MAX_URLS;
    const maxDepth = task.options?.sitemapOptions?.maxDepth ?? DEFAULT_MAX_DEPTH;
    const filterPatterns = task.options?.sitemapOptions?.filterPatterns;

    const allowLocalNetwork = process.env.NODE_ENV === "test";
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const aggregatedUrls: SitemapUrlEntry[] = [];
      const discoveredSubSitemaps: string[] = [];
      let isIndex = false;

      await this.crawlSitemapRecursive(
        task.targetUrl,
        0,
        maxDepth,
        maxUrls,
        filterPatterns,
        aggregatedUrls,
        discoveredSubSitemaps,
        controller.signal,
        (foundIndex) => {
          if (foundIndex) isIndex = true;
        }
      );

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          sitemapUrl: task.targetUrl,
          isIndex,
          totalUrls: aggregatedUrls.length,
          subSitemaps: discoveredSubSitemaps.length > 0 ? discoveredSubSitemaps : undefined,
          urls: aggregatedUrls,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchXml(url: string, signal: AbortSignal): Promise<string> {
    const allowLocalNetwork = process.env.NODE_ENV === "test";
    const res = await safeRedirectFetch(url, {
      signal,
      allowLocalNetwork,
      headers: {
        "User-Agent": "protokol-7/1.0.0 (+https://github.com/protokol-7; sitemap crawler)",
        Accept: "application/xml, text/xml, application/rss+xml, application/atom+xml, */*",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status} fetching sitemap at ${url}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Gzip magic number check: 0x1f, 0x8b
    const isGzip =
      url.endsWith(".gz") || (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b);

    if (isGzip) {
      return gunzipSync(buffer).toString("utf8");
    }

    return buffer.toString("utf8");
  }

  private async crawlSitemapRecursive(
    url: string,
    currentDepth: number,
    maxDepth: number,
    maxUrls: number,
    filterPatterns: string[] | undefined,
    aggregatedUrls: SitemapUrlEntry[],
    subSitemapsList: string[],
    signal: AbortSignal,
    setIndexFlag: (isIndex: boolean) => void
  ): Promise<void> {
    if (aggregatedUrls.length >= maxUrls) return;

    const xml = await this.fetchXml(url, signal);
    const $ = cheerio.load(xml, { xmlMode: true });

    const sitemapTags = $("sitemapindex > sitemap, sitemap");
    if (sitemapTags.length > 0) {
      setIndexFlag(true);
      const childUrls: string[] = [];

      sitemapTags.each((_i, el) => {
        const loc = $(el).find("loc").text().trim();
        if (loc) {
          childUrls.push(loc);
          if (!subSitemapsList.includes(loc)) {
            subSitemapsList.push(loc);
          }
        }
      });

      if (currentDepth < maxDepth) {
        for (const childUrl of childUrls) {
          if (aggregatedUrls.length >= maxUrls) break;
          try {
            await this.crawlSitemapRecursive(
              childUrl,
              currentDepth + 1,
              maxDepth,
              maxUrls,
              filterPatterns,
              aggregatedUrls,
              subSitemapsList,
              signal,
              setIndexFlag
            );
          } catch {
            // Unreachable or invalid sub-sitemaps shouldn't abort the entire crawl
          }
        }
      }
      return;
    }

    // Standard <urlset> entries
    const urlTags = $("urlset > url, url");
    if (urlTags.length > 0) {
      urlTags.each((_i, el) => {
        if (aggregatedUrls.length >= maxUrls) return;
        const loc = $(el).find("loc").text().trim();
        if (!loc) return;

        if (filterPatterns && filterPatterns.length > 0) {
          const matches = filterPatterns.some((pattern) => matchUrlPattern(pattern, loc));
          if (!matches) return;
        }

        const lastmod = $(el).find("lastmod").text().trim() || undefined;
        const changefreq = $(el).find("changefreq").text().trim() || undefined;
        const priorityText = $(el).find("priority").text().trim();
        const priority = priorityText ? parseFloat(priorityText) : undefined;

        aggregatedUrls.push({
          loc,
          lastmod,
          changefreq,
          priority: Number.isNaN(priority) ? undefined : priority,
        });
      });
      return;
    }

    // RSS / Atom feed fallback
    const items = $("item, entry");
    if (items.length > 0) {
      items.each((_i, el) => {
        if (aggregatedUrls.length >= maxUrls) return;
        let loc = $(el).find("link").text().trim();
        if (!loc) {
          loc = $(el).find("link").attr("href") || "";
        }
        if (!loc) return;

        if (filterPatterns && filterPatterns.length > 0) {
          const matches = filterPatterns.some((pattern) => matchUrlPattern(pattern, loc));
          if (!matches) return;
        }

        const pubDate =
          $(el).find("pubDate").text().trim() || $(el).find("updated").text().trim() || undefined;

        aggregatedUrls.push({
          loc,
          lastmod: pubDate,
        });
      });
    }
  }
}
