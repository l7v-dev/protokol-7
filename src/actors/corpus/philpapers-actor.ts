/**
 * PhilPapersActor - PhilPapers Archive philosophical citations,
 * abstracts, publication metadata, and category taxonomies harvester.
 * Conforms to docs/actor-contract.md and docs/actors/philpapers.md.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  PhilPapersActorResult,
  PhilPapersActorTaskOptions,
  PhilPapersCategoryDetails,
  PhilPapersRecord,
  PhilPapersSearchResultItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const PHILPAPERS_BASE_URL = "https://philpapers.org";

export class PhilPapersActor implements IActor<PhilPapersActorResult> {
  readonly actorType = "philpapers" as const;
  readonly description =
    "Harvests academic philosophy citations, abstracts, publication metadata, and category taxonomies from the PhilPapers Archive.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<PhilPapersActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: PhilPapersActorTaskOptions =
      task.options?.philpapersOptions ||
      (task.options as unknown as PhilPapersActorTaskOptions) ||
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
          errorMessage: `PhilPapers returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const html = await response.text();

      // 6. Parse response based on action
      const parsed = this.parseResponse(
        resolved.action,
        html,
        endpoint,
        resolved.id || "CHADCO",
        resolved.category || "epistemology"
      );

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
   * Resolves action, record id, query, category, and filters.
   */
  resolveParameters(
    targetUrl: string | undefined,
    options: PhilPapersActorTaskOptions
  ): {
    action: "record" | "search" | "category";
    id?: string;
    query?: string;
    category?: string;
    filterSubject?: string;
    startYear?: number;
    endYear?: number;
    limit: number;
  } {
    let action: "record" | "search" | "category" = options.action || "record";
    let id = options.id?.trim().toUpperCase();
    let query = options.query?.trim();
    let category = options.category?.trim().toLowerCase();
    const filterSubject = options.filterSubject?.trim();
    const startYear = options.startYear;
    const endYear = options.endYear;
    const limit = Math.max(1, Math.min(options.limit || 20, 100));

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const path = parsed.pathname;

        if (path.includes("/rec/")) {
          action = "record";
          const match = path.match(/\/rec\/([A-Za-z0-9_-]+)/);
          if (match?.[1]) {
            id = decodeURIComponent(match[1]).toUpperCase();
          }
        } else if (path.includes("/browse/")) {
          action = "category";
          const match = path.match(/\/browse\/([A-Za-z0-9_-]+)/);
          if (match?.[1]) {
            category = decodeURIComponent(match[1]).toLowerCase();
          }
        } else if (path.includes("/s/") || parsed.searchParams.has("query")) {
          action = "search";
          query = parsed.searchParams.get("query") || path.replace(/^\/s\//, "") || query;
        }
      } catch {
        // Fall back to options
      }
    }

    if (category && !id && !query) {
      action = "category";
    } else if (query && !id) {
      action = "search";
    } else if (!id) {
      id = "CHADCO";
    }

    return {
      action,
      id,
      query,
      category,
      filterSubject,
      startYear,
      endYear,
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
      const q = encodeURIComponent(resolved.query || "epistemology");
      return `${PHILPAPERS_BASE_URL}/s/${q}`;
    }

    if (resolved.action === "category") {
      const c = encodeURIComponent(resolved.category || "epistemology");
      return `${PHILPAPERS_BASE_URL}/browse/${c}`;
    }

    return `${PHILPAPERS_BASE_URL}/rec/${encodeURIComponent(resolved.id || "CHADCO")}`;
  }

  /**
   * Parses HTML into structured PhilPapersActorResult.
   */
  parseResponse(
    action: "record" | "search" | "category",
    html: string,
    endpoint: string,
    id: string,
    category: string
  ): PhilPapersActorResult {
    const $ = cheerio.load(html);

    if (action === "search") {
      const searchResults: PhilPapersSearchResultItem[] = [];
      $("li.entry, .pubEntry, .entry, div.item").each((_, el) => {
        const titleEl = $(el).find(".pubTitle a, .title a, a.pubTitle, h2 a, h3 a").first();
        const title = titleEl.text().trim();
        const href = titleEl.attr("href") || "";
        const authorsText = $(el).find(".pubAuthors, .authors, .author").text().trim();
        const authors = authorsText ? authorsText.split(/\s*,\s*|\s*;\s*/).filter(Boolean) : [];
        const pubText = $(el).find(".pubDetails, .pubInfo, .journal").text().trim();
        const yearMatch = pubText.match(/\b(19\d\d|20\d\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
        const snippet = $(el).find(".pubAbstract, .abstract, .snippet").text().trim();

        const matchId = href.match(/\/rec\/([A-Za-z0-9_-]+)/);
        const recordId = matchId
          ? matchId[1].toUpperCase()
          : href.replace(/[^A-Za-z0-9]/g, "").slice(0, 10);

        if (title) {
          searchResults.push({
            id: recordId,
            title,
            url: href.startsWith("http")
              ? href
              : `${PHILPAPERS_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`,
            authors,
            year,
            publication: pubText || undefined,
            snippet: snippet || undefined,
          });
        }
      });

      const markdown = [
        `# PhilPapers Search Results`,
        `**Query URL**: ${endpoint}`,
        `**Total Found**: ${searchResults.length}`,
        "",
        ...searchResults.map(
          (r, i) =>
            `${i + 1}. **${r.title}** (${r.year || "n.d."})\n` +
            `   - Authors: ${r.authors.join(", ") || "Unknown"}\n` +
            `   - Record: [${r.id}](${r.url})\n` +
            (r.publication ? `   - Published in: *${r.publication}*\n` : "") +
            (r.snippet ? `   > ${r.snippet}\n` : "")
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

    if (action === "category") {
      const title =
        $("h1, .pageTitle").first().text().trim() ||
        category.charAt(0).toUpperCase() + category.slice(1);
      const description = $(".catDescription, .category-desc, .description").first().text().trim();

      const subcategories: Array<{ name: string; url: string; count?: number }> = [];
      $(".subcategories a, .catTree a, ul.categories li a").each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr("href") || "";
        const countMatch = text.match(/\((\d+)\)/);
        const count = countMatch ? parseInt(countMatch[1], 10) : undefined;
        const cleanName = text.replace(/\s*\(\d+\)/, "").trim();

        if (cleanName && href.includes("/browse/")) {
          subcategories.push({
            name: cleanName,
            url: href.startsWith("http")
              ? href
              : `${PHILPAPERS_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`,
            count,
          });
        }
      });

      const topRecords: PhilPapersSearchResultItem[] = [];
      $("li.entry, .pubEntry, .entry").each((_, el) => {
        const titleEl = $(el).find(".pubTitle a, .title a, a.pubTitle").first();
        const recTitle = titleEl.text().trim();
        const href = titleEl.attr("href") || "";
        const authorsText = $(el).find(".pubAuthors, .authors").text().trim();
        const authors = authorsText ? authorsText.split(/\s*,\s*/).filter(Boolean) : [];
        const pubText = $(el).find(".pubDetails").text().trim();
        const yearMatch = pubText.match(/\b(19\d\d|20\d\d)\b/);
        const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

        if (recTitle) {
          const matchId = href.match(/\/rec\/([A-Za-z0-9_-]+)/);
          topRecords.push({
            id: matchId ? matchId[1].toUpperCase() : "",
            title: recTitle,
            url: href.startsWith("http")
              ? href
              : `${PHILPAPERS_BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`,
            authors,
            year,
            publication: pubText || undefined,
          });
        }
      });

      const categoryDetails: PhilPapersCategoryDetails = {
        category,
        title,
        url: endpoint,
        description: description || undefined,
        subcategories,
        topRecords,
      };

      const markdown = [
        `# PhilPapers Category: ${title}`,
        `**Category URL**: ${endpoint}`,
        description ? `\n${description}\n` : "",
        subcategories.length
          ? `## Subcategories (${subcategories.length})\n\n${subcategories
              .map((s) => `- [${s.name}](${s.url})${s.count ? ` (${s.count} works)` : ""}`)
              .join("\n")}\n`
          : "",
        topRecords.length
          ? `## Featured / Top Works\n\n${topRecords
              .map(
                (r, i) =>
                  `${i + 1}. **${r.title}** (${r.year || "n.d."}) - ${r.authors.join(", ") || "Unknown"} [Record](${r.url})`
              )
              .join("\n")}\n`
          : "",
      ].join("\n");

      return {
        action: "category",
        queryUrl: endpoint,
        totalResults: topRecords.length,
        categoryDetails,
        markdown,
      };
    }

    // Default: action === "record"
    const title =
      $(".pubTitle, h1.pubTitle, h1").first().text().trim() ||
      $("title")
        .text()
        .replace(/ - PhilPapers/i, "")
        .trim();

    // Authors
    const authors: string[] = [];
    $(".pubAuthors a, .pubAuthors span, .author a, .authors a").each((_, el) => {
      const text = $(el).text().trim();
      if (text && !authors.includes(text) && !text.includes("Author")) {
        authors.push(text);
      }
    });
    if (authors.length === 0) {
      const authorsText = $(".pubAuthors, .authors").text().trim();
      if (authorsText) {
        authorsText.split(/\s*,\s*|\s*;\s*|\s+and\s+/i).forEach((a) => {
          const clean = a.trim();
          if (clean && !authors.includes(clean)) authors.push(clean);
        });
      }
    }

    // Publication details
    const pubDetailsText = $(".pubDetails, .publication-details, .pubInfo").text().trim();
    const yearMatch = pubDetailsText.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

    // Abstract
    const abstractEl = $(".pubAbstract, .abstract, .abstract-text").first();
    const abstract = abstractEl.length ? abstractEl.text().trim() : undefined;

    // Categories
    const categories: string[] = [];
    $("a[href*='/browse/'], .catLink").each((_, el) => {
      const cat = $(el).text().trim();
      if (cat && !categories.includes(cat) && !cat.toLowerCase().includes("browse")) {
        categories.push(cat);
      }
    });

    // DOI and Direct Link
    let doi: string | undefined;
    let directLink: string | undefined;
    $("a[href*='doi.org']").each((_, el) => {
      const href = $(el).attr("href");
      if (href && !doi) doi = href;
    });

    $("a.download, a.externalLink, .oa-link a").each((_, el) => {
      const href = $(el).attr("href");
      if (href?.startsWith("http") && !href.includes("philpapers.org")) {
        directLink = href;
      }
    });

    const openAccess =
      $(".oaBadge, .open-access, .freeAccess, a.download, a[href*='download'], a[href*='.pdf']")
        .length > 0 || html.includes("Open Access");

    const fullMarkdown = [
      `# ${title}`,
      authors.length ? `**Author(s)**: ${authors.join(", ")}` : "",
      year ? `**Year**: ${year}` : "",
      pubDetailsText ? `**Publication**: ${pubDetailsText}` : "",
      doi ? `**DOI**: [${doi}](${doi})` : "",
      `**PhilPapers ID**: \`${id}\``,
      `**URL**: ${endpoint}`,
      openAccess ? `**Access**: Open Access` : `**Access**: Subscription / Closed`,
      "",
      abstract ? `## Abstract\n\n${abstract}\n` : "",
      categories.length ? `## Categories\n\n${categories.map((c) => `- ${c}`).join("\n")}\n` : "",
    ]
      .filter((s) => s.length > 0)
      .join("\n");

    const record: PhilPapersRecord = {
      id: id || "CHADCO",
      title,
      url: endpoint,
      authors,
      year,
      publication: pubDetailsText || undefined,
      abstract,
      categories,
      doi,
      directLink,
      openAccess,
      markdown: fullMarkdown,
    };

    return {
      action: "record",
      queryUrl: endpoint,
      totalResults: 1,
      record,
      markdown: fullMarkdown,
    };
  }
}
