/**
 * DanistayActor - T.C. Danıştay Başkanlığı (Council of State of Turkey)
 * administrative supreme court, tax dispute chambers, and precedent case law extraction actor.
 * Conforms to docs/actor-contract.md and docs/plans/turk-hukuku-ve-patent-aktorleri-plani.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  DanistayAction,
  DanistayActorResult,
  DanistayActorTaskOptions,
  DanistayDecisionDetail,
  DanistayDecisionItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const DANISTAY_BASE = "https://karararama.danistay.gov.tr";

export class DanistayActor implements IActor<DanistayActorResult> {
  readonly actorType = "danistay" as const;
  readonly description =
    "T.C. Danıştay Başkanlığı administrative supreme court decisions, chamber precedents, and tax judicial review extraction actor.";

  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });
    this.turndown.remove(["script", "style", "nav", "footer", "iframe", "noscript"]);
  }

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DanistayActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: DanistayActorTaskOptions =
      task.options?.danistayOptions || (task.options as DanistayActorTaskOptions) || {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      const action = this.resolveAction(task.targetUrl, options.action);

      // Initial SSRF check on targetUrl if provided
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });
        if (!initialCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      const endpoint = this.buildEndpointUrl(task.targetUrl, action, options);

      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, { allowLocalNetwork });
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

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

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
        clearTimeout(timer);
      }

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Upstream Danıştay request failed with HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const rawText = await response.text();
      const resultData = this.parseResponse(rawText, endpoint, action, options);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: resultData,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves action mode from URL or options.
   */
  resolveAction(targetUrl?: string, specifiedAction?: DanistayAction): DanistayAction {
    if (specifiedAction) return specifiedAction;

    if (targetUrl) {
      const lower = targetUrl.toLowerCase();
      if (lower.includes("/karar/") || lower.includes("/detay/") || lower.includes("/belge/")) {
        return "decision";
      }
    }

    return "search";
  }

  /**
   * Constructs request endpoint URL.
   */
  buildEndpointUrl(
    targetUrl?: string,
    action: DanistayAction = "search",
    options?: DanistayActorTaskOptions
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    const baseUrl = DANISTAY_BASE;

    if (action === "decision") {
      const decisionId = options?.decisionId || "1";
      return `${baseUrl}/karar/${encodeURIComponent(decisionId)}`;
    }

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
    if (options?.decisionType) {
      url.searchParams.set("kararTuru", options.decisionType);
    }
    if (options?.limit) {
      url.searchParams.set("limit", String(options.limit));
    }
    if (options?.offset) {
      url.searchParams.set("offset", String(options.offset));
    }

    return url.href;
  }

  /**
   * Parses JSON or HTML response into DanistayActorResult.
   */
  private parseResponse(
    rawText: string,
    queryUrl: string,
    action: DanistayAction,
    options: DanistayActorTaskOptions
  ): DanistayActorResult {
    // Attempt JSON parse
    try {
      const parsed = JSON.parse(rawText);
      if (action === "decision" && (parsed.karar || parsed.metin || parsed.decision)) {
        return this.parseJsonDecisionDetail(parsed, queryUrl);
      }

      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.data)
          ? parsed.data
          : Array.isArray(parsed.kararlar)
            ? parsed.kararlar
            : Array.isArray(parsed.results)
              ? parsed.results
              : [];

      if (items.length > 0 || parsed.total !== undefined) {
        return this.parseJsonDecisions(items, queryUrl, action, parsed.total);
      }
    } catch {
      // Fallback to HTML
    }

    if (action === "decision") {
      return this.parseHtmlDecisionDetail(rawText, queryUrl);
    }

    return this.parseHtmlDecisions(rawText, queryUrl, action, options);
  }

  /**
   * Parses JSON list of Danıştay decisions.
   */
  private parseJsonDecisions(
    rawItems: Record<string, unknown>[],
    queryUrl: string,
    action: DanistayAction,
    explicitTotal?: number
  ): DanistayActorResult {
    const decisions: DanistayDecisionItem[] = rawItems.map((item, index) => {
      const id = String(item.id || item.kararId || `danistay-${index + 1}`);
      const chamber = String(item.daire || item.chamber || "Danıştay Dairesi").trim();
      const caseNumber = String(item.esasNo || item.esas || "-").trim();
      const decisionNumber = String(item.kararNo || item.karar || "-").trim();
      const decisionDate = String(
        item.kararTarihi || item.tarih || item.decisionDate || "Belirtilmemiş"
      ).trim();
      const legalArea = String(
        item.hukukAlani ||
          item.legalArea ||
          (chamber.toLowerCase().includes("vergi") ? "Vergi" : "İdare")
      ).trim();
      const decisionType =
        item.kararTuru || item.kararSonucu
          ? String(item.kararTuru || item.kararSonucu).trim()
          : undefined;
      const subject =
        item.konu || item.subject ? String(item.konu || item.subject).trim() : undefined;
      const summary =
        item.ozet || item.summary ? String(item.ozet || item.summary).trim() : undefined;
      const url = item.url ? String(item.url) : `${DANISTAY_BASE}/karar/${encodeURIComponent(id)}`;

      return {
        id,
        chamber,
        caseNumber,
        decisionNumber,
        decisionDate,
        legalArea,
        decisionType,
        subject,
        summary,
        url,
      };
    });

    const markdown = this.renderDecisionsMarkdown(decisions, queryUrl);

    return {
      action,
      queryUrl,
      totalResults: explicitTotal !== undefined ? explicitTotal : decisions.length,
      decisions,
      markdown,
    };
  }

  /**
   * Parses JSON single Danıştay decision detail.
   */
  private parseJsonDecisionDetail(
    data: Record<string, unknown>,
    queryUrl: string
  ): DanistayActorResult {
    const rawDecision = (data.karar || data) as Record<string, unknown>;
    const id = String(rawDecision.id || rawDecision.kararId || "danistay-detay");
    const chamber = String(rawDecision.daire || rawDecision.chamber || "Danıştay").trim();
    const caseNumber = String(rawDecision.esasNo || rawDecision.esas || "-").trim();
    const decisionNumber = String(rawDecision.kararNo || rawDecision.karar || "-").trim();
    const decisionDate = String(
      rawDecision.kararTarihi || rawDecision.decisionDate || "Belirtilmemiş"
    ).trim();
    const legalArea = String(
      rawDecision.hukukAlani || (chamber.toLowerCase().includes("vergi") ? "Vergi" : "İdare")
    ).trim();
    const decisionType = rawDecision.kararTuru ? String(rawDecision.kararTuru).trim() : undefined;
    const lowerCourt = rawDecision.ilkDereceMahkemesi
      ? String(rawDecision.ilkDereceMahkemesi).trim()
      : undefined;
    const appellant = rawDecision.temyizEden ? String(rawDecision.temyizEden).trim() : undefined;
    const appellee = rawDecision.karsiTaraf ? String(rawDecision.karsiTaraf).trim() : undefined;
    const reporterOpinion = rawDecision.tetkikHakimi
      ? String(rawDecision.tetkikHakimi).trim()
      : undefined;
    const prosecutorOpinion = rawDecision.danistaySavcisi
      ? String(rawDecision.danistaySavcisi).trim()
      : undefined;
    const facts = rawDecision.maddiOlaylar ? String(rawDecision.maddiOlaylar).trim() : undefined;
    const legalReasoning = rawDecision.hukukiGerekce
      ? String(rawDecision.hukukiGerekce).trim()
      : undefined;
    const verdict = rawDecision.hukum ? String(rawDecision.hukum).trim() : undefined;

    const fullTextHtml = String(rawDecision.metin || rawDecision.fullText || "");
    const fullTextMarkdown = fullTextHtml.includes("<")
      ? this.turndown.turndown(fullTextHtml)
      : fullTextHtml || String(rawDecision.ozet || "");

    const dissentingOpinions: Array<{ member: string; text: string }> = [];
    if (Array.isArray(rawDecision.karsiOylar)) {
      for (const ko of rawDecision.karsiOylar as Record<string, unknown>[]) {
        dissentingOpinions.push({
          member: String(ko.uye || ko.hakim || "Üye").trim(),
          text: String(ko.metin || ko.text || "").trim(),
        });
      }
    }

    const detail: DanistayDecisionDetail = {
      id,
      chamber,
      caseNumber,
      decisionNumber,
      decisionDate,
      legalArea,
      decisionType,
      lowerCourt,
      appellant,
      appellee,
      reporterOpinion,
      prosecutorOpinion,
      facts,
      legalReasoning,
      verdict,
      dissentingOpinions: dissentingOpinions.length > 0 ? dissentingOpinions : undefined,
      fullTextMarkdown,
      url: queryUrl,
    };

    const markdown = this.renderDetailMarkdown(detail);

    return {
      action: "decision",
      queryUrl,
      totalResults: 1,
      decisions: [detail],
      decision: detail,
      markdown,
    };
  }

  /**
   * Parses HTML decision table from Danıştay Karar Arama.
   */
  private parseHtmlDecisions(
    html: string,
    queryUrl: string,
    action: DanistayAction,
    options: DanistayActorTaskOptions
  ): DanistayActorResult {
    const $ = cheerio.load(html);
    const decisions: DanistayDecisionItem[] = [];

    $("table tbody tr, .karar-row, .result-item").each((index, el) => {
      const $row = $(el);
      const link = $row.find("a").first();
      const href = link.attr("href") || "";
      const text = $row.text().replace(/\s+/g, " ").trim();
      if (!text || text.length < 5) return;

      const cells = $row.find("td");
      let chamber = options.chamber || "Danıştay Dairesi";
      let caseNumber = "-";
      let decisionNumber = "-";
      let decisionDate = "Belirtilmemiş";
      let decisionType: string | undefined;

      if (cells.length >= 4) {
        chamber = $(cells[0]).text().trim() || chamber;
        caseNumber = $(cells[1]).text().trim() || caseNumber;
        decisionNumber = $(cells[2]).text().trim() || decisionNumber;
        decisionDate = $(cells[3]).text().trim() || decisionDate;
        if (cells.length >= 5) {
          decisionType = $(cells[4]).text().trim() || decisionType;
        }
      } else {
        const daireMatch = text.match(/(\d+\.?\s*Daire|İDDK|VDDK|İBK)/i);
        if (daireMatch) chamber = daireMatch[1];

        const esasMatch = text.match(/E\.?\s*([0-9/]+)/i);
        if (esasMatch) caseNumber = esasMatch[1];

        const kararMatch = text.match(/K\.?\s*([0-9/]+)/i);
        if (kararMatch) decisionNumber = kararMatch[1];

        const dateMatch = text.match(/(\d{2}[./-]\d{2}[./-]\d{4})/);
        if (dateMatch) decisionDate = dateMatch[1];

        if (text.includes("BOZULMASINA")) decisionType = "Bozma";
        else if (text.includes("ONANMASINA")) decisionType = "Onama";
        else if (text.includes("İPTALİNE")) decisionType = "İptal";
        else if (text.includes("REDDİNE")) decisionType = "Ret";
      }

      const id = href
        ? href.split("/").filter(Boolean).pop() || `danistay-${index + 1}`
        : `danistay-${index + 1}`;
      const itemUrl = href.startsWith("http")
        ? href
        : href
          ? `${DANISTAY_BASE}${href.startsWith("/") ? "" : "/"}${href}`
          : `${queryUrl}#${id}`;

      const legalArea = chamber.toLowerCase().includes("vergi") ? "Vergi" : "İdare";

      decisions.push({
        id,
        chamber,
        caseNumber,
        decisionNumber,
        decisionDate,
        legalArea,
        decisionType,
        url: itemUrl,
      });
    });

    const markdown = this.renderDecisionsMarkdown(decisions, queryUrl);

    return {
      action,
      queryUrl,
      totalResults: decisions.length,
      decisions,
      markdown,
    };
  }

  /**
   * Parses HTML single Danıştay decision view.
   */
  private parseHtmlDecisionDetail(html: string, queryUrl: string): DanistayActorResult {
    const $ = cheerio.load(html);

    const contentEl = $(".karar-metni, .decision-body, #kararMetni, article, .content").first();
    const rawHtml = contentEl.length > 0 ? contentEl.html() || "" : $("body").html() || "";
    const fullTextMarkdown = this.turndown.turndown(rawHtml);

    const bodyText = $("body").text();
    const daireMatch = bodyText.match(/(T\.C\.\s*DANIŞTAY\s*[^,\n\r]+)/i);
    const esasMatch = bodyText.match(/Esas\s*No\s*:\s*([0-9/]+)/i);
    const kararMatch = bodyText.match(/Karar\s*No\s*:\s*([0-9/]+)/i);
    const dateMatch = bodyText.match(/Karar\s*Tarihi\s*:\s*(\d{2}[./-]\d{2}[./-]\d{4})/i);

    let decisionType: string | undefined;
    if (bodyText.includes("BOZULMASINA")) decisionType = "Bozma";
    else if (bodyText.includes("ONANMASINA")) decisionType = "Onama";
    else if (bodyText.includes("İPTALİNE")) decisionType = "İptal";
    else if (bodyText.includes("REDDİNE")) decisionType = "Ret";

    const chamber = daireMatch ? daireMatch[1].trim() : "Danıştay Dairesi";
    const id = queryUrl.split("/").filter(Boolean).pop() || "danistay-detay";
    const legalArea = chamber.toLowerCase().includes("vergi") ? "Vergi" : "İdare";

    const detail: DanistayDecisionDetail = {
      id,
      chamber,
      caseNumber: esasMatch ? esasMatch[1] : "-",
      decisionNumber: kararMatch ? kararMatch[1] : "-",
      decisionDate: dateMatch ? dateMatch[1] : "Belirtilmemiş",
      legalArea,
      decisionType,
      fullTextMarkdown,
      url: queryUrl,
    };

    const markdown = this.renderDetailMarkdown(detail);

    return {
      action: "decision",
      queryUrl,
      totalResults: 1,
      decisions: [detail],
      decision: detail,
      markdown,
    };
  }

  private renderDecisionsMarkdown(decisions: DanistayDecisionItem[], queryUrl: string): string {
    const lines: string[] = [
      "# T.C. Danıştay Başkanlığı Emsal Karar Listesi",
      "",
      `- **Sorgu Kaynağı:** [${queryUrl}](${queryUrl})`,
      `- **Toplam Karar:** ${decisions.length}`,
      "",
      "| # | Daire | Esas No | Karar No | Karar Tarihi | Alan | Karar Türü | Bağlantı |",
      "|---|---|---|---|---|---|---|---|",
    ];

    decisions.forEach((item, idx) => {
      lines.push(
        `| ${idx + 1} | ${item.chamber} | ${item.caseNumber} | ${item.decisionNumber} | ${item.decisionDate} | ${item.legalArea} | ${item.decisionType || "-"} | [Kararı İncele](${item.url}) |`
      );
    });

    lines.push("");
    return lines.join("\n");
  }

  private renderDetailMarkdown(detail: DanistayDecisionDetail): string {
    const lines: string[] = [
      `# T.C. Danıştay Kararı (E. ${detail.caseNumber}, K. ${detail.decisionNumber})`,
      "",
      `- **Daire:** ${detail.chamber}`,
      `- **Esas Numarası:** ${detail.caseNumber}`,
      `- **Karar Numarası:** ${detail.decisionNumber}`,
      `- **Karar Tarihi:** ${detail.decisionDate}`,
      `- **Hukuk Alanı:** ${detail.legalArea}`,
      `- **Karar Sonucu:** ${detail.decisionType || "Karara Bağlandı"}`,
      `- **Karar Kaynağı:** [${detail.url}](${detail.url})`,
    ];

    if (detail.lowerCourt) {
      lines.push(`- **İlk Derece Mahkemesi:** ${detail.lowerCourt}`);
    }
    if (detail.appellant) {
      lines.push(`- **Temyiz Eden:** ${detail.appellant}`);
    }
    if (detail.appellee) {
      lines.push(`- **Karşı Taraf:** ${detail.appellee}`);
    }

    lines.push("");
    lines.push("## Gerekçeli Karar Metni");
    lines.push("");
    lines.push(detail.fullTextMarkdown);

    if (detail.dissentingOpinions && detail.dissentingOpinions.length > 0) {
      lines.push("");
      lines.push("## Karşı Oylar");
      lines.push("");
      for (const ko of detail.dissentingOpinions) {
        lines.push(`### ${ko.member}`);
        lines.push("");
        lines.push(ko.text);
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
