/**
 * CourtListenerActor - Free Law Project judicial opinions, legal precedents, and case law actor.
 * Interfaces with official CourtListener REST API v4 (courtlistener.com) to search federal
 * and state court opinions, dockets, judges, and precedential legal texts.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  CourtListenerActorResult,
  CourtListenerActorTaskOptions,
  CourtListenerDocumentItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const COURT_LISTENER_SEARCH_BASE = "https://www.courtlistener.com/api/rest/v4/search/";
const COURT_LISTENER_OPINIONS_BASE = "https://www.courtlistener.com/api/rest/v4/opinions/";
const COURT_LISTENER_SITE_BASE = "https://www.courtlistener.com";

interface RawCourtListenerItem {
  id?: number;
  caseName?: string;
  caseNameShort?: string;
  citation?: string[] | string;
  court?: string;
  court_exact?: string;
  dateFiled?: string;
  judge?: string;
  status?: string;
  snippet?: string;
  absolute_url?: string;
  download_url?: string;
  plain_text?: string;
  html_with_citations?: string;
}

interface RawCourtListenerResponse {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: RawCourtListenerItem[];
  id?: number;
  case_name?: string;
}

export class CourtListenerActor implements IActor<CourtListenerActorResult> {
  readonly actorType = "court-listener" as const;
  readonly description =
    "Queries CourtListener REST API v4 for judicial opinions, case law precedents, and court dockets.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<CourtListenerActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: CourtListenerActorTaskOptions = task.options?.courtListenerOptions || {};
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
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      const hasSearchCriteria =
        Boolean(options.query?.trim()) ||
        Boolean(options.opinionId) ||
        Boolean(options.court?.trim()) ||
        Boolean(options.judge?.trim()) ||
        (Boolean(task.targetUrl) &&
          !task.targetUrl.endsWith("/api/rest/v4/search/") &&
          !task.targetUrl.endsWith("/api/rest/v4/search"));

      if (!hasSearchCriteria) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage:
            "Missing search parameter: provide 'query', 'opinionId', 'court', or 'judge'.",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const requestUrl = this.buildRequestUrl(task, options);

      const ssrfCheck = await SSRFGuard.validateUrlWithDns(requestUrl, {
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

      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": "protokol-7/1.0.0 (CourtListener Legal Research Actor)",
      };

      if (process.env.COURT_LISTENER_API_TOKEN) {
        headers.Authorization = `Token ${process.env.COURT_LISTENER_API_TOKEN}`;
      }

      const response = await safeRedirectFetch(requestUrl, {
        method: "GET",
        headers,
        timeoutMs,
        allowLocalNetwork,
      });

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `CourtListener API returned HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = (await response.json()) as RawCourtListenerResponse;

      let rawItems: RawCourtListenerItem[] = [];
      let totalCount = 0;

      if (Array.isArray(rawJson.results)) {
        rawItems = rawJson.results;
        totalCount = rawJson.count || rawItems.length;
      } else if (rawJson.id) {
        rawItems = [rawJson as RawCourtListenerItem];
        totalCount = 1;
      }

      const limit = Math.min(Math.max(options.limit || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
      const results = rawItems.slice(0, limit).map((item) => this.normalizeItem(item));
      const markdown = this.synthesizeMarkdown(results, totalCount, options);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          totalCount,
          page: options.page || 1,
          results,
          queryUrl: requestUrl,
          markdown,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `CourtListenerActor execution failed: ${errorMsg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildRequestUrl(task: ActorTask, options: CourtListenerActorTaskOptions): string {
    const rawTarget = (task.targetUrl || "").trim();

    if (options.opinionId) {
      const opId = String(options.opinionId).replace(/\D/g, "");
      return rawTarget.startsWith("http") ? rawTarget : `${COURT_LISTENER_OPINIONS_BASE}${opId}/`;
    }

    let baseUrl = COURT_LISTENER_SEARCH_BASE;
    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      baseUrl = rawTarget;
    }

    const url = new URL(baseUrl);

    const queryStr = options.query || (!rawTarget.startsWith("http") ? rawTarget : "") || "";
    if (queryStr) {
      url.searchParams.set("q", queryStr);
    }

    if (options.court) {
      url.searchParams.set("court", options.court);
    }

    if (options.judge) {
      url.searchParams.set("judge", options.judge);
    }

    url.searchParams.set("type", options.type || "o");

    if (options.statPrecedential) {
      url.searchParams.set("stat_Precedential", options.statPrecedential);
    }

    if (options.page && options.page > 1) {
      url.searchParams.set("page", String(options.page));
    }

    return url.toString();
  }

  private normalizeItem(raw: RawCourtListenerItem): CourtListenerDocumentItem {
    const citations: string[] = [];
    if (Array.isArray(raw.citation)) {
      citations.push(...raw.citation);
    } else if (typeof raw.citation === "string" && raw.citation.trim()) {
      citations.push(raw.citation.trim());
    }

    const cleanSnippet =
      (raw.plain_text || raw.html_with_citations || raw.snippet || "")
        .replace(/<[^>]+>/g, "")
        .trim() || undefined;

    let absoluteUrl = "";
    if (raw.absolute_url) {
      absoluteUrl = raw.absolute_url.startsWith("http")
        ? raw.absolute_url
        : `${COURT_LISTENER_SITE_BASE}${raw.absolute_url}`;
    }

    return {
      id: raw.id || 0,
      caseName: raw.caseName || raw.caseNameShort || "Untitled Matter",
      citation: citations.length > 0 ? citations : undefined,
      court: raw.court || "unknown",
      courtExact: raw.court_exact,
      dateFiled: raw.dateFiled,
      judge: raw.judge,
      status: raw.status,
      snippet: cleanSnippet,
      downloadUrl: raw.download_url,
      absoluteUrl,
    };
  }

  private synthesizeMarkdown(
    items: CourtListenerDocumentItem[],
    totalCount: number,
    options: CourtListenerActorTaskOptions
  ): string {
    const lines: string[] = [];

    if (options.opinionId && items.length > 0) {
      const item = items[0];
      lines.push(`# CourtListener Opinion #${item.id}`);
      lines.push(`- **Case**: ${item.caseName}`);
      lines.push(`- **Court**: ${item.courtExact || item.court}`);
      if (item.dateFiled) lines.push(`- **Filing Date**: ${item.dateFiled}`);
      if (item.judge) lines.push(`- **Judge**: ${item.judge}`);
      if (item.snippet) {
        lines.push("");
        lines.push("### Opinion Text");
        lines.push(item.snippet);
      }
      return lines.join("\n").trim();
    }

    if (options.query) {
      lines.push(`# CourtListener Case Law Search: ${options.query}`);
    } else {
      lines.push(`# CourtListener Case Law & Precedent Results`);
    }
    if (options.court) lines.push(`Court: ${options.court}`);
    lines.push(`Total Matching Cases: ${totalCount}`);
    lines.push(`Retrieved Cases: ${items.length}`);
    lines.push("");

    if (items.length === 0) {
      lines.push("No legal precedents found matching query.");
      return lines.join("\n");
    }

    for (const item of items) {
      const citeStr = item.citation ? ` (${item.citation.join(", ")})` : "";
      lines.push(`## [${item.id}] ${item.caseName}${citeStr}`);
      lines.push(`- **Court**: ${item.courtExact || item.court.toUpperCase()}`);
      if (item.dateFiled) lines.push(`- **Filing Date**: ${item.dateFiled}`);
      if (item.judge) lines.push(`- **Judge**: ${item.judge}`);
      if (item.status) lines.push(`- **Precedential Status**: ${item.status}`);
      if (item.absoluteUrl) lines.push(`- **Docket Link**: ${item.absoluteUrl}`);
      if (item.downloadUrl) lines.push(`- **Download PDF/Text**: ${item.downloadUrl}`);

      if (item.snippet) {
        lines.push("");
        lines.push("### Opinion Extract");
        lines.push(`> ${item.snippet}`);
      }

      lines.push("");
      lines.push("---");
      lines.push("");
    }

    return lines.join("\n").trim();
  }
}
