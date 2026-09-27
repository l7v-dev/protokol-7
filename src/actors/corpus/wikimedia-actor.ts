/**
 * WikimediaActor - Encyclopedic factual knowledge retrieval actor.
 * Interfaces with official Wikimedia REST API v1 endpoints across all language editions
 * to fetch clean summaries, full Parsoid HTML converted to GFM markdown, and page search.
 */

import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  WikimediaActorResult,
  WikimediaActorTaskOptions,
  WikimediaArticleItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_LANG = "en";

export class WikimediaActor implements IActor<WikimediaActorResult> {
  readonly actorType = "wikimedia" as const;
  readonly description =
    "Queries official Wikimedia REST API v1 for clean encyclopedic summaries, full articles as GFM markdown, and page search.";

  private readonly turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });

    // Strip edit sections, reference sup tags, and script/style tags
    this.turndown.remove(["script", "style", "noscript"]);
  }

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikimediaActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: WikimediaActorTaskOptions = task.options?.wikimediaOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if explicitly provided as HTTP URL
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve language and title from targetUrl or options
      const { lang, title, action, query } = this.resolveParameters(task.targetUrl, options);
      const resolvedQueryUrl = this.buildApiUrl(
        task.targetUrl,
        lang,
        action,
        title,
        query,
        options.limit
      );

      // 3. Validate endpoint against SSRF policy
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(resolvedQueryUrl, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 3. Dispatch HTTP request with abort controller
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; wikimedia-actor)",
            Accept: "application/json, text/html, */*",
          },
        });
      } finally {
        clearTimeout(timeoutTimer);
      }

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Wikimedia API returned HTTP error ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 4. Parse response according to requested action
      let items: WikimediaArticleItem[] = [];

      if (action === "article") {
        const html = await response.text();
        const markdown = this.turndown.turndown(html);
        const pageUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title || "")}`;

        items = [
          {
            title: title || "",
            url: pageUrl,
            markdown,
            lang,
          },
        ];
      } else if (action === "search") {
        const json = (await response.json()) as {
          pages?: Array<{
            id: number;
            key: string;
            title: string;
            excerpt?: string;
            description?: string;
            thumbnail?: { url?: string };
          }>;
        };

        const pages = json.pages || [];
        items = pages.map((p) => ({
          title: p.title,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.key || p.title)}`,
          extract: p.excerpt ? this.stripHtmlTags(p.excerpt) : undefined,
          description: p.description,
          thumbnailUrl: p.thumbnail?.url ? `https:${p.thumbnail.url}` : undefined,
          lang,
        }));
      } else {
        // Default action: summary
        const summary = (await response.json()) as {
          title: string;
          extract?: string;
          description?: string;
          content_urls?: { desktop?: { page?: string } };
          thumbnail?: { source?: string };
          coordinates?: { lat: number; lon: number };
          timestamp?: string;
        };

        items = [
          {
            title: summary.title,
            extract: summary.extract,
            description: summary.description,
            url:
              summary.content_urls?.desktop?.page ||
              `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(summary.title)}`,
            thumbnailUrl: summary.thumbnail?.source,
            coordinates: summary.coordinates,
            timestamp: summary.timestamp,
            lang,
          },
        ];
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: response.status,
        data: {
          lang,
          action,
          items,
          queryUrl: resolvedQueryUrl,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.includes("aborted") || msg.includes("timeout");
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        statusCode: isTimeout ? 408 : 500,
        errorMessage: msg,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves language, title, action, and query from task parameters or target URL.
   */
  private resolveParameters(
    targetUrl: string | undefined,
    options: WikimediaActorTaskOptions
  ): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  } {
    let lang = options.lang || DEFAULT_LANG;
    let title = options.title;
    let action = options.action;
    const query = options.query;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const hostParts = parsed.hostname.split(".");
        if (hostParts.length >= 3 && hostParts[1] === "wikipedia") {
          lang = hostParts[0];
        }

        if (parsed.pathname.startsWith("/wiki/")) {
          title = decodeURIComponent(parsed.pathname.replace("/wiki/", "").replace(/_/g, " "));
        }
      } catch {
        // Non-URL input treated as title or query
        if (!title && !query) {
          title = targetUrl;
        }
      }
    }

    if (!action) {
      if (query && !title) {
        action = "search";
      } else {
        action = "summary";
      }
    }

    return { lang, title, action, query };
  }

  /**
   * Builds the official Wikimedia REST endpoint URL.
   */
  private buildApiUrl(
    targetUrl: string | undefined,
    lang: string,
    action: "summary" | "article" | "search",
    title?: string,
    query?: string,
    limit?: number
  ): string {
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.pathname.includes("/api/rest_v1/") ||
          parsed.pathname.includes("/w/rest.php/v1/") ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          return targetUrl;
        }
      } catch {
        // Fallback to normal building
      }
    }

    const safeLang = encodeURIComponent(lang || DEFAULT_LANG);

    if (action === "article" && title) {
      return `https://${safeLang}.wikipedia.org/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    }

    if (action === "search" && (query || title)) {
      const q = encodeURIComponent(query || title || "");
      const l = Math.max(1, limit || DEFAULT_LIMIT);
      return `https://${safeLang}.wikipedia.org/w/rest.php/v1/search/page?q=${q}&limit=${l}`;
    }

    // Default: summary
    const safeTitle = encodeURIComponent((title || "").replace(/ /g, "_"));
    return `https://${safeLang}.wikipedia.org/api/rest_v1/page/summary/${safeTitle}`;
  }

  /**
   * Removes HTML tags from search excerpt snippets.
   */
  private stripHtmlTags(input: string): string {
    return input.replace(/<[^>]*>/g, "").trim();
  }
}
