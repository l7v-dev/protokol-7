/**
 * OpenAlexActor - Scientific literature and research knowledge graph actor.
 * Queries official OpenAlex REST API (/works) to extract peer-reviewed scholarly works,
 * reconstructs abstracts from inverted indexes, and resolves open access links and citation metrics.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  OpenAlexActorResult,
  OpenAlexActorTaskOptions,
  OpenAlexWorkItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PER_PAGE = 10;
const OPENALEX_API_BASE = "https://api.openalex.org/works";

interface RawOpenAlexWork {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  publication_year?: number;
  abstract_inverted_index?: Record<string, number[]>;
  authorships?: Array<{
    author?: { display_name?: string };
  }>;
  cited_by_count?: number;
  open_access?: {
    is_oa?: boolean;
    oa_url?: string;
  };
  primary_location?: {
    landing_page_url?: string;
    pdf_url?: string;
    source?: { display_name?: string };
  };
  concepts?: Array<{
    display_name?: string;
    score?: number;
  }>;
}

export class OpenAlexActor implements IActor<OpenAlexActorResult> {
  readonly actorType = "openalex" as const;
  readonly description =
    "Queries official OpenAlex API for scholarly works, reconstructs abstracts from inverted indexes, and extracts citation metrics.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenAlexActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: OpenAlexActorTaskOptions = task.options?.openalexOptions || {};
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

      // 2. Build OpenAlex API query URL
      const resolvedQueryUrl = this.buildApiUrl(task.targetUrl, options);

      // 3. Validate endpoint against SSRF policy
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

      // 3. Dispatch HTTP request with abort controller
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; openalex-actor)",
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
          errorMessage: `OpenAlex API returned HTTP error ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 4. Parse JSON payload
      const json = (await response.json()) as {
        meta?: { count?: number; page?: number; per_page?: number };
        results?: RawOpenAlexWork[];
        // Single work response handling
        id?: string;
      };

      let worksRaw: RawOpenAlexWork[] = [];
      let totalResults = 0;
      let page = options.page || 1;
      let perPage = options.perPage || DEFAULT_PER_PAGE;

      if (Array.isArray(json.results)) {
        worksRaw = json.results;
        totalResults = json.meta?.count || worksRaw.length;
        page = json.meta?.page || page;
        perPage = json.meta?.per_page || perPage;
      } else if (json.id) {
        worksRaw = [json as unknown as RawOpenAlexWork];
        totalResults = 1;
      }

      // 5. Transform raw works and reconstruct abstracts
      const works: OpenAlexWorkItem[] = worksRaw.map((raw) => {
        const authors = (raw.authorships || [])
          .map((a) => a.author?.display_name)
          .filter((name): name is string => typeof name === "string" && name.length > 0);

        const concepts = (raw.concepts || [])
          .map((c) => c.display_name)
          .filter((name): name is string => typeof name === "string" && name.length > 0);

        const openAccessUrl =
          raw.open_access?.oa_url ||
          raw.primary_location?.pdf_url ||
          raw.primary_location?.landing_page_url;

        return {
          id: raw.id,
          doi: raw.doi,
          title: raw.title || raw.display_name || "",
          displayName: raw.display_name || raw.title || "",
          publicationYear: raw.publication_year,
          abstract: this.reconstructAbstract(raw.abstract_inverted_index),
          authors,
          citedByCount: raw.cited_by_count ?? 0,
          openAccessUrl,
          isOpenAccess: Boolean(raw.open_access?.is_oa),
          concepts,
          sourceVenue: raw.primary_location?.source?.display_name,
        };
      });

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: response.status,
        data: {
          totalResults,
          perPage,
          page,
          works,
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
   * Reconstructs human-readable abstract from OpenAlex inverted index.
   * Example: { "The": [0], "attention": [1], "mechanism": [2] } -> "The attention mechanism"
   */
  private reconstructAbstract(invertedIndex?: Record<string, number[]>): string | undefined {
    if (!invertedIndex || typeof invertedIndex !== "object") {
      return undefined;
    }

    const entries = Object.entries(invertedIndex);
    if (entries.length === 0) {
      return undefined;
    }

    const wordPositions: Array<{ word: string; pos: number }> = [];
    for (const [word, positions] of entries) {
      if (Array.isArray(positions)) {
        for (const pos of positions) {
          if (typeof pos === "number") {
            wordPositions.push({ word, pos });
          }
        }
      }
    }

    if (wordPositions.length === 0) {
      return undefined;
    }

    wordPositions.sort((a, b) => a.pos - b.pos);
    return wordPositions.map((wp) => wp.word).join(" ");
  }

  /**
   * Builds the OpenAlex REST API query URL.
   */
  private buildApiUrl(targetUrl: string | undefined, options: OpenAlexActorTaskOptions): string {
    let baseEndpoint = OPENALEX_API_BASE;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.hostname.includes("openalex.org") ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          baseEndpoint = `${parsed.origin}${parsed.pathname}`;
        }
      } catch {
        // Fallback to default
      }
    }

    // Direct DOI lookup if specified or single work ID
    if (options.doi) {
      const cleanDoi = encodeURIComponent(options.doi.replace(/^https?:\/\/doi.org\//i, ""));
      const rootWorks = baseEndpoint.replace(/\/$/, "");
      return `${rootWorks}/https://doi.org/${cleanDoi}`;
    }

    const url = new URL(baseEndpoint);

    if (options.searchQuery) {
      url.searchParams.set("search", options.searchQuery);
    }

    // Compose filters
    const filters: string[] = [];

    if (options.isOpenAccess !== undefined) {
      filters.push(`is_oa:${options.isOpenAccess}`);
    }

    if (options.publicationYear !== undefined) {
      filters.push(`publication_year:${options.publicationYear}`);
    }

    if (options.minCitations !== undefined && options.minCitations > 0) {
      filters.push(`cited_by_count:>${options.minCitations}`);
    }

    if (options.concept) {
      filters.push(`concepts.id:${options.concept}`);
    }

    if (options.author) {
      filters.push(`author.id:${options.author}`);
    }

    if (filters.length > 0) {
      url.searchParams.set("filter", filters.join(","));
    }

    const perPage = options.perPage ?? DEFAULT_PER_PAGE;
    url.searchParams.set("per_page", String(Math.min(200, Math.max(1, perPage))));

    if (options.page && options.page > 1) {
      url.searchParams.set("page", String(options.page));
    }

    if (options.mailto) {
      url.searchParams.set("mailto", options.mailto);
    }

    // Project fields to optimize payload bandwidth
    url.searchParams.set(
      "select",
      "id,doi,title,display_name,publication_year,abstract_inverted_index,authorships,cited_by_count,primary_location,open_access,concepts"
    );

    return url.toString();
  }
}
