/**
 * EuropePmcActor - Biomedical, clinical, and life sciences research literature actor.
 * Interfaces with Europe PMC REST API (45M+ records, PubMed Central subset) to query
 * peer-reviewed biomedical publications, abstracts, authors, and open access full-text links.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  EuropePmcActorResult,
  EuropePmcActorTaskOptions,
  EuropePmcArticleItem,
  IActor,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_SIZE = 10;
const EUROPE_PMC_API_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";

interface RawEuropePmcResult {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalInfo?: {
    journal?: { title?: string };
    yearOfPublication?: number;
  };
  pubYear?: string;
  abstractText?: string;
  isOpenAccess?: string;
  hasTextMinedTerms?: string;
  fullTextUrlList?: {
    fullTextUrl?: Array<{
      url?: string;
      documentStyle?: string;
      availability?: string;
    }>;
  };
}

export class EuropePmcActor implements IActor<EuropePmcActorResult> {
  readonly actorType = "europe-pmc" as const;
  readonly description =
    "Queries Europe PMC and PubMed Central REST API for peer-reviewed biomedical literature, abstracts, and open-access full-text links.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<EuropePmcActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: EuropePmcActorTaskOptions = task.options?.europePmcOptions || {};
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

      // 2. Build Europe PMC API query URL
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

      // 4. Fetch search results
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; europe-pmc-actor)",
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
          errorMessage: `Europe PMC API returned HTTP error ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const json = (await response.json()) as {
        hitCount?: number;
        nextCursorMark?: string;
        resultList?: {
          result?: RawEuropePmcResult[];
        };
      };

      const rawArticles = json.resultList?.result || [];
      const hitCount = json.hitCount || rawArticles.length;
      const nextCursorMark = json.nextCursorMark;

      // 5. Construct article items
      const articles: EuropePmcArticleItem[] = rawArticles.map((raw) => {
        let pubYear: number | undefined;
        if (raw.journalInfo?.yearOfPublication) {
          pubYear = raw.journalInfo.yearOfPublication;
        } else if (raw.pubYear) {
          const parsedYear = Number.parseInt(raw.pubYear, 10);
          if (!Number.isNaN(parsedYear)) {
            pubYear = parsedYear;
          }
        }

        const fullTextUrls = raw.fullTextUrlList?.fullTextUrl || [];
        const preferredUrl =
          fullTextUrls.find((u) => u.documentStyle === "pdf")?.url ||
          fullTextUrls.find((u) => u.documentStyle === "html")?.url ||
          fullTextUrls[0]?.url;

        return {
          id: raw.id,
          source: raw.source,
          pmid: raw.pmid,
          pmcid: raw.pmcid,
          doi: raw.doi,
          title: raw.title,
          authorString: raw.authorString,
          journalTitle: raw.journalInfo?.journal?.title,
          pubYear,
          abstractText: raw.abstractText,
          isOpenAccess: raw.isOpenAccess === "Y",
          hasTextMinedTerms: raw.hasTextMinedTerms === "Y",
          fullTextUrl: preferredUrl,
        };
      });

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: response.status,
        data: {
          hitCount,
          nextCursorMark,
          articles,
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
   * Builds the Europe PMC REST API query URL.
   */
  private buildApiUrl(targetUrl: string | undefined, options: EuropePmcActorTaskOptions): string {
    let baseEndpoint = EUROPE_PMC_API_BASE;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.hostname.includes("europepmc.org") ||
          parsed.hostname.includes("ebi.ac.uk") ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          baseEndpoint = `${parsed.origin}${parsed.pathname}`;
        }
      } catch {
        // Fallback to default
      }
    }

    const url = new URL(baseEndpoint);

    let queryStr = options.query || "";
    if (options.openAccessOnly) {
      queryStr = queryStr ? `(${queryStr}) AND OPEN_ACCESS:y` : "OPEN_ACCESS:y";
    }

    url.searchParams.set("query", queryStr || "*");
    url.searchParams.set("resultType", "core");
    url.searchParams.set("format", "json");

    const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    url.searchParams.set("pageSize", String(Math.min(100, Math.max(1, pageSize))));

    if (options.cursorMark) {
      url.searchParams.set("cursorMark", options.cursorMark);
    }

    if (options.synonym !== undefined) {
      url.searchParams.set("synonym", String(options.synonym));
    }

    return url.toString();
  }
}
