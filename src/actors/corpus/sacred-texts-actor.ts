/**
 * SacredTextsActor - Internet Sacred Text Archive (ISTA) harvester.
 * Extracts comparative religion, mythology, classical folklore, alchemy,
 * and sacred texts across 1,700+ full-length books.
 * Conforms to docs/actor-contract.md and docs/actors/sacred-texts.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  SacredTextsAction,
  SacredTextsActorResult,
  SacredTextsActorTaskOptions,
  SacredTextsBookItem,
  SacredTextsFootnote,
  SacredTextsPassage,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const ISTA_BASE_URL = "https://www.sacred-texts.com";

export class SacredTextsActor implements IActor<SacredTextsActorResult> {
  readonly actorType = "sacred-texts" as const;
  readonly description =
    "Harvests full-text comparative religion, classical mythology, folklore, alchemy, and sacred philosophical treatises from the Internet Sacred Text Archive (ISTA).";

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      hr: "---",
    });
  }

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<SacredTextsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: SacredTextsActorTaskOptions =
      task.options?.sacredTextsOptions ||
      (task.options as unknown as SacredTextsActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF check on targetUrl if provided
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });
        if (!initialCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve parameters & action
      const resolved = this.resolveParameters(task.targetUrl, options);

      // 3. Build upstream URL
      const endpoint = this.buildEndpointUrl(task.targetUrl, resolved);

      // 4. Secondary SSRF check on resolved endpoint
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, {
        allowLocalNetwork,
      });
      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed for endpoint ${endpoint}: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Fetch content
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "User-Agent": USER_AGENT,
            ...(task.options?.headers || {}),
          },
          signal: controller.signal,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Internet Sacred Text Archive returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const html = await response.text();

      // 6. Parse response based on action
      const parsed = this.parseResponse(resolved.action, html, endpoint, resolved);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: parsed,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isAbort ? "timed_out" : "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves action, tradition, path, query, and limits.
   */
  resolveParameters(
    targetUrl: string | undefined,
    options: SacredTextsActorTaskOptions
  ): {
    action: SacredTextsAction;
    tradition: string;
    path: string;
    query?: string;
    limit: number;
  } {
    let action: SacredTextsAction = options.action || "text";
    let tradition = (options.tradition || "hin").toLowerCase().trim();
    let path = (options.path || "").trim();
    let query = options.query?.trim();
    const limit = Math.max(1, Math.min(options.limit || 30, 100));

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const pathname = parsed.pathname;

        // Check if tradition is present in the first path segment
        const segments = pathname.replace(/^\//, "").split("/");
        if (segments[0] && segments[0].length <= 5) {
          tradition = segments[0].toLowerCase();
        }

        if (pathname.endsWith("/index.htm") || pathname.endsWith("/index.html")) {
          action = options.action || "catalog";
          path = pathname;
        } else if (pathname.includes("/search")) {
          action = "search";
          query = parsed.searchParams.get("q") || query;
        } else {
          action = options.action || "text";
          path = pathname;
        }
      } catch {
        // Fall back to options
      }
    }

    if (!path) {
      if (action === "catalog") {
        path = `/${tradition}/index.htm`;
      } else if (action === "search") {
        query = query || "upanishads";
        path = `/search.htm`;
      } else {
        path = `/${tradition}/sbe01/sbe01003.htm`;
      }
    }

    return {
      action,
      tradition,
      path,
      query,
      limit,
    };
  }

  /**
   * Builds the upstream URL. In test mode, targetUrl is respected.
   */
  buildEndpointUrl(
    targetUrl: string | undefined,
    resolved: ReturnType<typeof this.resolveParameters>
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    const cleanPath = resolved.path.startsWith("/") ? resolved.path : `/${resolved.path}`;
    if (resolved.action === "search" && resolved.query) {
      const q = encodeURIComponent(resolved.query);
      return `${ISTA_BASE_URL}/search.htm?q=${q}`;
    }

    return `${ISTA_BASE_URL}${cleanPath}`;
  }

  /**
   * Parses the HTML response from Internet Sacred Text Archive.
   */
  parseResponse(
    action: SacredTextsAction,
    html: string,
    endpoint: string,
    resolved: ReturnType<typeof this.resolveParameters>
  ): SacredTextsActorResult {
    const $ = cheerio.load(html);

    if (action === "catalog" || action === "search") {
      const books = this.parseCatalog($, endpoint, resolved.tradition, resolved.limit);
      const markdown = this.renderCatalogMarkdown(books, resolved.tradition, resolved.query);
      return {
        action,
        queryUrl: endpoint,
        totalResults: books.length,
        books,
        markdown,
      };
    }

    // Default: text passage
    const passage = this.parseTextPassage($, endpoint, resolved.tradition);
    const markdown = this.renderPassageMarkdown(passage);
    return {
      action: "text",
      queryUrl: endpoint,
      totalResults: passage.content ? 1 : 0,
      passage,
      markdown,
    };
  }

  /**
   * Parses an individual book chapter, hymn, or passage.
   */
  private parseTextPassage(
    $: cheerio.CheerioAPI,
    endpoint: string,
    tradition: string
  ): SacredTextsPassage {
    // 1. Title and headers
    const titleCandidates = [
      $("h1").first().text().trim(),
      $("h2").first().text().trim(),
      $("h3").first().text().trim(),
      $("title").text().trim(),
    ];
    const pageTitle = titleCandidates.find((t) => t && t.length > 0) || "Sacred Text Passage";

    // 2. Author and translator
    let author: string | undefined;
    let translator: string | undefined;

    $("h3, h4, p").each((_, el) => {
      const text = $(el).text().trim();
      if (/by\s+([A-Z][a-zA-Z\s.,]+)/i.test(text) && !author) {
        const match = text.match(/by\s+([A-Z][a-zA-Z\s.,]+)/i);
        if (match?.[1]) {
          author = match[1].trim();
        }
      }
      if (/translated\s+by\s+([A-Z][a-zA-Z\s.,]+)/i.test(text) && !translator) {
        const match = text.match(/translated\s+by\s+([A-Z][a-zA-Z\s.,]+)/i);
        if (match?.[1]) {
          translator = match[1].trim();
        }
      }
    });

    // 3. Navigation links (Next, Previous, Index)
    let nextUrl: string | undefined;
    let prevUrl: string | undefined;

    $("a").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      const href = $(el).attr("href");
      if (href) {
        if (text === "next" || text.includes("next page") || text === ">>") {
          nextUrl = this.resolveRelativeUrl(endpoint, href);
        } else if (text === "previous" || text.includes("prev") || text === "<<") {
          prevUrl = this.resolveRelativeUrl(endpoint, href);
        }
      }
    });

    // 4. Footnotes
    const footnotes: SacredTextsFootnote[] = [];
    const seenFootnoteIds = new Set<string>();

    if ($("div.footnotes p").length > 0) {
      $("div.footnotes p").each((idx, el) => {
        const node = $(el);
        const anchor = node.find("a[name], a[id]");
        const fnId = anchor.attr("name") || anchor.attr("id") || `fn-${idx + 1}`;
        const text = node.text().replace(/\s+/g, " ").trim();
        if (text && !seenFootnoteIds.has(fnId)) {
          seenFootnoteIds.add(fnId);
          footnotes.push({
            id: fnId,
            number: idx + 1,
            text: text.replace(/^\[?\d+\]?:?\s*/, ""),
          });
        }
      });
    } else {
      $("a[name^='fn_'], a[id^='fn_']").each((idx, el) => {
        const node = $(el);
        const fnId = node.attr("name") || node.attr("id") || `fn-${idx + 1}`;
        const parent = node.parent();
        const text = (parent.is("p") ? parent.text() : node.text()).replace(/\s+/g, " ").trim();
        if (text && !seenFootnoteIds.has(fnId)) {
          seenFootnoteIds.add(fnId);
          footnotes.push({
            id: fnId,
            number: idx + 1,
            text: text.replace(/^\[?\d+\]?:?\s*/, ""),
          });
        }
      });
    }

    // 5. Clean main content
    const bodyClone = $("body").clone();
    // Remove navigation banners, header advertisements, footer links, script, style
    bodyClone
      .find(
        "script, style, noscript, nav, header, footer, table[align='center'], .center_banner, #footer"
      )
      .remove();

    // Convert body content to Markdown
    const bodyHtml = bodyClone.html() || "";
    let contentMarkdown = this.turndown.turndown(bodyHtml).trim();

    // If turndown produced empty string, fall back to cleaned text
    if (!contentMarkdown) {
      contentMarkdown = bodyClone.text().replace(/\s+/g, " ").trim();
    }

    return {
      title: pageTitle,
      author,
      translator,
      tradition,
      subPath: endpoint,
      content: contentMarkdown,
      footnotes: footnotes.length > 0 ? footnotes : undefined,
      nextUrl,
      prevUrl,
    };
  }

  /**
   * Parses tradition index page for list of books and links.
   */
  private parseCatalog(
    $: cheerio.CheerioAPI,
    endpoint: string,
    tradition: string,
    limit: number
  ): SacredTextsBookItem[] {
    const books: SacredTextsBookItem[] = [];

    // Table rows or list items containing book links
    $("table tr, ul li, p").each((_, el) => {
      if (books.length >= limit) return;

      const node = $(el);
      const link = node.find("a").first();
      const href = link.attr("href");
      const title = link.text().trim();

      if (!href || !title) return;

      const cleanHref = href.toLowerCase();
      const isSelfIndex =
        cleanHref === "index.htm" ||
        cleanHref === "./index.htm" ||
        cleanHref === `/${tradition}/index.htm` ||
        cleanHref === `/index.htm`;

      if (
        !href.startsWith("#") &&
        !isSelfIndex &&
        title.length > 2 &&
        !["home", "search", "buy cd-rom", "next", "previous", "contents", "index"].includes(
          title.toLowerCase()
        )
      ) {
        const fullUrl = this.resolveRelativeUrl(endpoint, href);
        const nodeText = node.text().replace(/\s+/g, " ").trim();

        // Extract translator or author if in the same paragraph/row
        let author: string | undefined;
        let translator: string | undefined;
        let year: string | undefined;

        const trMatch = nodeText.match(/tr\.\s+by\s+([A-Za-z\s.,]+?)(?:\[|\(|$)/i);
        if (trMatch?.[1]) {
          translator = trMatch[1].trim();
        }

        const byMatch = nodeText.match(/by\s+([A-Za-z\s.,]+?)(?:,|\[|\(|$)/i);
        if (byMatch?.[1]) {
          author = byMatch[1].trim();
        }

        const yearMatch = nodeText.match(/\[(\d{4})\]/);
        if (yearMatch?.[1]) {
          year = yearMatch[1];
        }

        // Avoid duplicates
        if (!books.some((b) => b.url === fullUrl)) {
          books.push({
            title,
            author,
            translator,
            year,
            url: fullUrl,
            tradition,
            description: nodeText.length > title.length ? nodeText : undefined,
          });
        }
      }
    });

    return books;
  }

  /**
   * Resolves relative URLs based on base endpoint.
   */
  private resolveRelativeUrl(base: string, relative: string): string {
    try {
      return new URL(relative, base).href;
    } catch {
      return relative;
    }
  }

  /**
   * Renders passage as Markdown.
   */
  private renderPassageMarkdown(passage: SacredTextsPassage): string {
    const lines: string[] = [];

    lines.push(`# ${passage.title}`);
    if (passage.author) {
      lines.push(`**Author:** ${passage.author}`);
    }
    if (passage.translator) {
      lines.push(`**Translator:** ${passage.translator}`);
    }
    lines.push(`**Tradition:** \`${passage.tradition.toUpperCase()}\``);
    lines.push(`**Source:** ${passage.subPath || "-"}`);
    lines.push("");

    lines.push("## Text");
    lines.push("");
    lines.push(passage.content);
    lines.push("");

    if (passage.footnotes && passage.footnotes.length > 0) {
      lines.push("## Footnotes");
      lines.push("");
      for (const fn of passage.footnotes) {
        lines.push(`- **[${fn.number || fn.id}]**: ${fn.text}`);
      }
      lines.push("");
    }

    if (passage.prevUrl || passage.nextUrl) {
      lines.push("---");
      const nav: string[] = [];
      if (passage.prevUrl) nav.push(`[<< Previous](${passage.prevUrl})`);
      if (passage.nextUrl) nav.push(`[Next >>](${passage.nextUrl})`);
      lines.push(nav.join(" | "));
    }

    return lines.join("\n").trim();
  }

  /**
   * Renders book catalog as Markdown.
   */
  private renderCatalogMarkdown(
    books: SacredTextsBookItem[],
    tradition: string,
    query?: string
  ): string {
    const lines: string[] = [];

    const heading = query
      ? `Internet Sacred Text Archive Search: "${query}"`
      : `Internet Sacred Text Archive: ${tradition.toUpperCase()} Catalog`;

    lines.push(`# ${heading}`);
    lines.push(`Total books and treatises: ${books.length}`);
    lines.push("");

    if (books.length === 0) {
      lines.push("No texts found matching criteria.");
      return lines.join("\n");
    }

    lines.push("| Title | Author / Translator | Year | Link |");
    lines.push("|---|---|---|---|");

    for (const b of books) {
      const creator = b.translator ? `Tr. ${b.translator}` : b.author ? b.author : "-";
      const year = b.year || "-";
      lines.push(`| **${b.title}** | ${creator} | ${year} | [Read Text](${b.url}) |`);
    }

    return lines.join("\n").trim();
  }
}
