/**
 * src/actors/corpus/semantic-scholar-actor.ts
 *
 * Semantic Scholar Academic Knowledge Graph Harvester.
 * Interacts with Semantic Scholar Graph API (S2AG) to extract peer-reviewed scholarly works,
 * AI-generated TLDR summaries, citation graphs, author profiles, and open-access PDF links.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  SemanticScholarActorResult,
  SemanticScholarActorTaskOptions,
  SemanticScholarAuthorItem,
  SemanticScholarPaperItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const S2_API_BASE = "https://api.semanticscholar.org/graph/v1";

const DEFAULT_PAPER_FIELDS =
  "paperId,corpusId,url,title,abstract,tldr,venue,year,referenceCount,citationCount,isOpenAccess,openAccessPdf,fieldsOfStudy,authors,publicationDate,externalIds";
const DEFAULT_SEARCH_FIELDS =
  "paperId,corpusId,url,title,abstract,tldr,venue,year,referenceCount,citationCount,isOpenAccess,openAccessPdf,authors,externalIds";
const DEFAULT_AUTHOR_FIELDS =
  "authorId,name,aliases,affiliations,homepage,paperCount,citationCount,hIndex,papers.title,papers.year";

interface RawS2Author {
  authorId?: string;
  name?: string;
  aliases?: string[];
  affiliations?: string[];
  homepage?: string;
  paperCount?: number;
  citationCount?: number;
  hIndex?: number;
  papers?: Array<{ paperId: string; title: string; year?: number }>;
}

interface RawS2Paper {
  paperId?: string;
  corpusId?: number;
  url?: string;
  title?: string;
  abstract?: string;
  tldr?: { text?: string } | string;
  venue?: string;
  year?: number;
  publicationDate?: string;
  referenceCount?: number;
  citationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdf?: { url?: string };
  fieldsOfStudy?: string[];
  authors?: Array<{ authorId?: string; name?: string }>;
  externalIds?: Record<string, string>;
  citedPaper?: RawS2Paper;
  citingPaper?: RawS2Paper;
}

export class SemanticScholarActor implements IActor<SemanticScholarActorResult> {
  readonly actorType = "semantic-scholar" as const;
  readonly description =
    "Queries scientific literature, citations, TLDR summaries, and paper graphs from Semantic Scholar Graph API.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<SemanticScholarActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: SemanticScholarActorTaskOptions =
      task.options?.semanticScholarOptions ||
      (task.options as unknown as SemanticScholarActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF check on targetUrl if provided
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

      // 2. Resolve Action & Base Endpoint
      const action = this.resolveAction(task, options);
      const apiBase = this.resolveApiBase(task.targetUrl);

      // 3. Dispatch Action
      switch (action) {
        case "search":
          return await this.handleSearch(
            task,
            options,
            apiBase,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "author":
          return await this.handleAuthor(
            task,
            options,
            apiBase,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "author_search":
          return await this.handleAuthorSearch(
            task,
            options,
            apiBase,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "citations":
        case "references":
          return await this.handleCitationsOrReferences(
            task,
            options,
            action,
            apiBase,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        case "paper":
          return await this.handlePaper(
            task,
            options,
            apiBase,
            startTime,
            timeoutMs,
            allowLocalNetwork
          );
        default:
          return await this.handlePaper(
            task,
            options,
            apiBase,
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
        errorMessage: `Semantic Scholar extraction error: ${message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveAction(
    task: ActorTask,
    options: SemanticScholarActorTaskOptions
  ): "paper" | "search" | "author" | "author_search" | "citations" | "references" {
    if (options.action) {
      return options.action;
    }
    if (options.authorId) {
      return "author";
    }
    if (options.query) {
      return "search";
    }
    if (task.targetUrl?.includes("/author/search")) {
      return "author_search";
    }
    if (task.targetUrl?.includes("/author/")) {
      return "author";
    }
    if (task.targetUrl?.includes("/search")) {
      return "search";
    }
    if (task.targetUrl?.includes("/citations")) {
      return "citations";
    }
    if (task.targetUrl?.includes("/references")) {
      return "references";
    }
    return "paper";
  }

  private resolveApiBase(targetUrl?: string): string {
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        // If testing against mock server, preserve path up to base or host
        if (parsed.pathname.includes("/graph/v1")) {
          return `${parsed.protocol}//${parsed.host}/graph/v1`;
        }
        return `${parsed.protocol}//${parsed.host}`;
      } catch {
        // Fall back
      }
    }
    return S2_API_BASE;
  }

  private resolvePaperId(targetUrl?: string, specifiedPaperId?: string): string {
    if (specifiedPaperId?.trim()) {
      return specifiedPaperId.trim();
    }
    if (targetUrl) {
      // Check for DOI or ArXiv or S2 ID inside targetUrl
      const s2Match = targetUrl.match(/\/paper\/([0-9a-fA-F]{40})/);
      if (s2Match) return s2Match[1];

      const generalMatch = targetUrl.match(/\/paper\/([^/?#]+)/);
      if (generalMatch && generalMatch[1] !== "search") {
        return generalMatch[1];
      }

      // Check URL query parameters
      try {
        const parsed = new URL(targetUrl);
        const qId = parsed.searchParams.get("paperId");
        if (qId) return qId;
      } catch {
        // Fall back
      }
    }
    return "";
  }

  private getAuthHeaders(apiKey?: string): Record<string, string> {
    const key = apiKey || process.env.SEMANTIC_SCHOLAR_API_KEY;
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    };
    if (key) {
      headers["x-api-key"] = key;
    }
    return headers;
  }

  private normalizePaper(raw: RawS2Paper): SemanticScholarPaperItem {
    const paperId = raw.paperId || "";
    const title = raw.title || "Untitled Paper";
    const url = raw.url || `https://www.semanticscholar.org/paper/${paperId}`;
    const abstract = raw.abstract || undefined;

    let tldr: string | undefined;
    if (typeof raw.tldr === "string") {
      tldr = raw.tldr;
    } else if (raw.tldr && typeof raw.tldr === "object" && raw.tldr.text) {
      tldr = raw.tldr.text;
    }

    const authors = raw.authors
      ? raw.authors
          .map((a) => ({ authorId: a.authorId, name: a.name || "Unknown Author" }))
          .filter((a) => Boolean(a.name))
      : undefined;

    return {
      paperId,
      corpusId: raw.corpusId,
      title,
      url,
      abstract,
      tldr,
      venue: raw.venue || undefined,
      year: raw.year || undefined,
      publicationDate: raw.publicationDate || undefined,
      authors: authors && authors.length > 0 ? authors : undefined,
      citationCount: raw.citationCount,
      referenceCount: raw.referenceCount,
      isOpenAccess: raw.isOpenAccess,
      openAccessPdfUrl: raw.openAccessPdf?.url || undefined,
      fieldsOfStudy: raw.fieldsOfStudy || undefined,
      externalIds: raw.externalIds || undefined,
    };
  }

  private async handlePaper(
    task: ActorTask,
    options: SemanticScholarActorTaskOptions,
    apiBase: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<SemanticScholarActorResult>> {
    let paperUrl = task.targetUrl;

    if (!paperUrl?.includes("/paper/")) {
      const paperId = this.resolvePaperId(task.targetUrl, options.paperId);
      if (!paperId) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Paper action requires a valid paperId, DOI, ArXiv ID, or targetUrl.",
          executionDurationMs: Date.now() - startTime,
        };
      }
      const fields = options.fields || DEFAULT_PAPER_FIELDS;
      paperUrl = `${apiBase}/paper/${encodeURIComponent(paperId)}?fields=${fields}`;
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(paperUrl, { allowLocalNetwork });
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

    const response = await safeRedirectFetch(paperUrl, {
      method: "GET",
      headers: this.getAuthHeaders(options.apiKey),
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Semantic Scholar paper fetch failed with status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const raw: RawS2Paper = await response.json();
    const paper = this.normalizePaper(raw);
    const markdown = this.renderPaperMarkdown(paper);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "paper",
        queryUrl: paperUrl,
        totalResults: 1,
        paper,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleSearch(
    task: ActorTask,
    options: SemanticScholarActorTaskOptions,
    apiBase: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<SemanticScholarActorResult>> {
    const query = options.query?.trim() || "";
    if (!query && !task.targetUrl?.includes("query=")) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: "Search action requires a non-empty 'query' parameter.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const limit = Math.min(Math.max(options.limit || 10, 1), 100);
    const offset = Math.max(options.offset || 0, 0);
    const fields = options.fields || DEFAULT_SEARCH_FIELDS;

    let searchUrl = task.targetUrl;
    if (!searchUrl?.includes("/search")) {
      searchUrl = `${apiBase}/paper/search?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&fields=${fields}`;
      if (options.year) {
        searchUrl += `&year=${encodeURIComponent(options.year)}`;
      }
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(searchUrl, { allowLocalNetwork });
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

    const response = await safeRedirectFetch(searchUrl, {
      method: "GET",
      headers: this.getAuthHeaders(options.apiKey),
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Semantic Scholar search failed with status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const result = await response.json();
    const rawList: RawS2Paper[] = Array.isArray(result) ? result : result.data || [];
    const totalResults = typeof result.total === "number" ? result.total : rawList.length;
    const nextOffset = result.next;

    const papers = rawList.map((r) => this.normalizePaper(r));
    const markdown = this.renderSearchMarkdown(query, papers, totalResults);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "search",
        queryUrl: searchUrl,
        totalResults,
        offset,
        next: nextOffset,
        papers,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleAuthor(
    task: ActorTask,
    options: SemanticScholarActorTaskOptions,
    apiBase: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<SemanticScholarActorResult>> {
    let authorUrl = task.targetUrl;

    if (!authorUrl?.includes("/author/")) {
      const authorId = options.authorId?.trim();
      if (!authorId) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: "Author action requires authorId or targetUrl.",
          executionDurationMs: Date.now() - startTime,
        };
      }
      const fields = options.fields || DEFAULT_AUTHOR_FIELDS;
      authorUrl = `${apiBase}/author/${encodeURIComponent(authorId)}?fields=${fields}`;
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(authorUrl, { allowLocalNetwork });
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

    const response = await safeRedirectFetch(authorUrl, {
      method: "GET",
      headers: this.getAuthHeaders(options.apiKey),
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Semantic Scholar author fetch failed with status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const raw: RawS2Author = await response.json();
    const author: SemanticScholarAuthorItem = {
      authorId: raw.authorId || options.authorId || "",
      name: raw.name || "Unknown Author",
      aliases: raw.aliases,
      affiliations: raw.affiliations,
      homepage: raw.homepage,
      paperCount: raw.paperCount,
      citationCount: raw.citationCount,
      hIndex: raw.hIndex,
      papers: raw.papers,
    };

    const markdown = this.renderAuthorMarkdown(author);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "author",
        queryUrl: authorUrl,
        totalResults: 1,
        author,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleAuthorSearch(
    task: ActorTask,
    options: SemanticScholarActorTaskOptions,
    apiBase: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<SemanticScholarActorResult>> {
    const query = options.query?.trim() || "";
    if (!query && !task.targetUrl?.includes("query=")) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: "Author search requires a non-empty 'query' parameter.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const limit = Math.min(Math.max(options.limit || 10, 1), 100);
    const offset = Math.max(options.offset || 0, 0);

    let searchUrl = task.targetUrl;
    if (!searchUrl?.includes("/author/search")) {
      searchUrl = `${apiBase}/author/search?query=${encodeURIComponent(query)}&offset=${offset}&limit=${limit}&fields=authorId,name,affiliations,paperCount,citationCount,hIndex`;
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(searchUrl, { allowLocalNetwork });
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

    const response = await safeRedirectFetch(searchUrl, {
      method: "GET",
      headers: this.getAuthHeaders(options.apiKey),
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Semantic Scholar author search failed with status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const result = await response.json();
    const rawList: RawS2Author[] = Array.isArray(result) ? result : result.data || [];
    const totalResults = typeof result.total === "number" ? result.total : rawList.length;

    const authors: SemanticScholarAuthorItem[] = rawList.map((raw) => ({
      authorId: raw.authorId || "",
      name: raw.name || "Unknown Author",
      affiliations: raw.affiliations,
      paperCount: raw.paperCount,
      citationCount: raw.citationCount,
      hIndex: raw.hIndex,
    }));

    const lines: string[] = [
      `# Semantic Scholar Author Search: "${query}"`,
      `Total Authors: ${totalResults}`,
      "",
      "| # | Name | Author ID | Affiliations | Papers | Citations | h-index |",
      "|---|------|-----------|--------------|--------|-----------|---------|",
    ];

    authors.forEach((a, idx) => {
      lines.push(
        `| ${idx + 1} | ${a.name} | \`${a.authorId}\` | ${(a.affiliations || []).join(", ") || "N/A"} | ${a.paperCount ?? "N/A"} | ${a.citationCount ?? "N/A"} | ${a.hIndex ?? "N/A"} |`
      );
    });

    const markdown = lines.join("\n");

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action: "author_search",
        queryUrl: searchUrl,
        totalResults,
        offset,
        authors,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleCitationsOrReferences(
    task: ActorTask,
    options: SemanticScholarActorTaskOptions,
    action: "citations" | "references",
    apiBase: string,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<SemanticScholarActorResult>> {
    const paperId = this.resolvePaperId(task.targetUrl, options.paperId);
    if (!paperId) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: `${action} action requires a valid paperId or targetUrl.`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const offset = Math.max(options.offset || 0, 0);

    let queryUrl = task.targetUrl;
    if (!queryUrl?.includes(`/${action}`)) {
      queryUrl = `${apiBase}/paper/${encodeURIComponent(paperId)}/${action}?offset=${offset}&limit=${limit}&fields=paperId,title,year,authors,citationCount`;
    }

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(queryUrl, { allowLocalNetwork });
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

    const response = await safeRedirectFetch(queryUrl, {
      method: "GET",
      headers: this.getAuthHeaders(options.apiKey),
      timeoutMs,
      allowLocalNetwork,
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `Semantic Scholar ${action} fetch failed with status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const result = await response.json();
    const rawList: Array<RawS2Paper & { citingPaper?: RawS2Paper; citedPaper?: RawS2Paper }> =
      Array.isArray(result) ? result : result.data || [];

    const papers: SemanticScholarPaperItem[] = rawList.map((item) => {
      // S2 citations endpoint returns items with `citingPaper`, references with `citedPaper`
      const raw = item.citingPaper || item.citedPaper || item;
      return this.normalizePaper(raw);
    });

    const lines: string[] = [
      `# Semantic Scholar Paper ${action === "citations" ? "Citations" : "References"}: ${paperId}`,
      `Total ${action}: ${papers.length}`,
      "",
      "| # | Title | Year | Authors | Citations |",
      "|---|-------|------|---------|-----------|",
    ];

    papers.forEach((p, idx) => {
      const authorNames = (p.authors || []).map((a) => a.name).join(", ") || "N/A";
      lines.push(
        `| ${idx + 1} | [${p.title}](${p.url}) | ${p.year ?? "N/A"} | ${authorNames} | ${p.citationCount ?? "N/A"} |`
      );
    });

    const markdown = lines.join("\n");

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        action,
        queryUrl,
        totalResults: papers.length,
        offset,
        papers,
        markdown,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private renderPaperMarkdown(paper: SemanticScholarPaperItem): string {
    const lines: string[] = [
      `# ${paper.title}`,
      `URL: ${paper.url}`,
      `S2 Paper ID: \`${paper.paperId}\``,
    ];

    if (paper.authors && paper.authors.length > 0) {
      lines.push(`- **Authors:** ${paper.authors.map((a) => a.name).join(", ")}`);
    }
    if (paper.venue) {
      lines.push(`- **Venue:** ${paper.venue}`);
    }
    if (paper.year) {
      lines.push(`- **Year:** ${paper.year}`);
    }
    if (paper.publicationDate) {
      lines.push(`- **Publication Date:** ${paper.publicationDate}`);
    }
    if (paper.citationCount !== undefined) {
      lines.push(
        `- **Citations:** ${paper.citationCount} | **References:** ${paper.referenceCount ?? "N/A"}`
      );
    }
    if (paper.openAccessPdfUrl) {
      lines.push(`- **Open Access PDF:** [Download PDF](${paper.openAccessPdfUrl})`);
    }

    if (paper.externalIds) {
      const extList = Object.entries(paper.externalIds)
        .map(([k, v]) => `**${k}:** \`${v}\``)
        .join(" | ");
      lines.push(`- **Identifiers:** ${extList}`);
    }

    if (paper.tldr) {
      lines.push("", "### AI TLDR Summary", `> ${paper.tldr}`);
    }

    lines.push("", "---", "");

    if (paper.abstract) {
      lines.push("## Abstract", "", paper.abstract);
    } else {
      lines.push("_No abstract available._");
    }

    return lines.join("\n").trim();
  }

  private renderSearchMarkdown(
    query: string,
    papers: SemanticScholarPaperItem[],
    totalResults: number
  ): string {
    const lines: string[] = [
      `# Semantic Scholar Literature Search: "${query}"`,
      `Total Papers Found: ${totalResults}`,
      "",
    ];

    if (papers.length === 0) {
      lines.push("No matching scientific papers found.");
      return lines.join("\n");
    }

    papers.forEach((p, idx) => {
      lines.push(`### ${idx + 1}. [${p.title}](${p.url})`);
      if (p.authors && p.authors.length > 0) {
        lines.push(`- **Authors:** ${p.authors.map((a) => a.name).join(", ")}`);
      }
      if (p.venue || p.year) {
        lines.push(`- **Published:** ${[p.venue, p.year].filter(Boolean).join(" - ")}`);
      }
      if (p.citationCount !== undefined) {
        lines.push(`- **Citations:** ${p.citationCount}`);
      }
      if (p.tldr) {
        lines.push(`> **TLDR:** ${p.tldr}`);
      } else if (p.abstract) {
        lines.push(`> ${p.abstract.slice(0, 250)}...`);
      }
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  private renderAuthorMarkdown(author: SemanticScholarAuthorItem): string {
    const lines: string[] = [`# ${author.name}`, `Author ID: \`${author.authorId}\``];

    if (author.affiliations && author.affiliations.length > 0) {
      lines.push(`- **Affiliations:** ${author.affiliations.join(", ")}`);
    }
    if (author.homepage) {
      lines.push(`- **Homepage:** ${author.homepage}`);
    }
    if (author.hIndex !== undefined) {
      lines.push(`- **h-index:** ${author.hIndex}`);
    }
    if (author.paperCount !== undefined) {
      lines.push(
        `- **Total Papers:** ${author.paperCount} | **Total Citations:** ${author.citationCount ?? "N/A"}`
      );
    }

    if (author.papers && author.papers.length > 0) {
      lines.push("", "### Selected Papers", "");
      for (const p of author.papers.slice(0, 25)) {
        lines.push(`- ${p.title} (${p.year ?? "N/A"}) [S2: \`${p.paperId}\`]`);
      }
    }

    return lines.join("\n").trim();
  }
}
