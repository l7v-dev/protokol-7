/**
 * SecEdgarActor - U.S. Securities and Exchange Commission (SEC) EDGAR submissions and filings actor.
 * Interfaces with official SEC EDGAR Submissions API (data.sec.gov) to harvest corporate disclosures,
 * annual reports (10-K), quarterly reports (10-Q), material events (8-K), and primary document URLs.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  SecEdgarActorResult,
  SecEdgarActorTaskOptions,
  SecFilingItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const SEC_SUBMISSIONS_BASE = "https://data.sec.gov/submissions";
const SEC_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";

// Pre-seeded high-frequency ticker-to-CIK directory
const WELL_KNOWN_TICKERS: Record<string, string> = {
  AAPL: "0000320193",
  MSFT: "0000789019",
  GOOGL: "0001652044",
  GOOG: "0001652044",
  AMZN: "0001018724",
  NVDA: "0001045810",
  TSLA: "0001318605",
  META: "0001326801",
  BRK: "0001067983",
  JPM: "0000019617",
  V: "0001403161",
  WMT: "0000104169",
  PG: "0000080424",
  UNH: "0000731766",
  JNJ: "0000200406",
  HD: "0000354950",
  BAC: "0000070858",
  XOM: "0000034088",
  PFE: "0000078003",
  DIS: "0001744489",
};

interface RawRecentFilings {
  accessionNumber?: string[];
  filingDate?: string[];
  reportDate?: string[];
  acceptanceDateTime?: string[];
  act?: string[];
  form?: string[];
  fileNumber?: string[];
  filmNumber?: string[];
  items?: string[][];
  size?: number[];
  isXBRL?: number[];
  isInlineXBRL?: number[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}

interface RawSubmissionsResponse {
  cik?: string;
  entityType?: string;
  sic?: string;
  sicDescription?: string;
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  filings?: {
    recent?: RawRecentFilings;
  };
}

export class SecEdgarActor implements IActor<SecEdgarActorResult> {
  readonly actorType = "sec-edgar" as const;
  readonly description =
    "Queries SEC EDGAR Submissions API for corporate disclosures, 10-K/10-Q reports, and filing documents.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<SecEdgarActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: SecEdgarActorTaskOptions = task.options?.secEdgarOptions || {};
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

      const cik = this.resolveCik(task, options);
      if (!cik) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage:
            "Missing required CIK or ticker parameter. Provide 'cik' (e.g. '0000320193') or 'ticker' (e.g. 'AAPL').",
          executionDurationMs: Date.now() - startTime,
        };
      }

      const requestUrl = this.buildRequestUrl(task, cik);

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

      // SEC EDGAR requires a specific User-Agent format: Sample Company Name AdminContact@<sample company domain>.com
      const userAgent =
        process.env.SEC_EDGAR_USER_AGENT ||
        "protokol-7/1.0.0 (Corporate Research Tool; bot@protokol7.internal)";

      const response = await safeRedirectFetch(requestUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": userAgent,
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
          errorMessage: `SEC EDGAR API returned HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawJson = (await response.json()) as RawSubmissionsResponse;
      const entityName = rawJson.name || "Unknown Entity";
      const resolvedCik = rawJson.cik || cik || "0000000000";

      const recent = rawJson.filings?.recent || {};
      const allFilings = this.parseRecentFilings(resolvedCik, recent);

      const filteredFilings = this.filterFilings(allFilings, options);
      const markdown = this.synthesizeMarkdown(
        entityName,
        resolvedCik,
        rawJson.sic,
        rawJson.sicDescription,
        filteredFilings,
        allFilings.length
      );

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          cik: resolvedCik,
          entityName,
          sic: rawJson.sic,
          sicDescription: rawJson.sicDescription,
          tickers: rawJson.tickers,
          exchanges: rawJson.exchanges,
          totalFilings: allFilings.length,
          filings: filteredFilings,
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
        errorMessage: `SecEdgarActor execution failed: ${errorMsg}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveCik(task: ActorTask, options: SecEdgarActorTaskOptions): string | undefined {
    if (options.cik) {
      return this.formatCik(options.cik);
    }

    const rawTarget = (task.targetUrl || "").trim();
    if (!rawTarget.startsWith("http")) {
      const cikMatch = rawTarget.match(/\b\d{1,10}\b/);
      if (cikMatch) {
        return this.formatCik(cikMatch[0]);
      }

      const uppercaseTarget = rawTarget.toUpperCase();
      if (WELL_KNOWN_TICKERS[uppercaseTarget]) {
        return WELL_KNOWN_TICKERS[uppercaseTarget];
      }
    }

    if (options.ticker) {
      const upperTicker = options.ticker.trim().toUpperCase();
      if (WELL_KNOWN_TICKERS[upperTicker]) {
        return WELL_KNOWN_TICKERS[upperTicker];
      }
    }

    return undefined;
  }

  private formatCik(val: string | number): string {
    const digits = String(val).replace(/\D/g, "");
    return digits.padStart(10, "0");
  }

  private buildRequestUrl(task: ActorTask, cik?: string): string {
    const rawTarget = (task.targetUrl || "").trim();
    if (rawTarget.startsWith("http://") || rawTarget.startsWith("https://")) {
      return rawTarget;
    }

    const formattedCik = cik || "0000000000";
    return `${SEC_SUBMISSIONS_BASE}/CIK${formattedCik}.json`;
  }

  private parseRecentFilings(cik: string, recent: RawRecentFilings): SecFilingItem[] {
    const accessions = recent.accessionNumber || [];
    const dates = recent.filingDate || [];
    const forms = recent.form || [];
    const reportDates = recent.reportDate || [];
    const acceptanceTimes = recent.acceptanceDateTime || [];
    const acts = recent.act || [];
    const fileNumbers = recent.fileNumber || [];
    const filmNumbers = recent.filmNumber || [];
    const items = recent.items || [];
    const sizes = recent.size || [];
    const isXBRLList = recent.isXBRL || [];
    const isInlineXBRLList = recent.isInlineXBRL || [];
    const primaryDocs = recent.primaryDocument || [];
    const primaryDocDescs = recent.primaryDocDescription || [];

    const numericCik = String(parseInt(cik, 10));
    const itemsCount = accessions.length;
    const filings: SecFilingItem[] = [];

    for (let i = 0; i < itemsCount; i++) {
      const accessionNo = accessions[i];
      const form = forms[i] || "UNKNOWN";
      const primaryDoc = primaryDocs[i] || "";
      const cleanAccession = accessionNo ? accessionNo.replace(/-/g, "") : "";

      const documentUrl =
        cleanAccession && primaryDoc
          ? `${SEC_ARCHIVES_BASE}/${numericCik}/${cleanAccession}/${primaryDoc}`
          : "";

      filings.push({
        accessionNumber: accessionNo,
        filingDate: dates[i] || "",
        reportDate: reportDates[i] || undefined,
        acceptanceDateTime: acceptanceTimes[i] || undefined,
        act: acts[i] || undefined,
        form,
        fileNumber: fileNumbers[i] || undefined,
        filmNumber: filmNumbers[i] || undefined,
        items: Array.isArray(items[i]) ? items[i] : undefined,
        size: sizes[i] || undefined,
        isXBRL: isXBRLList[i] === 1,
        isInlineXBRL: isInlineXBRLList[i] === 1,
        primaryDocument: primaryDoc,
        primaryDocDescription: primaryDocDescs[i] || undefined,
        documentUrl,
      });
    }

    return filings;
  }

  private filterFilings(
    filings: SecFilingItem[],
    options: SecEdgarActorTaskOptions
  ): SecFilingItem[] {
    let result = filings;

    const formFilter = options.formType || options.form;
    if (formFilter) {
      const targetForm = formFilter.trim().toUpperCase();
      result = result.filter((f) => f.form.toUpperCase() === targetForm);
    }

    const limit = Math.min(Math.max(options.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
    return result.slice(0, limit);
  }

  private synthesizeMarkdown(
    entityName: string,
    cik: string,
    sic?: string,
    sicDescription?: string,
    filings: SecFilingItem[] = [],
    totalFilings = 0
  ): string {
    const lines: string[] = [];
    lines.push(`# SEC EDGAR Filings: ${entityName} (CIK: ${cik})`);
    if (sic) lines.push(`- **SIC**: ${sic} (${sicDescription || "Industry Classification"})`);
    lines.push(`- **Total Filings on Record**: ${totalFilings}`);
    lines.push(`- **Returned Disclosures**: ${filings.length}`);
    lines.push("");

    if (filings.length === 0) {
      lines.push("No filings matched the specified criteria.");
      return lines.join("\n");
    }

    lines.push("| Form | Filing Date | Report Date | Accession Number | Primary Document |");
    lines.push("|---|---|---|---|---|");

    for (const f of filings) {
      const docLink = f.documentUrl
        ? `[${f.primaryDocument}](${f.documentUrl})`
        : f.primaryDocument || "N/A";
      lines.push(
        `| **${f.form}** | ${f.filingDate} | ${f.reportDate || "-"} | \`${f.accessionNumber}\` | ${docLink} |`
      );
    }

    lines.push("");
    return lines.join("\n").trim();
  }
}
