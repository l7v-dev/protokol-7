/**
 * src/actors/corpus/libretexts-actor.ts
 *
 * LibreTexts Open STEM & Engineering Textbook Harvester.
 * Extracts peer-reviewed open textbooks, course chapters, hierarchical table of contents,
 * and scientific/engineering formulas across LibreTexts discipline libraries (chem, phys, math, bio, eng, etc.).
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  LibreTextsActorResult,
  LibreTextsActorTaskOptions,
  LibreTextsPageItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const DEFAULT_LIBRARY = "chem";
const KNOWN_LIBRARIES = new Set([
  "chem",
  "phys",
  "bio",
  "math",
  "eng",
  "med",
  "stats",
  "geo",
  "socialsci",
  "human",
  "biz",
  "workforce",
  "espanol",
  "k12",
]);

export class LibreTextsActor implements IActor<LibreTextsActorResult> {
  readonly actorType = "libretexts" as const;
  readonly description =
    "Extracts open-access STEM and engineering textbooks, course chapters, and formulas from LibreTexts.";

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      hr: "---",
    });

    // Preserve MathJax / LaTeX formulas cleanly
    this.turndown.addRule("latexFormula", {
      filter: (node) => {
        return Boolean(
          node.nodeName === "SPAN" &&
            (node.getAttribute("class")?.includes("mt-math") ||
              node.getAttribute("class")?.includes("MathJax"))
        );
      },
      replacement: (_content, node) => {
        const texAttr =
          node.getAttribute("data-tex") ||
          node.getAttribute("data-equation") ||
          node.textContent ||
          "";
        const trimmed = texAttr.trim();
        if (!trimmed) return "";
        return trimmed.startsWith("$") ? trimmed : `$${trimmed}$`;
      },
    });
  }

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<LibreTextsActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: LibreTextsActorTaskOptions =
      task.options?.libretextsOptions ||
      (task.options as unknown as LibreTextsActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation if targetUrl is provided
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

      // 2. Resolve Library and Base URL
      const library = this.resolveLibrary(task.targetUrl, options.library);
      const baseUrl = this.resolveBaseUrl(task.targetUrl, library);

      // 3. Resolve Action
      const action = this.resolveAction(task, options);

      // 4. Dispatch action
      switch (action) {
        case "search":
          return await this.handleSearch(
            task,
            options,
            library,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "subpages":
        case "toc":
          return await this.handleSubpages(
            task,
            options,
            library,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "page":
          return await this.handlePage(
            task,
            options,
            library,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        default:
          return await this.handlePage(
            task,
            options,
            library,
            baseUrl,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `LibreTexts extraction error: ${message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveLibrary(targetUrl?: string, specifiedLibrary?: string): string {
    if (specifiedLibrary?.trim()) {
      return specifiedLibrary.trim().toLowerCase();
    }
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const hostParts = parsed.hostname.split(".");
        if (hostParts.length >= 3 && hostParts[1] === "libretexts") {
          const candidate = hostParts[0].toLowerCase();
          if (KNOWN_LIBRARIES.has(candidate)) {
            return candidate;
          }
        }
      } catch {
        // Fall back to default
      }
    }
    return DEFAULT_LIBRARY;
  }

  private resolveBaseUrl(targetUrl?: string, library = DEFAULT_LIBRARY): string {
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        return `${parsed.protocol}//${parsed.host}`;
      } catch {
        // Fall back
      }
    }
    return `https://${library}.libretexts.org`;
  }

  private resolveAction(
    task: ActorTask,
    options: LibreTextsActorTaskOptions
  ): "page" | "search" | "subpages" | "toc" {
    if (options.action) {
      return options.action;
    }
    if (options.query) {
      return "search";
    }
    if (task.targetUrl?.includes("@api/deki/pages") && task.targetUrl?.includes("/subpages")) {
      return "subpages";
    }
    return "page";
  }

  private async handleSearch(
    task: ActorTask,
    options: LibreTextsActorTaskOptions,
    library: string,
    baseUrl: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<LibreTextsActorResult>> {
    const query = options.query?.trim() || "";
    if (!query) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: "Search action requires a non-empty 'query' parameter.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const queryUrl = `${baseUrl}/@api/deki/site/query?q=${encodeURIComponent(query)}&limit=${limit}`;

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(queryUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 403,
        errorMessage: `SSRF check failed for query URL: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(queryUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/xml, text/html, */*",
      },
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `LibreTexts search failed with HTTP status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const rawText = await response.text();
    const pages: LibreTextsPageItem[] = [];

    // Attempt JSON parsing if API returned JSON
    try {
      const parsed = JSON.parse(rawText);
      const items = Array.isArray(parsed)
        ? parsed
        : parsed.page
          ? Array.isArray(parsed.page)
            ? parsed.page
            : [parsed.page]
          : parsed.items || [];

      for (const item of items) {
        if (!item) continue;
        const pageTitle = item.title || item["@title"] || "Untitled Page";
        const pageId = item.id || item["@id"];
        const pageUri =
          item["uri.ui"] || item.uri || (pageId ? `${baseUrl}/@api/deki/pages/${pageId}` : baseUrl);
        const pageSummary = item.summary || item.snippet || "";

        pages.push({
          id: pageId,
          title: pageTitle,
          url: pageUri,
          library,
          summary: pageSummary,
        });
      }
    } catch {
      // Parse XML or HTML response using Cheerio
      const $ = cheerio.load(rawText, { xml: true });
      const xmlPages = $("page, item, result");

      if (xmlPages.length > 0) {
        xmlPages.each((_, el) => {
          const $el = $(el);
          const pageTitle =
            $el.find("title").text() || $el.attr("title") || $el.find("name").text();
          const pageId = $el.attr("id") || $el.find("id").text();
          const pageUri =
            $el.find("uri\\.ui").text() ||
            $el.find("uri").text() ||
            $el.attr("href") ||
            (pageId ? `${baseUrl}/@api/deki/pages/${pageId}` : baseUrl);
          const summary = $el.find("summary, snippet").text();

          if (pageTitle) {
            pages.push({
              id: pageId || undefined,
              title: pageTitle.trim(),
              url: pageUri.trim(),
              library,
              summary: summary ? summary.trim() : undefined,
            });
          }
        });
      } else {
        // Fallback HTML cheerio parsing
        const $html = cheerio.load(rawText);
        $html(".searchresults-item, .searchresult, li.result").each((_, el) => {
          const $el = $(el);
          const titleLink = $el.find("a").first();
          const title = titleLink.text().trim();
          const href = titleLink.attr("href") || "";
          const pageUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
          const summary = $el.find(".snippet, .summary, p").text().trim();

          if (title) {
            pages.push({
              title,
              url: pageUrl,
              library,
              summary: summary || undefined,
            });
          }
        });
      }
    }

    const markdown = this.renderSearchMarkdown(query, library, pages);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "search",
        library,
        queryUrl,
        totalResults: pages.length,
        pages,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handlePage(
    task: ActorTask,
    options: LibreTextsActorTaskOptions,
    library: string,
    baseUrl: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<LibreTextsActorResult>> {
    let targetUrl = task.targetUrl;

    if (!targetUrl) {
      if (options.pageId) {
        targetUrl = `${baseUrl}/@api/deki/pages/${encodeURIComponent(options.pageId)}/contents?mode=raw`;
      } else if (options.path) {
        const cleanPath = options.path.startsWith("/") ? options.path.slice(1) : options.path;
        targetUrl = `${baseUrl}/${cleanPath}`;
      } else {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Page action requires targetUrl, pageId, or path.",
          executionDurationMs: Date.now() - startTime,
        };
      }
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(targetUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 403,
        errorMessage: `SSRF check failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html, application/xhtml+xml, application/json, */*",
      },
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Failed to fetch LibreTexts page: HTTP ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    const title =
      $("#title").text().trim() ||
      $("h1.mt-title").text().trim() ||
      $("h1").first().text().trim() ||
      $("title")
        .text()
        .replace(/ - LibreTexts.*$/, "")
        .trim() ||
      "Untitled Chapter";

    // Extract breadcrumbs
    const breadcrumbs: string[] = [];
    $(".mt-breadcrumbs li, .breadcrumbs li, nav.breadcrumbs a").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text !== "/" && text !== ">") {
        breadcrumbs.push(text);
      }
    });

    // Extract main content container
    let contentEl = $(
      ".mt-content-container, #page-content, .deki-parsed-style, article, .page-body"
    ).first();
    if (!contentEl.length) {
      contentEl = $("body");
    }

    // Clean non-content elements
    contentEl
      .find(
        "script, style, noscript, nav, header, footer, .mt-action-link, .edit-link, .mt-feedback-container, .breadcrumbs, .mt-breadcrumbs"
      )
      .remove();

    // Extract subpages if present inside TOC listings
    const subpages: Array<{ id?: number | string; title: string; url: string }> = [];
    contentEl.find(".mt-listing-subpage a, .subpages-list a").each((_, el) => {
      const $a = $(el);
      const subTitle = $a.text().trim();
      const href = $a.attr("href") || "";
      if (subTitle && href) {
        const fullUrl = href.startsWith("http")
          ? href
          : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
        subpages.push({
          title: subTitle,
          url: fullUrl,
        });
      }
    });

    const contentHtml = contentEl.html() || "";
    const contentMarkdown = this.turndown.turndown(contentHtml).trim();

    const pageItem: LibreTextsPageItem = {
      id: options.pageId,
      title,
      url: targetUrl,
      library,
      path: options.path,
      contentMarkdown,
      contentHtml: options.includeHtml ? contentHtml : undefined,
      breadcrumbs: breadcrumbs.length > 0 ? breadcrumbs : undefined,
      subpages: subpages.length > 0 ? subpages : undefined,
    };

    const markdown = this.renderPageMarkdown(pageItem);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "page",
        library,
        queryUrl: targetUrl,
        totalResults: 1,
        page: pageItem,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleSubpages(
    task: ActorTask,
    options: LibreTextsActorTaskOptions,
    library: string,
    baseUrl: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<LibreTextsActorResult>> {
    let subpagesUrl = task.targetUrl;

    if (!subpagesUrl) {
      if (options.pageId) {
        subpagesUrl = `${baseUrl}/@api/deki/pages/${encodeURIComponent(options.pageId)}/subpages`;
      } else if (options.path) {
        subpagesUrl = `${baseUrl}/@api/deki/pages/=${encodeURIComponent(options.path)}/subpages`;
      } else {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Subpages action requires targetUrl, pageId, or path.",
          executionDurationMs: Date.now() - startTime,
        };
      }
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(subpagesUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 403,
        errorMessage: `SSRF check failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(subpagesUrl, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/xml, text/html, */*",
      },
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Failed to fetch subpages: HTTP ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const rawText = await response.text();
    const subpages: Array<{ id?: number | string; title: string; url: string }> = [];

    try {
      const parsed = JSON.parse(rawText);
      const items = Array.isArray(parsed)
        ? parsed
        : parsed["page.subpage"]
          ? Array.isArray(parsed["page.subpage"])
            ? parsed["page.subpage"]
            : [parsed["page.subpage"]]
          : parsed.subpages || [];

      for (const item of items) {
        if (!item) continue;
        const id = item.id || item["@id"];
        const title = item.title || item["@title"] || "Untitled Section";
        const url =
          item["uri.ui"] || item.uri || (id ? `${baseUrl}/@api/deki/pages/${id}` : baseUrl);
        subpages.push({ id, title, url });
      }
    } catch {
      const $ = cheerio.load(rawText, { xml: true });
      $("page, subpage, a").each((_, el) => {
        const $el = $(el);
        const title = $el.find("title").text().trim() || $el.attr("title") || $el.text().trim();
        const id = $el.attr("id") || $el.find("id").text().trim();
        const href = $el.find("uri\\.ui").text().trim() || $el.attr("href") || "";
        const url = href.startsWith("http")
          ? href
          : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;

        if (title) {
          subpages.push({
            id: id || undefined,
            title,
            url,
          });
        }
      });
    }

    const lines: string[] = [
      `# LibreTexts Table of Contents (${library.toUpperCase()})`,
      `Source URL: ${subpagesUrl}`,
      `Total Sections: ${subpages.length}`,
      "",
      "| # | Section Title | URL |",
      "|---|---------------|-----|",
    ];

    subpages.forEach((sub, idx) => {
      lines.push(`| ${idx + 1} | ${sub.title} | ${sub.url} |`);
    });

    const markdown = lines.join("\n");

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "subpages",
        library,
        queryUrl: subpagesUrl,
        totalResults: subpages.length,
        subpages,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private renderSearchMarkdown(
    query: string,
    library: string,
    pages: LibreTextsPageItem[]
  ): string {
    const lines: string[] = [
      `# LibreTexts Search Results: "${query}"`,
      `Library: ${library.toUpperCase()}`,
      `Total Found: ${pages.length}`,
      "",
    ];

    if (pages.length === 0) {
      lines.push("No matching chapters or textbooks found.");
      return lines.join("\n");
    }

    pages.forEach((p, idx) => {
      lines.push(`### ${idx + 1}. [${p.title}](${p.url})`);
      if (p.summary) {
        lines.push(`> ${p.summary}`);
      }
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  private renderPageMarkdown(page: LibreTextsPageItem): string {
    const lines: string[] = [
      `# ${page.title}`,
      `URL: ${page.url}`,
      `Library: ${page.library.toUpperCase()}`,
    ];

    if (page.breadcrumbs && page.breadcrumbs.length > 0) {
      lines.push(`Path: ${page.breadcrumbs.join(" > ")}`);
    }

    lines.push("", "---", "");

    if (page.contentMarkdown) {
      lines.push(page.contentMarkdown);
    } else {
      lines.push("_No chapter body text available._");
    }

    if (page.subpages && page.subpages.length > 0) {
      lines.push("", "## Sub-chapters & Sections", "");
      for (const sub of page.subpages) {
        lines.push(`- [${sub.title}](${sub.url})`);
      }
    }

    return lines.join("\n").trim();
  }
}
