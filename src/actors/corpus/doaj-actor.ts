/**
 * DoajActor - Directory of Open Access Journals (DOAJ) Extractor Actor
 *
 * Interfaces with DOAJ REST API v2 to search and retrieve peer-reviewed
 * open access articles, journals, metadata, abstracts, and fulltext links.
 *
 * API Base: https://doaj.org/api/v2
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  DoajActorResult,
  DoajActorTaskOptions,
  DoajArticleItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DOAJ_API_BASE = "https://doaj.org/api/v2";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_SIZE = 20;

interface RawBibJson {
  title?: string;
  abstract?: string;
  year?: string | number;
  identifier?: Array<{ type?: string; id?: string }>;
  journal?: {
    title?: string;
    publisher?: string;
    language?: string[];
    issns?: string[];
  };
  author?: Array<{ name?: string; affiliation?: string }>;
  keywords?: string[];
  subject?: Array<{ term?: string; code?: string; scheme?: string }>;
  link?: Array<{ type?: string; url?: string }>;
}

interface RawDoajItem {
  id?: string;
  created_date?: string;
  last_updated?: string;
  bibjson?: RawBibJson;
}

interface RawDoajSearchResponse {
  total?: number;
  page?: number;
  pageSize?: number;
  results?: RawDoajItem[];
}

export class DoajActor implements IActor<DoajActorResult> {
  readonly actorType = "doaj" as const;
  readonly description =
    "Queries DOAJ (Directory of Open Access Journals) REST API v2 for peer-reviewed open access articles, metadata, journals, and fulltext links.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DoajActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: DoajActorTaskOptions = task.options?.doajOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    const action = options.action || (options.articleId ? "get_article" : "search_articles");

    try {
      // 1. Resolve endpoint URL
      const resolvedQueryUrl = this.buildApiUrl(task.targetUrl, options, action);

      // 2. Validate URL against SSRF policy
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

      // 3. Execute HTTP request
      const response = await safeRedirectFetch(resolvedQueryUrl, {
        headers: {
          "User-Agent":
            "protokol-7/1.0.0 (Research Ingestion Engine; mailto:l7v-dev@protokol.local)",
          Accept: "application/json",
        },
        timeoutMs,
        maxRedirects: 3,
        allowLocalNetwork,
      });

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `DOAJ API error: HTTP ${response.status} ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = await response.json();

      let totalCount = 0;
      let page = options.page || 1;
      let pageSize = options.pageSize || DEFAULT_PAGE_SIZE;
      let rawItems: RawDoajItem[] = [];

      if (action === "get_article") {
        const singleItem = rawJson as RawDoajItem;
        if (singleItem?.id) {
          rawItems = [singleItem];
          totalCount = 1;
        }
      } else {
        const searchResp = rawJson as RawDoajSearchResponse;
        totalCount = searchResp.total || 0;
        page = searchResp.page || page;
        pageSize = searchResp.pageSize || pageSize;
        rawItems = searchResp.results || [];
      }

      // 4. Map raw records to normalized articles
      const articles: DoajArticleItem[] = rawItems.map((item) => this.normalizeItem(item));

      // 5. Synthesize Markdown
      const overallMarkdown = this.synthesizeOverallMarkdown({
        action,
        totalCount,
        page,
        pageSize,
        articles,
        query: options.query,
        articleId: options.articleId,
      });

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          action,
          totalCount,
          page,
          pageSize,
          articles,
          queryUrl: resolvedQueryUrl,
          markdown: overallMarkdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `DoajActor execution failure: ${msg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildApiUrl(
    targetUrl: string | undefined,
    options: DoajActorTaskOptions,
    action: "search_articles" | "search_journals" | "get_article"
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    if (action === "get_article" && options.articleId) {
      const cleanId = encodeURIComponent(options.articleId.trim());
      return `${DOAJ_API_BASE}/articles/${cleanId}`;
    }

    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || DEFAULT_PAGE_SIZE));
    const query = options.query?.trim() || "*:*";
    const encQuery = encodeURIComponent(query);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    if (options.sort) {
      params.append("sort", options.sort);
    }

    const endpoint = action === "search_journals" ? "search/journals" : "search/articles";
    return `${DOAJ_API_BASE}/${endpoint}/${encQuery}?${params.toString()}`;
  }

  private normalizeItem(raw: RawDoajItem): DoajArticleItem {
    const id = raw.id || "";
    const bib = raw.bibjson || {};

    const title = (bib.title || "").trim();
    const abstract = (bib.abstract || "").trim();

    let doi: string | undefined;
    const issns: string[] = [];

    if (Array.isArray(bib.identifier)) {
      for (const ident of bib.identifier) {
        const type = (ident.type || "").toLowerCase();
        const val = (ident.id || "").trim();
        if (type === "doi" && !doi) {
          doi = val;
        } else if (type.includes("issn") && val && !issns.includes(val)) {
          issns.push(val);
        }
      }
    }

    const journalInfo = bib.journal || {};
    const journalTitle = (journalInfo.title || "").trim();
    const publisher = (journalInfo.publisher || "").trim();

    if (Array.isArray(journalInfo.issns)) {
      for (const jissn of journalInfo.issns) {
        const trimmed = String(jissn).trim();
        if (trimmed && !issns.includes(trimmed)) {
          issns.push(trimmed);
        }
      }
    }

    let language: string | undefined;
    if (Array.isArray(journalInfo.language) && journalInfo.language.length > 0) {
      language = journalInfo.language.join(", ");
    }

    let year: number | undefined;
    if (bib.year !== undefined && bib.year !== null) {
      const parsedYear = parseInt(String(bib.year), 10);
      if (!Number.isNaN(parsedYear)) {
        year = parsedYear;
      }
    }

    const authorsList: string[] = [];
    const affiliationsList: string[] = [];

    if (Array.isArray(bib.author)) {
      for (const aut of bib.author) {
        if (aut.name) {
          authorsList.push(aut.name.trim());
        }
        if (aut.affiliation && !affiliationsList.includes(aut.affiliation.trim())) {
          affiliationsList.push(aut.affiliation.trim());
        }
      }
    }

    const keywords: string[] = Array.isArray(bib.keywords)
      ? bib.keywords.map((k) => String(k).trim()).filter(Boolean)
      : [];

    const subjects: string[] = [];
    if (Array.isArray(bib.subject)) {
      for (const subj of bib.subject) {
        if (subj.term && !subjects.includes(subj.term.trim())) {
          subjects.push(subj.term.trim());
        }
      }
    }

    let fulltextUrl: string | undefined;
    if (Array.isArray(bib.link)) {
      for (const link of bib.link) {
        if (link.url) {
          const ltype = (link.type || "").toLowerCase();
          if (ltype === "fulltext") {
            fulltextUrl = link.url.trim();
            break;
          }
          if (!fulltextUrl) {
            fulltextUrl = link.url.trim();
          }
        }
      }
    }

    const fullContent = abstract ? `${title}\n\n${abstract}` : title;
    const charCount = fullContent.length;
    const wordCount = fullContent.split(/\s+/).filter(Boolean).length;

    const markdown = this.synthesizeArticleMarkdown({
      id,
      doi,
      title,
      abstract,
      journal: journalTitle,
      publisher,
      issn: issns.join(", "),
      year,
      authors: authorsList.join(", "),
      affiliations: affiliationsList.join("; "),
      keywords,
      subjects,
      fulltextUrl,
    });

    return {
      id,
      doi,
      title,
      abstract: abstract || undefined,
      journal: journalTitle || undefined,
      publisher: publisher || undefined,
      issn: issns.length > 0 ? issns.join(", ") : undefined,
      language,
      year,
      authors: authorsList.length > 0 ? authorsList.join(", ") : undefined,
      affiliations: affiliationsList.length > 0 ? affiliationsList.join("; ") : undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      subjects: subjects.length > 0 ? subjects : undefined,
      fulltextUrl,
      charCount,
      wordCount,
      markdown,
    };
  }

  private synthesizeArticleMarkdown(item: {
    id: string;
    doi?: string;
    title: string;
    abstract?: string;
    journal?: string;
    publisher?: string;
    issn?: string;
    year?: number;
    authors?: string;
    affiliations?: string;
    keywords?: string[];
    subjects?: string[];
    fulltextUrl?: string;
  }): string {
    const lines = [`# ${item.title}`, ""];
    const metaParts = [];

    if (item.journal) {
      metaParts.push(`**Journal:** ${item.journal}`);
    }
    if (item.publisher) {
      metaParts.push(`**Publisher:** ${item.publisher}`);
    }
    if (item.year) {
      metaParts.push(`**Year:** ${item.year}`);
    }
    if (item.doi) {
      metaParts.push(`**DOI:** [${item.doi}](https://doi.org/${item.doi})`);
    }
    if (item.fulltextUrl) {
      metaParts.push(`**Full Text:** [Access Link](${item.fulltextUrl})`);
    }

    if (metaParts.length > 0) {
      lines.push(metaParts.join(" | "));
      lines.push("");
    }

    if (item.authors) {
      lines.push(`- **Authors:** ${item.authors}`);
    }
    if (item.affiliations) {
      lines.push(`- **Affiliations:** ${item.affiliations}`);
    }
    if (item.keywords && item.keywords.length > 0) {
      lines.push(`- **Keywords:** ${item.keywords.join(", ")}`);
    }
    if (item.subjects && item.subjects.length > 0) {
      lines.push(`- **Subjects:** ${item.subjects.join(", ")}`);
    }

    lines.push("");

    if (item.abstract) {
      lines.push("## Abstract");
      lines.push(item.abstract);
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  private synthesizeOverallMarkdown(meta: {
    action: string;
    totalCount: number;
    page: number;
    pageSize: number;
    articles: DoajArticleItem[];
    query?: string;
    articleId?: string;
  }): string {
    const lines = [
      "# DOAJ (Directory of Open Access Journals) Results",
      "",
      `| Metric | Value |`,
      `| --- | --- |`,
      `| **Action** | \`${meta.action}\` |`,
      `| **Total Matching** | ${meta.totalCount} |`,
      `| **Page** | ${meta.page} |`,
      `| **Page Size** | ${meta.pageSize} |`,
      `| **Returned Articles** | ${meta.articles.length} |`,
    ];

    if (meta.query) lines.push(`| **Query** | \`${meta.query}\` |`);
    if (meta.articleId) lines.push(`| **Article ID** | \`${meta.articleId}\` |`);

    lines.push("");

    if (meta.articles.length === 0) {
      lines.push("*No DOAJ open access articles found matching the criteria.*");
      return lines.join("\n");
    }

    lines.push("## Articles");
    lines.push("");

    for (let i = 0; i < meta.articles.length; i++) {
      const art = meta.articles[i];
      lines.push(`### ${i + 1}. ${art.title}`);
      const infoParts = [];
      if (art.journal) infoParts.push(`**Journal:** ${art.journal}`);
      if (art.year) infoParts.push(`**Year:** ${art.year}`);
      if (art.doi) infoParts.push(`**DOI:** [${art.doi}](https://doi.org/${art.doi})`);
      if (infoParts.length > 0) {
        lines.push(`- ${infoParts.join(" | ")}`);
      }
      if (art.authors) {
        lines.push(`- **Authors:** ${art.authors}`);
      }
      if (art.abstract) {
        const snippet =
          art.abstract.length > 250 ? `${art.abstract.slice(0, 250)}...` : art.abstract;
        lines.push(`- **Abstract:** ${snippet}`);
      }
      if (art.fulltextUrl) {
        lines.push(`- **Full Text:** [${art.fulltextUrl}](${art.fulltextUrl})`);
      }
      lines.push("");
    }

    return lines.join("\n").trim();
  }
}
