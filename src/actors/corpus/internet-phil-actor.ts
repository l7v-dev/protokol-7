/**
 * InternetPhilActor - Internet Encyclopedia of Philosophy (IEP) peer-reviewed
 * articles, conceptual outlines, author attributions, and search discovery harvester.
 * Conforms to docs/actor-contract.md and docs/actors/internet-phil.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  InternetPhilActorResult,
  InternetPhilActorTaskOptions,
  InternetPhilEntry,
  InternetPhilSearchResultItem,
  InternetPhilSection,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const IEP_BASE_URL = "https://iep.utm.edu";

export class InternetPhilActor implements IActor<InternetPhilActorResult> {
  readonly actorType = "internet-phil" as const;
  readonly description =
    "Harvests peer-reviewed academic philosophy articles, outlines, and author attributions from the Internet Encyclopedia of Philosophy (IEP).";

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
  ): Promise<ActorResult<InternetPhilActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: InternetPhilActorTaskOptions =
      task.options?.internetPhilOptions ||
      (task.options as unknown as InternetPhilActorTaskOptions) ||
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
          errorMessage: `Internet Encyclopedia of Philosophy returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
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
   * Resolves action, slug, search query, and limits.
   */
  resolveParameters(
    targetUrl: string | undefined,
    options: InternetPhilActorTaskOptions
  ): {
    action: "entry" | "search";
    slug: string;
    query?: string;
    limit: number;
  } {
    let action: "entry" | "search" = options.action || "entry";
    let slug = (options.slug || "").trim().toLowerCase();
    let query = options.query?.trim();
    const limit = Math.max(1, Math.min(options.limit || 20, 100));

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.searchParams.has("s")) {
          action = "search";
          query = parsed.searchParams.get("s") || query;
        } else {
          const segments = parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, "").split("/");
          if (segments[0]) {
            action = "entry";
            slug = decodeURIComponent(segments[0]);
          }
        }
      } catch {
        // Fall back to options
      }
    }

    if (!slug && !query) {
      if (action === "search") {
        query = "logic";
      } else {
        slug = "goedel";
      }
    }

    return {
      action,
      slug,
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

    if (resolved.action === "search") {
      const q = encodeURIComponent(resolved.query || "logic");
      return `${IEP_BASE_URL}/?s=${q}`;
    }

    return `${IEP_BASE_URL}/${encodeURIComponent(resolved.slug)}/`;
  }

  /**
   * Parses HTML into structured InternetPhilActorResult.
   */
  parseResponse(
    action: "entry" | "search",
    html: string,
    endpoint: string,
    slug: string
  ): InternetPhilActorResult {
    const $ = cheerio.load(html);

    if (action === "search") {
      const searchResults: InternetPhilSearchResultItem[] = [];
      $("article, div.search-result, .entry-summary, div.post").each((_, el) => {
        const titleEl = $(el).find("h2 a, h3 a, .entry-title a").first();
        const title = titleEl.text().trim();
        const href = titleEl.attr("href") || "";
        const snippet = $(el).find(".entry-summary, p").not(".entry-title").first().text().trim();

        const matchSlug = href
          .replace(/https?:\/\/[^/]+/, "")
          .replace(/^\/+/, "")
          .replace(/\/+$/, "");
        if (title && href) {
          searchResults.push({
            title,
            slug: matchSlug || title.toLowerCase().replace(/\s+/g, "-"),
            url: href.startsWith("http")
              ? href
              : `${IEP_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`,
            snippet: snippet || undefined,
          });
        }
      });

      // Fallback: collect any article links inside main content
      if (searchResults.length === 0) {
        $("main a, #content a, .content a").each((_, el) => {
          const href = $(el).attr("href") || "";
          const title = $(el).text().trim();
          if (
            href.startsWith("http") &&
            href.includes("iep.utm.edu") &&
            title.length > 3 &&
            !href.includes("?s=")
          ) {
            const matchSlug = href
              .replace(/https?:\/\/[^/]+/, "")
              .replace(/^\/+/, "")
              .replace(/\/+$/, "");
            if (matchSlug && !searchResults.some((r) => r.slug === matchSlug)) {
              searchResults.push({
                title,
                slug: matchSlug,
                url: href,
              });
            }
          }
        });
      }

      const markdown = [
        `# Internet Encyclopedia of Philosophy Search Results`,
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

    // Default: action === "entry"
    const title =
      $(".entry-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      $("title")
        .text()
        .replace(/ \| Internet Encyclopedia of Philosophy/i, "")
        .trim();

    // Authors
    const authors: string[] = [];
    $(".author-info, .author, .byline, #author-info").each((_, el) => {
      const text = $(el).text().trim();
      if (text && !authors.includes(text)) {
        authors.push(text);
      }
    });

    // Check bottom Author Information section if empty
    if (authors.length === 0) {
      const authorHeading = $(
        "h3:contains('Author Information'), h2:contains('Author Information')"
      );
      if (authorHeading.length) {
        const nextP = authorHeading.next("p");
        if (nextP.length) {
          const authorText = nextP.text().split("\n")[0].trim();
          if (authorText) authors.push(authorText);
        }
      }
    }

    // Table of contents
    const tableOfContents: string[] = [];
    $("#toc_container li a, .toc-list a").each((_, el) => {
      const text = $(el).text().trim();
      if (text) tableOfContents.push(text);
    });

    // Sections
    const sections: InternetPhilSection[] = [];
    const contentContainer = $(".entry-content, article, #content").first();
    const targetRoot = contentContainer.length ? contentContainer : $("body");

    targetRoot.find("h2, h3, h4").each((_, el) => {
      const headingText = $(el).text().trim();
      const tagName = el.tagName.toLowerCase();
      const level = tagName === "h2" ? 2 : tagName === "h3" ? 3 : 4;

      if (
        headingText &&
        !headingText.toLowerCase().includes("table of contents") &&
        !headingText.toLowerCase().includes("author information") &&
        !headingText.toLowerCase().includes("references")
      ) {
        const contentParts: string[] = [];
        let next = $(el).next();
        while (next.length && !next.is("h2, h3, h4, #toc_container")) {
          if (next.is("p, blockquote, ul, ol, div")) {
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

    // References / Bibliography
    const references: string[] = [];
    const refHeading = $(
      "h2:contains('References and Further Reading'), h3:contains('References and Further Reading'), h2:contains('References'), h3:contains('References')"
    );
    if (refHeading.length) {
      let next = refHeading.next();
      while (next.length && !next.is("h2, h3, #author-info")) {
        if (next.is("ul, ol")) {
          next.find("li").each((_, li) => {
            const text = $(li).text().trim();
            if (text) references.push(text);
          });
        } else if (next.is("p")) {
          const text = next.text().trim();
          if (text) references.push(text);
        }
        next = next.next();
      }
    }

    // Full Markdown Generation
    // Remove navigation, scripts, styles, share buttons, footer
    $("#nav, #footer, script, style, .sharedaddy, .jp-relatedposts, #comments").remove();
    const bodyHtml = targetRoot.html() || html;
    const bodyMarkdown = this.turndown.turndown(bodyHtml);

    const fullMarkdown = [
      `# ${title}`,
      authors.length ? `**Author(s)**: ${authors.join(", ")}` : "",
      `**URL**: ${endpoint}`,
      "",
      tableOfContents.length
        ? `## Table of Contents\n\n${tableOfContents.map((t) => `- ${t}`).join("\n")}\n`
        : "",
      "---",
      "",
      bodyMarkdown,
      "",
      references.length
        ? `## References and Further Reading\n\n${references.map((r) => `- ${r}`).join("\n")}\n`
        : "",
    ]
      .filter((s) => s.length > 0)
      .join("\n");

    const entry: InternetPhilEntry = {
      slug: slug || "entry",
      title,
      url: endpoint,
      authors,
      tableOfContents,
      sections,
      references,
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
