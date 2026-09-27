import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  SerpResultItem,
  SerpSearchResult,
  SerpSearchTaskOptions,
} from "../api/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_RESULTS = 10;

export class SerpSearchActor implements IActor<SerpSearchResult> {
  readonly actorType = "serp-search" as const;
  readonly description =
    "Organic search engine result page parser extracting rankings, URLs, snippets, and domains.";

  async run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<SerpSearchResult>> {
    const startTime = Date.now();
    const options: SerpSearchTaskOptions = task.options?.serpOptions ?? {};
    const timeoutMs = options.timeoutMs ?? task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

    // Determine query and target endpoint
    const rawTarget = (task.targetUrl || options.query || "").trim();
    const isHttp = rawTarget.startsWith("http://") || rawTarget.startsWith("https://");
    const query = isHttp
      ? new URL(rawTarget).searchParams.get("q") || options.query || rawTarget
      : options.query || rawTarget;

    const endpointUrl = isHttp
      ? rawTarget
      : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      const res = await safeRedirectFetch(endpointUrl, {
        timeoutMs,
        allowLocalNetwork,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });

      if (!res.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: res.status,
          errorMessage: `HTTP error ${res.status} fetching search results from ${endpointUrl}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const html = await res.text();
      const items = this.parseSerpHtml(html, maxResults);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          query,
          totalResults: items.length,
          items,
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
    }
  }

  parseSerpHtml(html: string, maxResults: number): SerpResultItem[] {
    const $ = cheerio.load(html);
    const items: SerpResultItem[] = [];

    $(".result").each((_i, el) => {
      if (items.length >= maxResults) return;
      if ($(el).hasClass("result--ad") || $(el).hasClass("result--no-result")) return;

      const titleEl = $(el).find(".result__title .result__a, .result__a, h2 a");
      const title = titleEl.text().trim();
      const rawHref = titleEl.attr("href") || "";

      if (!title || !rawHref) return;

      let cleanUrl = rawHref;
      if (cleanUrl.startsWith("//")) {
        cleanUrl = `https:${cleanUrl}`;
      }

      // Handle DuckDuckGo tracking redirect
      if (cleanUrl.includes("uddg=")) {
        try {
          const parsed = new URL(cleanUrl);
          const target = parsed.searchParams.get("uddg");
          if (target) {
            cleanUrl = decodeURIComponent(target);
          }
        } catch {
          // Keep raw cleanUrl
        }
      }

      let domain = "";
      try {
        domain = new URL(cleanUrl).hostname;
      } catch {
        // Leave empty if unparseable
      }

      const snippet = $(el).find(".result__snippet").text().trim();

      items.push({
        rank: items.length + 1,
        title,
        url: cleanUrl,
        domain,
        snippet,
      });
    });

    return items;
  }
}
