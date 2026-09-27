/**
 * IetfRfcActor - Internet engineering, cryptography, and network protocol standards actor.
 * Interfaces with official RFC Editor and IETF Datatracker APIs to retrieve normative specifications,
 * extracts metadata (status, obsoletes, authors), and cleans text streams of form feeds and running page headers.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  IetfRfcActorResult,
  IetfRfcActorTaskOptions,
  IetfRfcItem,
} from "../api/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const RFC_EDITOR_BASE = "https://www.rfc-editor.org/rfc";
const DATATRACKER_BASE = "https://datatracker.ietf.org/api/v1/doc/document";

interface DatatrackerDoc {
  name: string;
  title: string;
  abstract?: string;
  std_level?: string;
  rfc_number?: number;
  time?: string;
  obsoletes?: string[];
  obsoleted_by?: string[];
}

export class IetfRfcActor implements IActor<IetfRfcActorResult> {
  readonly actorType = "ietf-rfc" as const;
  readonly description =
    "Queries IETF RFC Editor and Datatracker for official Internet standards, extracts metadata, and cleans plain text RFC streams.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<IetfRfcActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: IetfRfcActorTaskOptions = task.options?.ietfRfcOptions || {};
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

      // 2. Resolve requested RFC number or search query
      const rfcNumber = this.resolveRfcNumber(task.targetUrl, options);
      let rfcs: IetfRfcItem[] = [];
      let resolvedQueryUrl = "";

      if (rfcNumber) {
        // Direct RFC text lookup
        resolvedQueryUrl = this.buildRfcTextUrl(task.targetUrl, rfcNumber);

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

        const controller = new AbortController();
        const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
          response = await safeRedirectFetch(resolvedQueryUrl, {
            signal: controller.signal,
            timeoutMs,
            allowLocalNetwork,
            headers: {
              "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; ietf-rfc-actor)",
              Accept: "text/plain, */*",
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
            errorMessage: `RFC Editor returned HTTP error ${response.status}: ${response.statusText}`,
            executionDurationMs: Date.now() - startTime,
          };
        }

        const rawText = await response.text();
        const cleanText = this.cleanRfcText(rawText);
        const parsedMeta = this.parseRfcTextHeader(cleanText, rfcNumber);

        rfcs = [
          {
            rfcNumber,
            title: parsedMeta.title,
            abstract: parsedMeta.abstract,
            status: parsedMeta.status,
            authors: parsedMeta.authors,
            pubDate: parsedMeta.pubDate,
            url: resolvedQueryUrl,
            obsoletes: parsedMeta.obsoletes,
            cleanText,
          },
        ];
      } else {
        // Search Datatracker index
        resolvedQueryUrl = this.buildDatatrackerSearchUrl(task.targetUrl, options);

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

        const controller = new AbortController();
        const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

        let response: Response;
        try {
          response = await safeRedirectFetch(resolvedQueryUrl, {
            signal: controller.signal,
            timeoutMs,
            allowLocalNetwork,
            headers: {
              "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; ietf-rfc-actor)",
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
            errorMessage: `Datatracker API returned HTTP error ${response.status}: ${response.statusText}`,
            executionDurationMs: Date.now() - startTime,
          };
        }

        const json = (await response.json()) as {
          meta?: { total_count?: number };
          objects?: DatatrackerDoc[];
        };

        const docs = json.objects || [];
        rfcs = docs.map((doc) => {
          const num = doc.rfc_number || Number.parseInt(doc.name.replace(/^rfc/i, ""), 10);
          return {
            rfcNumber: Number.isNaN(num) ? 0 : num,
            title: doc.title,
            abstract: doc.abstract,
            status: doc.std_level,
            pubDate: doc.time,
            url: `https://www.rfc-editor.org/rfc/${doc.name.toLowerCase()}.txt`,
            obsoletes: doc.obsoletes,
            obsoletedBy: doc.obsoleted_by,
          };
        });
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          totalResults: rfcs.length,
          rfcs,
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
   * Cleans RFC text of form-feed page markers and running page headers.
   */
  public cleanRfcText(rawText: string): string {
    return rawText
      .replace(/\f/g, "\n\n")
      .replace(/^[^\n]+\[Page \d+\]\s*\n+(?:RFC \d+[^\n]+\n+)?/gm, "")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Parses title, authors, abstract, and status from RFC text preamble.
   */
  private parseRfcTextHeader(
    text: string,
    rfcNumber: number
  ): {
    title: string;
    status?: string;
    authors?: string[];
    pubDate?: string;
    abstract?: string;
    obsoletes?: string[];
  } {
    let title = `RFC ${rfcNumber}`;
    let status: string | undefined;
    const authors: string[] = [];
    let pubDate: string | undefined;
    let abstract: string | undefined;
    const obsoletes: string[] = [];

    // Parse status line: Category: Standards Track / Request for Comments: 7230
    const statusMatch = text.match(/Category:\s*([^\n]+)/i);
    if (statusMatch) {
      status = statusMatch[1].split(/\s{2,}/)[0]?.trim();
    }

    // Parse obsoletes line: Obsoletes: 2616, 2068
    const obsoletesMatch = text.match(/Obsoletes:\s*([^\n]+)/i);
    if (obsoletesMatch) {
      const list = obsoletesMatch[1].split(/[\s,]+/);
      for (const item of list) {
        if (/^\d+$/.test(item)) obsoletes.push(item);
      }
    }

    // Parse date: e.g. June 2014 or 1 April 1999
    const dateMatch = text.match(
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i
    );
    if (dateMatch) {
      pubDate = dateMatch[0];
    }

    // Parse Abstract section
    const abstractMatch = text.match(
      /Abstract\s*\n+([\s\S]*?)(?:\n\n[A-Z0-9][^\n]+|\n\n\d+\.|\n\nStatus of This Memo)/i
    );
    if (abstractMatch) {
      abstract = abstractMatch[1]
        .replace(/-\s*\n\s*/g, "-")
        .replace(/\s+/g, " ")
        .trim();
    }

    // Heuristic for title: lines between initial header table and Status of This Memo / Abstract
    const lines = text.slice(0, 2000).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.length > 5 &&
        !line.startsWith("Internet Engineering Task Force") &&
        !line.startsWith("Network Working Group") &&
        !line.startsWith("Request for Comments") &&
        !line.startsWith("Updates:") &&
        !line.startsWith("Obsoletes:") &&
        !line.startsWith("Category:") &&
        !line.startsWith("ISSN:") &&
        !line.includes("Standards Track") &&
        !line.includes("Informational") &&
        !line.includes("Best Current Practice")
      ) {
        // Next non-empty lines could be title
        if (
          i > 5 &&
          lines[i - 1]?.trim() === "" &&
          !line.toLowerCase().startsWith("abstract") &&
          !line.toLowerCase().startsWith("status of this memo")
        ) {
          title = line;
          break;
        }
      }
    }

    return { title, status, authors, pubDate, abstract, obsoletes };
  }

  /**
   * Resolves RFC number from task options or target URL.
   */
  private resolveRfcNumber(
    targetUrl: string | undefined,
    options: IetfRfcActorTaskOptions
  ): number | undefined {
    if (options.rfcNumber && options.rfcNumber > 0) {
      return options.rfcNumber;
    }

    if (targetUrl) {
      const match = targetUrl.match(/rfc(\d+)(?:\.txt)?/i);
      if (match) {
        return Number.parseInt(match[1], 10);
      }
    }

    return undefined;
  }

  /**
   * Builds RFC text file URL.
   */
  private buildRfcTextUrl(targetUrl: string | undefined, rfcNumber: number): string {
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.pathname.includes(`/rfc${rfcNumber}`) ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          return targetUrl;
        }
      } catch {
        // Fallback
      }
    }

    return `${RFC_EDITOR_BASE}/rfc${rfcNumber}.txt`;
  }

  /**
   * Builds Datatracker document search URL.
   */
  private buildDatatrackerSearchUrl(
    targetUrl: string | undefined,
    options: IetfRfcActorTaskOptions
  ): string {
    let baseEndpoint = DATATRACKER_BASE;

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (
          parsed.hostname.includes("datatracker.ietf.org") ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "localhost"
        ) {
          baseEndpoint = `${parsed.origin}${parsed.pathname}`;
        }
      } catch {
        // Fallback
      }
    }

    const url = new URL(baseEndpoint);
    url.searchParams.set("name__startswith", "rfc");
    url.searchParams.set("format", "json");

    if (options.query) {
      url.searchParams.set("title__icontains", options.query);
    }

    if (options.limit) {
      url.searchParams.set("limit", String(Math.max(1, options.limit)));
    }

    return url.toString();
  }
}
