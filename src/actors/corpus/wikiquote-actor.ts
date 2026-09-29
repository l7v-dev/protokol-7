/**
 * WikiquoteActor - Quotations, Aphorisms & Proverbs Harvester — protokol-7
 *
 * Interfaces with official Wikimedia Wikiquote REST and Action API endpoints
 * across 90+ language editions to extract verified quotes, literary dialogue,
 * philosophical aphorisms, historical speeches, and proverbs converted to GFM markdown.
 * Conforms to docs/actor-contract.md.
 */

import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ActorType,
  IActor,
  WikiquoteActorResult,
  WikiquoteActorTaskOptions,
  WikiquoteArticleItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 10;
const DEFAULT_LANG = "en";

export class WikiquoteActor implements IActor<WikiquoteActorResult> {
  readonly actorType: ActorType = "wikiquote";
  readonly description =
    "Queries official Wikimedia Wikiquote REST and Action APIs across 90+ languages for verified quotes, proverbs, aphorisms, and speeches.";

  private readonly turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });

    this.turndown.remove(["script", "style", "noscript"]);

    // Strip edit sections, reference markers, print-only elements, and navigation boxes
    this.turndown.addRule("wikiquoteStripNoise", {
      filter: (node) => {
        const el = node as HTMLElement;
        return Boolean(
          el.classList &&
            (el.classList.contains("mw-editsection") ||
              el.classList.contains("noprint") ||
              el.classList.contains("navbox") ||
              el.classList.contains("mw-empty-elt") ||
              el.classList.contains("portal"))
        );
      },
      replacement: () => "",
    });

    // Format quotebox containers as clean blockquotes
    this.turndown.addRule("wikiquoteBox", {
      filter: (node) => {
        const el = node as HTMLElement;
        return Boolean(
          node.nodeName === "DIV" &&
            el.classList &&
            (el.classList.contains("quotebox") || el.classList.contains("quote"))
        );
      },
      replacement: (content) => `\n\n> ${content.trim().replace(/\n+/g, "\n> ")}\n\n`,
    });
  }

  async run(
    task: ActorTask,
    context?: ActorRunContext
  ): Promise<ActorResult<WikiquoteActorResult>> {
    const startTime = context?.startTime || Date.now();
    const taskOpts = task.options || {};
    const options: WikiquoteActorTaskOptions = (taskOpts.wikiquoteOptions ||
      taskOpts) as WikiquoteActorTaskOptions;
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork =
      process.env.NODE_ENV === "test" ||
      Boolean((task.options as Record<string, unknown> | undefined)?.allowLocalNetwork);

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

      // 2. Resolve parameters from targetUrl and options
      const { lang, title, action, query } = this.resolveParameters(task.targetUrl, options);
      const resolvedQueryUrl = this.buildApiUrl(
        task.targetUrl,
        lang,
        action,
        title,
        query,
        options.limit
      );

      // 3. SSRF validation on resolved endpoint
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

      // 4. Dispatch request
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; wikiquote-actor)",
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
          errorMessage: `Wikiquote API responded with status ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Parse response by action
      let items: WikiquoteArticleItem[] = [];

      if (action === "article") {
        const rawHtml = await response.text();
        const fullMarkdown = this.turndown.turndown(rawHtml);
        const resolvedTitle = title || "Unknown Title";

        items = [
          {
            title: resolvedTitle,
            url: this.buildCanonicalWebUrl(lang, resolvedTitle),
            fullMarkdown,
            rawHtml: options.fetchFullArticles ? rawHtml : undefined,
            extract: fullMarkdown.slice(0, 500),
            lang,
          },
        ];
      } else if (action === "search") {
        const searchJson = (await response.json()) as {
          pages?: Array<{
            id?: number;
            key?: string;
            title: string;
            excerpt?: string;
            description?: string;
            thumbnail?: { url?: string };
          }>;
        };

        const pages = searchJson.pages || [];

        if (options.fetchFullArticles && pages.length > 0) {
          const fetchLimit = Math.min(pages.length, options.limit || DEFAULT_LIMIT);
          for (let i = 0; i < fetchLimit; i++) {
            const page = pages[i];
            const pageTitle = page.key || page.title;
            const articleUrl = this.buildApiUrl(undefined, lang, "article", pageTitle);

            const pageCheck = await SSRFGuard.validateUrlWithDns(articleUrl, {
              allowLocalNetwork,
            });
            if (pageCheck.valid) {
              try {
                const artRes = await safeRedirectFetch(articleUrl, {
                  timeoutMs: Math.min(timeoutMs, 10_000),
                  allowLocalNetwork,
                  headers: {
                    "User-Agent":
                      "protokol-7/1.0 (+https://github.com/protokol-7; wikiquote-actor)",
                  },
                });
                if (artRes.ok) {
                  const rawHtml = await artRes.text();
                  items.push({
                    title: page.title,
                    url: this.buildCanonicalWebUrl(lang, page.title),
                    extract: page.excerpt ? this.stripHtmlTags(page.excerpt) : undefined,
                    description: page.description,
                    thumbnailUrl: page.thumbnail?.url ? `https:${page.thumbnail.url}` : undefined,
                    fullMarkdown: this.turndown.turndown(rawHtml),
                    lang,
                  });
                  continue;
                }
              } catch {
                // Fallback to search metadata
              }
            }

            items.push({
              title: page.title,
              url: this.buildCanonicalWebUrl(lang, page.title),
              extract: page.excerpt ? this.stripHtmlTags(page.excerpt) : undefined,
              description: page.description,
              thumbnailUrl: page.thumbnail?.url ? `https:${page.thumbnail.url}` : undefined,
              lang,
            });
          }
        } else {
          items = pages.map((p) => ({
            title: p.title,
            url: this.buildCanonicalWebUrl(lang, p.key || p.title),
            extract: p.excerpt ? this.stripHtmlTags(p.excerpt) : undefined,
            description: p.description,
            thumbnailUrl: p.thumbnail?.url ? `https:${pageThumbnail(p)}` : undefined,
            lang,
          }));
        }
      } else {
        // Default action: summary
        const summary = (await response.json()) as {
          title: string;
          extract?: string;
          description?: string;
          content_urls?: { desktop?: { page?: string } };
          thumbnail?: { source?: string };
          timestamp?: string;
        };

        items = [
          {
            title: summary.title,
            extract: summary.extract,
            description: summary.description,
            url:
              summary.content_urls?.desktop?.page || this.buildCanonicalWebUrl(lang, summary.title),
            thumbnailUrl: summary.thumbnail?.source,
            timestamp: summary.timestamp,
            lang,
          },
        ];
      }

      const markdown = this.renderMarkdownReport(items, lang, action);

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
          markdown,
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
   * Resolves language, title, action, and query from input parameters.
   */
  public resolveParameters(
    targetUrl: string | undefined,
    options: WikiquoteActorTaskOptions
  ): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  } {
    let lang = options.lang || DEFAULT_LANG;
    let title = options.title;
    let query = options.query;
    let action = options.action;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`);
        const host = parsed.hostname.toLowerCase();

        if (host.endsWith(".wikiquote.org")) {
          lang = host.split(".wikiquote.org")[0];
        }

        if (parsed.pathname.includes("/api/rest_v1/page/html/")) {
          action = "article";
          title = decodeURIComponent(
            parsed.pathname.replace(/.*\/api\/rest_v1\/page\/html\//, "").replace(/_/g, " ")
          );
        } else if (parsed.pathname.includes("/api/rest_v1/page/summary/")) {
          action = "summary";
          title = decodeURIComponent(
            parsed.pathname.replace(/.*\/api\/rest_v1\/page\/summary\//, "").replace(/_/g, " ")
          );
        } else if (parsed.pathname.includes("/search/page")) {
          action = "search";
          query = parsed.searchParams.get("q") || undefined;
        } else if (parsed.pathname.startsWith("/wiki/")) {
          title = decodeURIComponent(parsed.pathname.replace("/wiki/", "").replace(/_/g, " "));
        }
      } catch {
        if (!title && !query) {
          title = targetUrl;
        }
      }
    }

    if (!action) {
      if (query && !title) {
        action = "search";
      } else if (options.titles && options.titles.length > 0) {
        action = "article";
        title = options.titles[0];
      } else {
        action = "summary";
      }
    } else if (action === "article" && !title && options.titles && options.titles.length > 0) {
      title = options.titles[0];
    }

    return { lang, title, action, query };
  }

  /**
   * Builds the official Wikiquote REST endpoint URL.
   */
  public buildApiUrl(
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
        // Fallback to dynamic building
      }
    }

    const host = `${encodeURIComponent(lang || DEFAULT_LANG)}.wikiquote.org`;

    if (action === "article" && title) {
      return `https://${host}/api/rest_v1/page/html/${encodeURIComponent(title.replace(/ /g, "_"))}`;
    }

    if (action === "search" && (query || title)) {
      const q = encodeURIComponent(query || title || "");
      const l = Math.max(1, limit || DEFAULT_LIMIT);
      return `https://${host}/w/rest.php/v1/search/page?q=${q}&limit=${l}`;
    }

    // Default: summary
    const safeTitle = encodeURIComponent((title || "").replace(/ /g, "_"));
    return `https://${host}/api/rest_v1/page/summary/${safeTitle}`;
  }

  /**
   * Constructs user-facing canonical URL on Wikiquote.
   */
  public buildCanonicalWebUrl(lang: string, title: string): string {
    const host = `${encodeURIComponent(lang || DEFAULT_LANG)}.wikiquote.org`;
    return `https://${host}/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
  }

  private stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, "").trim();
  }

  private renderMarkdownReport(
    items: WikiquoteArticleItem[],
    lang: string,
    action: string
  ): string {
    const lines: string[] = [
      `# Wikiquote Quotations & Aphorisms Report (${lang.toUpperCase()})`,
      "",
      `- **Action:** \`${action}\``,
      `- **Total Items:** ${items.length}`,
      "",
      "## Quotation Catalog",
      "",
      "| Title | Language | URL | Extract / Description |",
      "|---|---|---|---|",
    ];

    for (const item of items) {
      const cleanExtract = (item.extract || item.description || "N/A")
        .replace(/[\r\n]+/g, " ")
        .slice(0, 100);
      lines.push(`| [${item.title}](${item.url}) | ${item.lang} | ${item.url} | ${cleanExtract} |`);
    }

    lines.push("");

    if (items.some((i) => i.fullMarkdown)) {
      lines.push("## Full Quotation Transcripts", "");
      for (const item of items) {
        if (item.fullMarkdown) {
          lines.push(`### ${item.title}`, "", item.fullMarkdown, "", "---", "");
        }
      }
    }

    return lines.join("\n");
  }
}

function pageThumbnail(page: { thumbnail?: { url?: string } }): string | undefined {
  if (!page.thumbnail?.url) return undefined;
  return page.thumbnail.url.replace(/^\/\//, "");
}
