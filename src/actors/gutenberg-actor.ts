/**
 * GutenbergActor - Public domain literature and classic books extraction actor.
 * Interfaces with Gutendex REST API to query 70,000+ public domain literary and philosophical works,
 * retrieves raw UTF-8 text streams, and strips standard Project Gutenberg license headers and footers.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  GutenbergActorResult,
  GutenbergActorTaskOptions,
  GutenbergBookItem,
  IActor,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BOOK_BYTES = 10 * 1024 * 1024; // 10 MB limit
const GUTENDEX_API_BASE = "https://gutendex.com/books";

interface RawGutendexBook {
  id: number;
  title: string;
  authors?: Array<{ name: string; birth_year?: number; death_year?: number }>;
  subjects?: string[];
  languages?: string[];
  download_count?: number;
  formats?: Record<string, string>;
}

export class GutenbergActor implements IActor<GutenbergActorResult> {
  readonly actorType = "gutenberg" as const;
  readonly description =
    "Queries Gutendex API for public domain books, extracts metadata, and downloads unadulterated book text without license headers.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<GutenbergActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: GutenbergActorTaskOptions = task.options?.gutenbergOptions || {};
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

      // 2. Build Gutendex API query URL
      const resolvedQueryUrl = this.buildApiUrl(task.targetUrl, options);

      // 3. SSRF validation on query URL
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

      // 4. Fetch books catalog metadata
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; gutenberg-actor)",
            Accept: "application/json, */*",
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
          errorMessage: `Gutendex API returned HTTP error ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const json = (await response.json()) as {
        count?: number;
        results?: RawGutendexBook[];
        // Single book response handling
        id?: number;
      };

      let rawBooks: RawGutendexBook[] = [];
      let totalCount = 0;

      if (Array.isArray(json.results)) {
        rawBooks = json.results;
        totalCount = json.count || rawBooks.length;
      } else if (json.id) {
        rawBooks = [json as unknown as RawGutendexBook];
        totalCount = 1;
      }

      // 5. Construct book items
      const books: GutenbergBookItem[] = rawBooks.map((raw) => {
        const authors = (raw.authors || []).map((a) => a.name).filter(Boolean);
        const textUrl =
          raw.formats?.["text/plain; charset=utf-8"] ||
          raw.formats?.["text/plain; charset=us-ascii"] ||
          raw.formats?.["text/plain"];

        return {
          id: raw.id,
          title: raw.title,
          authors,
          subjects: raw.subjects || [],
          languages: raw.languages || [],
          downloadCount: raw.download_count ?? 0,
          textUrl,
        };
      });

      // 6. Optional plain text download and license stripping
      if (options.downloadText && books.length > 0) {
        await this.downloadAndCleanTexts(
          books,
          options.maxBytes || MAX_BOOK_BYTES,
          timeoutMs,
          allowLocalNetwork
        );
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: response.status,
        data: {
          totalCount,
          books,
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
   * Downloads plain text for books and strips Project Gutenberg headers/footers.
   */
  private async downloadAndCleanTexts(
    books: GutenbergBookItem[],
    maxBytes: number,
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<void> {
    for (const book of books.slice(0, 5)) {
      if (!book.textUrl) continue;

      try {
        const ssrfCheck = await SSRFGuard.validateUrlWithDns(book.textUrl, {
          allowLocalNetwork,
        });
        if (!ssrfCheck.valid) continue;

        const res = await safeRedirectFetch(book.textUrl, {
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; gutenberg-actor)",
          },
        });

        if (res.ok) {
          const rawText = await res.text();
          const cleanFullText = this.stripGutenbergHeaders(rawText);
          book.cleanText = cleanFullText.slice(0, maxBytes);
        }
      } catch {
        // Continue to next book on network timeout
      }
    }
  }

  /**
   * Strips Project Gutenberg legal notices, license headers and footers.
   */
  public stripGutenbergHeaders(rawText: string): string {
    const startRegex = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;
    const endRegex = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i;

    let text = rawText;
    const startMatch = text.match(startRegex);
    if (startMatch && startMatch.index !== undefined) {
      text = text.slice(startMatch.index + startMatch[0].length);
    }

    const endMatch = text.match(endRegex);
    if (endMatch && endMatch.index !== undefined) {
      text = text.slice(0, endMatch.index);
    }

    return text.trim();
  }

  /**
   * Builds the Gutendex API query URL.
   */
  private buildApiUrl(targetUrl: string | undefined, options: GutenbergActorTaskOptions): string {
    let baseEndpoint = GUTENDEX_API_BASE;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.hostname.includes("gutendex.com") ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          baseEndpoint = `${parsed.origin}${parsed.pathname}`;
        }
      } catch {
        // Fallback to default
      }
    }

    if (options.bookId && !baseEndpoint.includes(`/books/${options.bookId}`)) {
      return `${baseEndpoint.replace(/\/$/, "")}/${options.bookId}`;
    }

    const url = new URL(baseEndpoint);

    if (options.searchQuery) {
      url.searchParams.set("search", options.searchQuery);
    }

    if (options.topic) {
      url.searchParams.set("topic", options.topic);
    }

    if (options.languages && options.languages.length > 0) {
      url.searchParams.set("languages", options.languages.join(","));
    }

    return url.toString();
  }
}
