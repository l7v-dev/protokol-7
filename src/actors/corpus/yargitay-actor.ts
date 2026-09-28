/**
 * YargitayActor - Yargıtay and Danıştay judicial precedents, supreme court chamber decisions,
 * and legal reasoning extraction actor.
 * Conforms to docs/actor-contract.md and docs/actors/yargitay.md.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  YargitayActorResult,
  YargitayActorTaskOptions,
  YargitayDecisionItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const YARGITAY_BASE = "https://karararama.yargitay.gov.tr";
const DANISTAY_BASE = "https://karararama.danistay.gov.tr";

export class YargitayActor implements IActor<YargitayActorResult> {
  readonly actorType = "yargitay" as const;
  readonly description =
    "Yargıtay and Danıştay judicial precedents, supreme court chamber decisions, and legal reasoning extraction actor.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<YargitayActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: YargitayActorTaskOptions =
      task.options?.yargitayOptions || (task.options as YargitayActorTaskOptions) || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if provided
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

      // 2. Resolve endpoint URL
      const endpoint = this.buildEndpointUrl(task.targetUrl, options);

      // 3. Secondary SSRF check on resolved endpoint
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed on target endpoint: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 4. Dispatch HTTP request with abort controller
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/html;q=0.9, */*;q=0.8",
          },
          timeoutMs,
          allowLocalNetwork,
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
          errorMessage: `Upstream request failed with HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Parse response (supports both JSON API and HTML)
      const rawText = await response.text();
      const resultData = this.parseResponse(rawText, endpoint, options);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: resultData,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Constructs the upstream query URL from options.
   */
  buildEndpointUrl(targetUrl?: string, options?: YargitayActorTaskOptions): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    const isDanistay = options?.court?.toLowerCase() === "danistay";
    const baseUrl = isDanistay ? DANISTAY_BASE : YARGITAY_BASE;
    const url = new URL(`${baseUrl}/arama`);

    if (options?.query) {
      url.searchParams.set("q", options.query.trim());
    }
    if (options?.chamber) {
      url.searchParams.set("daire", options.chamber.trim());
    }
    if (options?.caseNumber) {
      url.searchParams.set("esasNo", options.caseNumber.trim());
    }
    if (options?.decisionNumber) {
      url.searchParams.set("kararNo", options.decisionNumber.trim());
    }
    if (options?.year) {
      url.searchParams.set("yil", String(options.year));
    }
    if (options?.legalArea && options.legalArea !== "all") {
      url.searchParams.set("hukukAlani", options.legalArea);
    }
    if (options?.limit) {
      url.searchParams.set("limit", String(options.limit));
    }

    return url.href;
  }

  /**
   * Normalizes raw response into structured decisions.
   */
  private parseResponse(
    rawText: string,
    queryUrl: string,
    options: YargitayActorTaskOptions
  ): YargitayActorResult {
    const isDanistay = options.court?.toLowerCase() === "danistay" || queryUrl.includes("danistay");
    const courtName = isDanistay ? "Danıştay" : "Yargıtay";

    // Attempt JSON parse first
    try {
      const parsed = JSON.parse(rawText);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.data)
          ? parsed.data
          : Array.isArray(parsed.results)
            ? parsed.results
            : Array.isArray(parsed.kararlar)
              ? parsed.kararlar
              : [];

      if (items.length > 0) {
        return this.parseJsonDecisions(items, queryUrl, courtName, options);
      }
    } catch {
      // Fallback to HTML parsing
    }

    return this.parseHtmlDecisions(rawText, queryUrl, courtName, options);
  }

  /**
   * Parses JSON decision records.
   */
  private parseJsonDecisions(
    rawItems: Record<string, unknown>[],
    queryUrl: string,
    courtName: string,
    options: YargitayActorTaskOptions
  ): YargitayActorResult {
    let decisions: YargitayDecisionItem[] = rawItems.map((item, index) => {
      const chamber = String(item.daire || item.chamber || item.mahkeme || "Genel Kurul").trim();
      const caseNumber = String(item.esasNo || item.caseNumber || item.esas || "").trim();
      const decisionNumber = String(item.kararNo || item.decisionNumber || item.karar || "").trim();
      const decisionDate = String(item.kararTarihi || item.decisionDate || item.tarih || "").trim();
      const subject =
        item.konu || item.subject ? String(item.konu || item.subject).trim() : undefined;
      const summary =
        item.ozet || item.summary ? String(item.ozet || item.summary).trim() : undefined;
      const fullText =
        item.metin || item.fullText || item.gerekce
          ? String(item.metin || item.fullText || item.gerekce).trim()
          : undefined;
      const id = String(
        item.id || `${courtName.toLowerCase()}-${caseNumber}-${decisionNumber || index + 1}`
      );
      const itemUrl = item.url ? String(item.url) : `${queryUrl}#${id}`;

      return {
        id,
        court: courtName,
        chamber,
        caseNumber,
        decisionNumber,
        decisionDate,
        legalArea:
          (item.hukukAlani as string) ||
          (chamber.toLowerCase().includes("ceza") ? "Ceza" : "Hukuk"),
        subject,
        summary,
        fullText,
        url: itemUrl,
        metadata: {
          rawItem: item,
        },
      };
    });

    decisions = this.applyFilters(decisions, options);
    const markdown = this.renderMarkdownSummary(courtName, decisions, queryUrl);

    return {
      totalCount: decisions.length,
      court: courtName,
      decisions,
      queryUrl,
      markdown,
    };
  }

  /**
   * Parses HTML decision tables, lists, or cards.
   */
  private parseHtmlDecisions(
    html: string,
    queryUrl: string,
    courtName: string,
    options: YargitayActorTaskOptions
  ): YargitayActorResult {
    const $ = cheerio.load(html);
    const decisions: YargitayDecisionItem[] = [];

    // Table rows or card elements
    $("table tbody tr, div.karar-kart, div.card, div.result-item").each((index, el) => {
      const $el = $(el);
      const rowText = $el.text().replace(/\s+/g, " ").trim();
      if (!rowText || rowText.length < 10) return;

      const cells = $el.find("td");
      let chamber = "";
      let caseNumber = "";
      let decisionNumber = "";
      let decisionDate = "";
      let summary = "";
      let fullText: string | undefined;

      if (cells.length >= 3) {
        chamber = $(cells[0]).text().trim();
        caseNumber = $(cells[1]).text().trim();
        decisionNumber = $(cells[2]).text().trim();
        if (cells.length >= 4) {
          decisionDate = $(cells[3]).text().trim();
        }
        if (cells.length >= 5) {
          summary = $(cells[4]).text().trim();
        }
      } else {
        // Card or free text layout with regex matching
        const chamberMatch = rowText.match(
          /(\d+\.\s*(?:Hukuk|Ceza|İdari|Daire|Vergi)\s*Dairesi|Hukuk\s*Genel\s*Kurulu|Ceza\s*Genel\s*Kurulu)/i
        );
        if (chamberMatch) chamber = chamberMatch[1].trim();

        const caseMatch =
          rowText.match(/Esas\s*No\.?\s*[:\s]*(\d+\/\d+)/i) || rowText.match(/E\.?\s*(\d+\/\d+)/i);
        if (caseMatch) caseNumber = caseMatch[1].trim();

        const decisionMatch =
          rowText.match(/Karar\s*No\.?\s*[:\s]*(\d+\/\d+)/i) || rowText.match(/K\.?\s*(\d+\/\d+)/i);
        if (decisionMatch) decisionNumber = decisionMatch[1].trim();

        const dateMatch =
          rowText.match(/Tarih\s*[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i) ||
          rowText.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i);
        if (dateMatch) decisionDate = dateMatch[1].trim();

        summary = rowText.substring(0, 300);
      }

      const href = $el.find("a").first().attr("href")?.trim();
      const id = `${courtName.toLowerCase()}-${caseNumber.replace(/\//g, "-") || index + 1}`;
      const itemUrl = href ? new URL(href, queryUrl).href : `${queryUrl}#${id}`;

      // Extract full text if paragraph/gerekce block exists
      const bodyText = $el.find(".karar-metin, .gerekce, p").text().trim();
      if (bodyText.length > 50) {
        fullText = bodyText;
      }

      if (chamber || caseNumber || decisionNumber) {
        decisions.push({
          id,
          court: courtName,
          chamber: chamber || "Daire Belirtilmemiş",
          caseNumber: caseNumber || "-",
          decisionNumber: decisionNumber || "-",
          decisionDate: decisionDate || "-",
          legalArea: chamber.toLowerCase().includes("ceza") ? "Ceza" : "Hukuk",
          summary: summary || undefined,
          fullText,
          url: itemUrl,
        });
      }
    });

    // If single decision view HTML
    if (decisions.length === 0) {
      const pageText = $("body").text().trim();
      if (pageText.length > 50) {
        const title = $("h1, h2, title").first().text().trim() || `${courtName} Kararı`;
        decisions.push({
          id: `${courtName.toLowerCase()}-doc`,
          court: courtName,
          chamber: "Genel",
          caseNumber: "-",
          decisionNumber: "-",
          decisionDate: "-",
          summary: title,
          fullText: pageText,
          url: queryUrl,
        });
      }
    }

    const filtered = this.applyFilters(decisions, options);
    const markdown = this.renderMarkdownSummary(courtName, filtered, queryUrl);

    return {
      totalCount: filtered.length,
      court: courtName,
      decisions: filtered,
      queryUrl,
      markdown,
    };
  }

  /**
   * Applies options filters (query, chamber, legalArea, limit).
   */
  private applyFilters(
    items: YargitayDecisionItem[],
    options: YargitayActorTaskOptions
  ): YargitayDecisionItem[] {
    let result = items;

    if (options.chamber) {
      const targetChamber = normalizeTurkishText(options.chamber);
      result = result.filter((d) => normalizeTurkishText(d.chamber).includes(targetChamber));
    }

    if (options.caseNumber) {
      const targetCase = options.caseNumber.trim();
      result = result.filter((d) => d.caseNumber.includes(targetCase));
    }

    if (options.decisionNumber) {
      const targetDec = options.decisionNumber.trim();
      result = result.filter((d) => d.decisionNumber.includes(targetDec));
    }

    if (options.legalArea && options.legalArea !== "all") {
      const targetArea = normalizeTurkishText(options.legalArea);
      result = result.filter(
        (d) => d.legalArea && normalizeTurkishText(d.legalArea).includes(targetArea)
      );
    }

    if (options.query) {
      const targetQuery = normalizeTurkishText(options.query);
      result = result.filter((d) => {
        const normSummary = d.summary ? normalizeTurkishText(d.summary) : "";
        const normFull = d.fullText ? normalizeTurkishText(d.fullText) : "";
        const normSubject = d.subject ? normalizeTurkishText(d.subject) : "";
        const normChamber = normalizeTurkishText(d.chamber);
        return (
          normSummary.includes(targetQuery) ||
          normFull.includes(targetQuery) ||
          normSubject.includes(targetQuery) ||
          normChamber.includes(targetQuery)
        );
      });
    }

    if (options.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * Formats decisions into LLM-ready GFM Markdown.
   */
  private renderMarkdownSummary(
    courtName: string,
    decisions: YargitayDecisionItem[],
    queryUrl: string
  ): string {
    const lines: string[] = [];
    lines.push(`# ${courtName} Emsal İçtihat Kararları`);
    lines.push(`**Kaynak URL:** [${queryUrl}](${queryUrl})`);
    lines.push(`**Toplam Karar:** ${decisions.length}\n`);

    for (const d of decisions) {
      lines.push(`## ${d.chamber} — E. ${d.caseNumber}, K. ${d.decisionNumber}`);
      lines.push(
        `* **Tarih:** ${d.decisionDate} | **Alan:** ${d.legalArea || "Hukuk"} | **Bağlantı:** [Karar Metni](${d.url})`
      );

      if (d.subject) {
        lines.push(`* **Konu:** ${d.subject}`);
      }

      if (d.summary) {
        lines.push(`\n**Özet:** ${d.summary}\n`);
      }

      if (d.fullText) {
        const preview = d.fullText.length > 600 ? `${d.fullText.substring(0, 600)}...` : d.fullText;
        lines.push(`\n> ${preview}\n`);
      }

      lines.push("---\n");
    }

    return lines.join("\n");
  }
}

/**
 * Normalizes Turkish characters and diacritics for deterministic matching.
 */
function normalizeTurkishText(str: string): string {
  return str
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .trim();
}
