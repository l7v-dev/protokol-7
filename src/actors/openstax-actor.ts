/**
 * src/actors/openstax-actor.ts
 *
 * OpenStax Open Textbook & Curriculum Harvester.
 * Fetches peer-reviewed, openly licensed college and AP textbooks from OpenStax (Rice University).
 * Retrieves book catalogs, metadata, subject categorizations, and textbook chapter content.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  OpenStaxActorResult,
  OpenStaxActorTaskOptions,
  OpenStaxBookItem,
} from "../api/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const OPENSTAX_CMS_BASE = "https://openstax.org/apps/cms/api/v2/pages/";

interface RawCmsBookItem {
  id: number;
  meta?: {
    slug?: string;
    detail_url?: string;
    html_url?: string;
    first_published_at?: string;
  };
  title?: string;
  description?: string;
  slug?: string;
  publish_date?: string;
  license_name?: string;
  high_resolution_pdf_url?: string;
  pdf_url?: string;
  cover_url?: string;
  cnx_id?: string;
  book_uuid?: string;
  webview_rex_link?: string;
}

interface RawCmsListResponse {
  meta?: {
    total_count?: number;
  };
  items?: RawCmsBookItem[];
}

export class OpenStaxActor implements IActor<OpenStaxActorResult> {
  readonly actorType = "openstax" as const;
  readonly description =
    "Queries OpenStax for openly licensed peer-reviewed college textbooks, curriculums, and chapter content.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenStaxActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: OpenStaxActorTaskOptions = task.options?.openstaxOptions || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
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
            errorMessage: `SSRF validation failed for targetUrl: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      const action =
        options.action || (options.query ? "search" : options.bookId ? "detail" : "catalog");

      if (action === "chapter" && task.targetUrl) {
        return await this.fetchChapterContent(
          task,
          options,
          startTime,
          timeoutMs,
          allowLocalNetwork
        );
      }

      if (action === "detail" && options.bookId) {
        return await this.fetchBookDetail(task, options, startTime, timeoutMs, allowLocalNetwork);
      }

      return await this.fetchCatalogOrSearch(
        task,
        options,
        action,
        startTime,
        timeoutMs,
        allowLocalNetwork
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `OpenStax extraction failed: ${msg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async fetchCatalogOrSearch(
    task: ActorTask,
    options: OpenStaxActorTaskOptions,
    action: "catalog" | "search" | "detail" | "chapter",
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<OpenStaxActorResult>> {
    const limit = Math.min(Math.max(1, options.limit || DEFAULT_LIMIT), MAX_LIMIT);
    const searchParam = options.query?.trim();

    let endpoint = `${OPENSTAX_CMS_BASE}?type=books.Book&fields=title,description,slug,publish_date,license_name,high_resolution_pdf_url,cover_url&limit=${limit}`;

    if (searchParam) {
      endpoint += `&search=${encodeURIComponent(searchParam)}`;
    }

    const isHttpUrl = Boolean(
      task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
    );
    const queryUrl = isHttpUrl ? task.targetUrl : endpoint;

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(queryUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation blocked OpenStax request: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(queryUrl, {
      timeoutMs,
      allowLocalNetwork,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Protokol7/1.0; +https://github.com/protokol-7)",
      },
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `OpenStax API returned HTTP status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const rawData = (await response.json()) as RawCmsListResponse;
    const items = rawData.items || [];
    const totalCount = rawData.meta?.total_count ?? items.length;

    const books: OpenStaxBookItem[] = items.map((b) => {
      const slug = b.slug || b.meta?.slug || "";
      const rawDesc = b.description || "";
      const cleanDesc = rawDesc
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();

      return {
        id: b.id,
        title: b.title || "Untitled Textbook",
        slug,
        description: cleanDesc,
        publishDate: b.publish_date || b.meta?.first_published_at,
        licenseName: b.license_name,
        pdfUrl: b.high_resolution_pdf_url || b.pdf_url,
        coverUrl: b.cover_url,
        htmlUrl:
          b.meta?.html_url || (slug ? `https://openstax.org/details/books/${slug}` : undefined),
        cnxId: b.cnx_id || b.book_uuid,
      };
    });

    const markdown = this.renderBooksMarkdown(books, searchParam, totalCount, action);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: response.status,
      executionDurationMs: Date.now() - startTime,
      data: {
        query: searchParam,
        action,
        totalCount,
        books,
        markdown,
        queryUrl,
      },
    };
  }

  private async fetchBookDetail(
    task: ActorTask,
    options: OpenStaxActorTaskOptions,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<OpenStaxActorResult>> {
    const bookId = options.bookId;
    const endpoint = `${OPENSTAX_CMS_BASE}${bookId}/`;
    const isHttpUrl = Boolean(
      task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
    );
    const queryUrl = isHttpUrl ? task.targetUrl : endpoint;

    const ssrfCheck = await SSRFGuard.validateUrlWithDns(queryUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation blocked OpenStax detail request: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(queryUrl, {
      timeoutMs,
      allowLocalNetwork,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; Protokol7/1.0; +https://github.com/protokol-7)",
      },
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `OpenStax detail API returned HTTP status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const detail = (await response.json()) as Record<string, unknown>;
    const rawDesc = String(detail.description || "");
    const cleanDesc = rawDesc
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const slug = String(detail.slug || "");

    const bookItem: OpenStaxBookItem = {
      id: Number(detail.id) || String(bookId),
      title: String(detail.title || "Untitled Textbook"),
      slug,
      description: cleanDesc,
      publishDate: String(detail.publish_date || ""),
      licenseName: String(detail.license_name || ""),
      pdfUrl: String(detail.high_resolution_pdf_url || detail.pdf_url || ""),
      coverUrl: String(detail.cover_url || ""),
      htmlUrl: slug ? `https://openstax.org/details/books/${slug}` : undefined,
      cnxId: String(detail.cnx_id || detail.book_uuid || ""),
    };

    const markdown = this.renderBookDetailMarkdown(bookItem, detail);

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: response.status,
      executionDurationMs: Date.now() - startTime,
      data: {
        query: options.query,
        action: "detail",
        totalCount: 1,
        books: [bookItem],
        bookDetail: detail,
        markdown,
        queryUrl,
      },
    };
  }

  private async fetchChapterContent(
    task: ActorTask,
    options: OpenStaxActorTaskOptions,
    startTime: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<ActorResult<OpenStaxActorResult>> {
    const url = task.targetUrl;
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(url, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation blocked OpenStax chapter request: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const response = await safeRedirectFetch(url, {
      timeoutMs,
      allowLocalNetwork,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Mozilla/5.0 (compatible; Protokol7/1.0; +https://github.com/protokol-7)",
      },
    });

    if (!response.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: response.status,
        errorMessage: `OpenStax chapter request returned HTTP status ${response.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, nav, footer, header, noscript").remove();
    const pageTitle = $("title").text().trim() || "OpenStax Chapter";
    const mainText = $("main, [data-type='page'], article, body")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    const markdown = `# ${pageTitle}\n\n**Source URL**: ${url}\n\n${mainText.slice(0, 5000)}\n`;

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: response.status,
      executionDurationMs: Date.now() - startTime,
      data: {
        query: options.query,
        action: "chapter",
        totalCount: 1,
        books: [],
        markdown,
        queryUrl: url,
      },
    };
  }

  private renderBooksMarkdown(
    books: OpenStaxBookItem[],
    query: string | undefined,
    totalCount: number,
    action: string
  ): string {
    const lines: string[] = [];
    lines.push(`# OpenStax Textbooks (${action.toUpperCase()})`);
    lines.push("");
    if (query) {
      lines.push(`**Search Query**: \`${query}\``);
    }
    lines.push(`**Total Results**: ${totalCount}`);
    lines.push(`**Returned Textbooks**: ${books.length}`);
    lines.push("");

    if (books.length === 0) {
      lines.push("No OpenStax textbooks found matching the criteria.");
      return lines.join("\n");
    }

    lines.push("| ID | Title | Slug | License | PDF Download | Webview |");
    lines.push("|---|---|---|---|---|---|");

    for (const b of books) {
      const pdf = b.pdfUrl ? `[Download PDF](${b.pdfUrl})` : "N/A";
      const web = b.htmlUrl ? `[View Online](${b.htmlUrl})` : "N/A";
      const license = b.licenseName || "Open License";
      lines.push(`| ${b.id} | **${b.title}** | \`${b.slug}\` | ${license} | ${pdf} | ${web} |`);
    }

    lines.push("");
    lines.push("## Textbook Summaries");
    lines.push("");

    for (const b of books) {
      lines.push(`### ${b.title}`);
      lines.push(`- **ID**: ${b.id}`);
      lines.push(`- **Slug**: \`${b.slug}\``);
      if (b.publishDate) {
        lines.push(`- **Publication Date**: ${b.publishDate}`);
      }
      if (b.licenseName) {
        lines.push(`- **License**: ${b.licenseName}`);
      }
      if (b.cnxId) {
        lines.push(`- **CNX / UUID**: \`${b.cnxId}\``);
      }
      if (b.description) {
        lines.push(`- **Description**: ${b.description}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  private renderBookDetailMarkdown(
    book: OpenStaxBookItem,
    detail: Record<string, unknown>
  ): string {
    const lines: string[] = [];
    lines.push(`# ${book.title}`);
    lines.push("");
    lines.push(`- **ID**: ${book.id}`);
    lines.push(`- **Slug**: \`${book.slug}\``);
    if (book.publishDate) {
      lines.push(`- **Published**: ${book.publishDate}`);
    }
    if (book.licenseName) {
      lines.push(`- **License**: ${book.licenseName}`);
    }
    if (book.pdfUrl) {
      lines.push(`- **PDF Download**: [${book.pdfUrl}](${book.pdfUrl})`);
    }
    if (book.cnxId) {
      lines.push(`- **CNX Identifier**: \`${book.cnxId}\``);
    }
    if (detail.webview_rex_link) {
      lines.push(`- **Online Reader**: [${detail.webview_rex_link}](${detail.webview_rex_link})`);
    }
    lines.push("");
    lines.push("## Description");
    lines.push("");
    lines.push(book.description || "No description available.");
    lines.push("");

    return lines.join("\n");
  }
}
