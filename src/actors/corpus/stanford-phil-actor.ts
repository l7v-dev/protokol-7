/**
 * StanfordPhilActor - Stanford Encyclopedia of Philosophy (SEP) entries,
 * bibliographies, conceptual argumentation outlines, and search discovery harvester.
 * Conforms to docs/actor-contract.md and docs/actors/stanford-phil.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  StanfordPhilActorResult,
  StanfordPhilActorTaskOptions,
  StanfordPhilEntry,
  StanfordPhilSearchResultItem,
  StanfordPhilSection,
  StanfordPhilTableOfContentsItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const SEP_BASE_URL = "https://plato.stanford.edu";
const SEP_ENTRIES_URL = "https://plato.stanford.edu/entries";
const SEP_SEARCH_URL = "https://plato.stanford.edu/search/searcher.py";
const SEP_CONTENTS_URL = "https://plato.stanford.edu/contents.html";

export class StanfordPhilActor implements IActor<StanfordPhilActorResult> {
  readonly actorType = "stanford-phil" as const;
  readonly description =
    "Harvests peer-reviewed philosophical treatises, bibliographies, outlines, and concepts from the Stanford Encyclopedia of Philosophy (SEP).";

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
  ): Promise<ActorResult<StanfordPhilActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: StanfordPhilActorTaskOptions =
      task.options?.stanfordPhilOptions ||
      (task.options as unknown as StanfordPhilActorTaskOptions) ||
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
            Accept: "text/html,application/xhtml+xml",
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
          errorMessage: `Stanford Encyclopedia of Philosophy returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const html = await response.text();

      // 6. Parse response based on action
      const parsed = this.parseResponse(resolved.action, html, endpoint, resolved.slug);

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
   * Resolves action, slug, search query, letter, and limits.
   */
  resolveParameters(
    targetUrl: string | undefined,
    options: StanfordPhilActorTaskOptions
  ): {
    action: "entry" | "search" | "contents";
    slug: string;
    query?: string;
    letter?: string;
    limit: number;
    includeBibliography: boolean;
    includeRelated: boolean;
  } {
    let action: "entry" | "search" | "contents" = options.action || "entry";
    let slug = (options.slug || "").trim().toLowerCase();
    let query = options.query?.trim();
    let letter = options.letter?.trim().toLowerCase();
    const limit = Math.max(1, Math.min(options.limit || 20, 100));
    const includeBibliography = options.includeBibliography ?? true;
    const includeRelated = options.includeRelated ?? true;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.pathname.includes("/searcher.py")) {
          action = "search";
          query = parsed.searchParams.get("query") || query;
        } else if (parsed.pathname.includes("/contents.html")) {
          action = "contents";
        } else if (parsed.pathname.includes("/entries/")) {
          action = "entry";
          const segments = parsed.pathname
            .replace(/^\/entries\/?/, "")
            .replace(/\/$/, "")
            .split("/");
          if (segments[0]) {
            slug = decodeURIComponent(segments[0]);
          }
        }
      } catch {
        // Fall back to options
      }
    }

    if (!slug && !query && !letter) {
      if (action === "search") {
        query = "logic";
      } else if (action === "contents") {
        letter = "a";
      } else {
        slug = "goedel-incompleteness";
      }
    }

    return {
      action,
      slug,
      query,
      letter,
      limit,
      includeBibliography,
      includeRelated,
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

    if (resolved.action === "search") {
      const q = encodeURIComponent(resolved.query || "logic");
      return `${SEP_SEARCH_URL}?query=${q}`;
    }

    if (resolved.action === "contents") {
      return SEP_CONTENTS_URL;
    }

    return `${SEP_ENTRIES_URL}/${encodeURIComponent(resolved.slug)}/`;
  }

  /**
   * Parses HTML into structured StanfordPhilActorResult.
   */
  parseResponse(
    action: "entry" | "search" | "contents",
    html: string,
    endpoint: string,
    slug: string
  ): StanfordPhilActorResult {
    const $ = cheerio.load(html);

    if (action === "search") {
      const searchResults: StanfordPhilSearchResultItem[] = [];
      $(".result, div.search_result, .result_listing li").each((_, el) => {
        const titleEl = $(el).find("a").first();
        const title = titleEl.text().trim();
        const href = titleEl.attr("href") || "";
        const snippet = $(el).find(".snippet, p, span").not("a").text().trim();
        if (title && href) {
          const matchSlug = href.match(/\/entries\/([^/]+)\/?/);
          searchResults.push({
            title,
            slug: matchSlug ? matchSlug[1] : title.toLowerCase().replace(/\s+/g, "-"),
            url: href.startsWith("http")
              ? href
              : `${SEP_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`,
            snippet: snippet || undefined,
          });
        }
      });

      // Fallback if generic list items
      if (searchResults.length === 0) {
        $("ul li a").each((_, el) => {
          const href = $(el).attr("href") || "";
          if (href.includes("/entries/")) {
            const title = $(el).text().trim();
            const matchSlug = href.match(/\/entries\/([^/]+)\/?/);
            searchResults.push({
              title,
              slug: matchSlug ? matchSlug[1] : "",
              url: href.startsWith("http")
                ? href
                : `${SEP_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`,
            });
          }
        });
      }

      const markdown = [
        `# Stanford Encyclopedia of Philosophy Search Results`,
        `**Query URL**: ${endpoint}`,
        `**Total Found**: ${searchResults.length}`,
        "",
        ...searchResults.map(
          (r, i) =>
            `${i + 1}. [${r.title}](${r.url}) (\`${r.slug}\`)${r.snippet ? `\n   > ${r.snippet}` : ""}`
        ),
      ].join("\n");

      return {
        action: "search",
        queryUrl: endpoint,
        totalResults: searchResults.length,
        searchResults,
        markdown,
      };
    }

    if (action === "contents") {
      const contents: Array<{ slug: string; title: string; url: string }> = [];
      $("#content, #main-text, body")
        .find("a[href*='/entries/']")
        .each((_, el) => {
          const title = $(el).text().trim();
          const href = $(el).attr("href") || "";
          const matchSlug = href.match(/\/entries\/([^/]+)\/?/);
          if (title && matchSlug) {
            contents.push({
              title,
              slug: matchSlug[1],
              url: href.startsWith("http")
                ? href
                : `${SEP_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`,
            });
          }
        });

      const markdown = [
        `# Stanford Encyclopedia of Philosophy - Table of Contents`,
        `**Source URL**: ${endpoint}`,
        `**Entries Listed**: ${contents.length}`,
        "",
        ...contents.map((c, i) => `${i + 1}. [${c.title}](${c.url}) (\`${c.slug}\`)`),
      ].join("\n");

      return {
        action: "contents",
        queryUrl: endpoint,
        totalResults: contents.length,
        contents,
        markdown,
      };
    }

    // Default: action === "entry"
    const title =
      $("#auhead h1").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title")
        .text()
        .replace(/ - Stanford Encyclopedia of Philosophy/i, "")
        .trim();

    // Authors
    const authors: string[] = [];
    $("#auhead .author, #auhead a, #article-author, #author-info").each((_, el) => {
      const text = $(el).text().trim();
      if (
        text &&
        !authors.includes(text) &&
        !text.includes("Published") &&
        !text.includes("Revision")
      ) {
        authors.push(text);
      }
    });
    if (authors.length === 0) {
      const authorText = $("#auhead").text();
      const match = authorText.match(/by\s+([A-Z][a-zA-Z.\s-]+?)(?:\s+First published|\n|$)/i);
      if (match) {
        authors.push(match[1].trim());
      }
    }

    // Publication and revision dates
    const pubinfoText = $("#pubinfo").text() || $("#auhead").text();
    let pubDate: string | undefined;
    let revDate: string | undefined;
    const pubMatch = pubinfoText.match(/First published\s+([A-Za-z0-9,\s]+?)(?:;|\n|$)/i);
    if (pubMatch) pubDate = pubMatch[1].trim();
    const revMatch = pubinfoText.match(/substantive revision\s+([A-Za-z0-9,\s]+?)(?:;|\n|$)/i);
    if (revMatch) revDate = revMatch[1].trim();

    // Table of contents
    const tableOfContents: StanfordPhilTableOfContentsItem[] = [];
    $("#toc li a, .toc li a").each((_, el) => {
      const rawText = $(el).text().trim();
      const anchor = $(el).attr("href") || "";
      const match = rawText.match(/^([0-9.]+)\s+(.*)$/);
      if (match) {
        tableOfContents.push({
          sectionNumber: match[1],
          title: match[2],
          anchor,
        });
      } else if (rawText) {
        tableOfContents.push({
          title: rawText,
          anchor,
        });
      }
    });

    // Preamble (introduction before section 1)
    const preambleEl = $("#preamble, .preamble").first();
    const preamble = preambleEl.length ? preambleEl.text().trim() : undefined;

    // Sections
    const sections: StanfordPhilSection[] = [];
    const contentContainer = $("#main-text, #content, article").first();
    const targetRoot = contentContainer.length ? contentContainer : $("body");

    targetRoot.find("h2, h3").each((_, el) => {
      const headingText = $(el).text().trim();
      const level = el.tagName.toLowerCase() === "h2" ? 2 : 3;
      if (
        headingText &&
        !headingText.toLowerCase().includes("bibliography") &&
        !headingText.toLowerCase().includes("academic tools")
      ) {
        // Collect following siblings up to next heading
        const contentParts: string[] = [];
        let next = $(el).next();
        while (next.length && !next.is("h2, h3, #bib, #related-entries")) {
          if (next.is("p, blockquote, ul, ol, div.indent")) {
            contentParts.push(next.text().trim());
          }
          next = next.next();
        }
        sections.push({
          title: headingText,
          level,
          content: contentParts.filter(Boolean).join("\n\n"),
        });
      }
    });

    // Bibliography
    const bibliography: string[] = [];
    $("#bib li, #bibliography li").each((_, el) => {
      const text = $(el).text().trim();
      if (text) bibliography.push(text);
    });

    // Related entries
    const relatedEntries: Array<{ slug: string; title: string }> = [];
    $("#related-entries li a, .related-entries a").each((_, el) => {
      const text = $(el).text().trim();
      const href = $(el).attr("href") || "";
      const match = href.match(/\/entries\/([^/]+)\/?/);
      if (text && match) {
        relatedEntries.push({
          slug: match[1],
          title: text,
        });
      }
    });

    // Full Markdown Generation
    // Remove nav bars, footer, scripts, academic tools
    $("#nav, #footer, script, style, #article-copyright, #academic-tools").remove();
    const bodyHtml = targetRoot.html() || html;
    const bodyMarkdown = this.turndown.turndown(bodyHtml);

    const fullMarkdown = [
      `# ${title}`,
      authors.length ? `**Author(s)**: ${authors.join(", ")}` : "",
      pubDate ? `**First Published**: ${pubDate}` : "",
      revDate ? `**Substantive Revision**: ${revDate}` : "",
      `**URL**: ${endpoint}`,
      "",
      preamble ? `## Preamble\n\n${preamble}\n` : "",
      tableOfContents.length
        ? `## Outline / Contents\n\n${tableOfContents
            .map((t) => `- ${t.sectionNumber ? `${t.sectionNumber} ` : ""}${t.title}`)
            .join("\n")}\n`
        : "",
      "---",
      "",
      bodyMarkdown,
      "",
      bibliography.length
        ? `## Bibliography\n\n${bibliography.map((b) => `- ${b}`).join("\n")}\n`
        : "",
      relatedEntries.length
        ? `## Related Entries\n\n${relatedEntries
            .map(
              (r) => `- [${r.title}](https://plato.stanford.edu/entries/${r.slug}/) (\`${r.slug}\`)`
            )
            .join("\n")}\n`
        : "",
    ]
      .filter((s) => s.length > 0)
      .join("\n");

    const entry: StanfordPhilEntry = {
      slug: slug || "entry",
      title,
      url: endpoint,
      authors,
      pubDate,
      revDate,
      preamble,
      tableOfContents,
      sections,
      bibliography,
      relatedEntries,
      markdown: fullMarkdown,
    };

    return {
      action: "entry",
      queryUrl: endpoint,
      totalResults: 1,
      entry,
      markdown: fullMarkdown,
    };
  }
}
