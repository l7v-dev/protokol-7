/**
 * AnayasaMahkemesiActor - T.C. Anayasa Mahkemesi (AYM) Constitutional Court of Turkey
 * decisions, norm reviews, individual application judgments, and fundamental rights precedent extraction actor.
 * Conforms to docs/actor-contract.md and docs/plans/turk-hukuku-ve-patent-aktorleri-plani.md.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  AnayasaMahkemesiAction,
  AnayasaMahkemesiActorResult,
  AnayasaMahkemesiActorTaskOptions,
  AnayasaMahkemesiDecisionDetail,
  AnayasaMahkemesiDecisionItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const AYM_BASE = "https://kararlarbilgibankasi.anayasa.gov.tr";

export class AnayasaMahkemesiActor implements IActor<AnayasaMahkemesiActorResult> {
  readonly actorType = "anayasa-mahkemesi" as const;
  readonly description =
    "T.C. Anayasa Mahkemesi (AYM) norm reviews, individual applications, and constitutional case law extraction actor.";

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

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<AnayasaMahkemesiActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: AnayasaMahkemesiActorTaskOptions =
      task.options?.anayasaMahkemesiOptions ||
      (task.options as AnayasaMahkemesiActorTaskOptions) ||
      {};
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
          errorMessage: `Upstream AYM request failed with HTTP ${response.status}: ${response.statusText}`,
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
   * Resolves action mode from URL or task options.
   */
  resolveAction(
    targetUrl?: string,
    specifiedAction?: AnayasaMahkemesiAction
  ): AnayasaMahkemesiAction {
    if (specifiedAction) return specifiedAction;

    if (targetUrl) {
      const lower = targetUrl.toLowerCase();
      if (lower.includes("/bireysel") || lower.includes("bireyselbasvuru")) {
        return "individual_application";
      }
      if (lower.includes("/norm") || lower.includes("normdenetimi")) {
        return "norm_review";
      }
      if (lower.includes("/karar/") || lower.includes("/detay/")) {
        return "decision";
      }
    }

    return "search";
  }

  /**
   * Builds request endpoint URL based on action and options.
   */
  buildEndpointUrl(
    targetUrl?: string,
    action: AnayasaMahkemesiAction = "search",
    options?: AnayasaMahkemesiActorTaskOptions
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    const baseUrl = AYM_BASE;

    if (action === "decision") {
      const decisionId = options?.decisionId || "1";
      return `${baseUrl}/karar/${encodeURIComponent(decisionId)}`;
    }

    const url = new URL(`${baseUrl}/arama`);

    if (action === "individual_application") {
      url.searchParams.set("kategori", "bireysel");
      if (options?.applicationNumber) {
        url.searchParams.set("basvuruNo", options.applicationNumber.trim());
      }
    } else if (action === "norm_review") {
      url.searchParams.set("kategori", "norm");
      if (options?.caseNumber) {
        url.searchParams.set("esasNo", options.caseNumber.trim());
      }
      if (options?.decisionNumber) {
        url.searchParams.set("kararNo", options.decisionNumber.trim());
      }
    } else if (options?.category && options.category !== "all") {
      url.searchParams.set("kategori", options.category);
    }

    if (options?.query) {
      url.searchParams.set("q", options.query.trim());
    }
    if (options?.right) {
      url.searchParams.set("hak", options.right.trim());
    }
    if (options?.outcome) {
      url.searchParams.set("sonuc", options.outcome.trim());
    }
    if (options?.year) {
      url.searchParams.set("yil", String(options.year));
    }
    if (options?.startDate) {
      url.searchParams.set("baslangic", options.startDate);
    }
    if (options?.endDate) {
      url.searchParams.set("bitis", options.endDate);
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
   * Parses either JSON or HTML response into structured AnayasaMahkemesiActorResult.
   */
  private parseResponse(
    rawText: string,
    queryUrl: string,
    action: AnayasaMahkemesiAction,
    options: AnayasaMahkemesiActorTaskOptions
  ): AnayasaMahkemesiActorResult {
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
      // Fallback to HTML parsing
    }

    if (action === "decision") {
      return this.parseHtmlDecisionDetail(rawText, queryUrl);
    }

    return this.parseHtmlDecisions(rawText, queryUrl, action, options);
  }

  /**
   * Parses JSON list of decisions.
   */
  private parseJsonDecisions(
    rawItems: Record<string, unknown>[],
    queryUrl: string,
    action: AnayasaMahkemesiAction,
    explicitTotal?: number
  ): AnayasaMahkemesiActorResult {
    const decisions: AnayasaMahkemesiDecisionItem[] = rawItems.map((item, index) => {
      const id = String(item.id || item.kararId || `aym-${index + 1}`);
      const category = this.normalizeCategory(item.kategori || item.category || action);
      const caseNumber = item.esasNo ? String(item.esasNo).trim() : undefined;
      const decisionNumber = item.kararNo ? String(item.kararNo).trim() : undefined;
      const applicationNumber = item.basvuruNo ? String(item.basvuruNo).trim() : undefined;
      const applicationDate = item.basvuruTarihi ? String(item.basvuruTarihi).trim() : undefined;
      const decisionDate = String(
        item.kararTarihi || item.tarih || item.decisionDate || "Belirtilmemiş"
      ).trim();
      const officialGazetteDate = item.resmiGazeteTarihi
        ? String(item.resmiGazeteTarihi).trim()
        : undefined;
      const officialGazetteNumber = item.resmiGazeteSayisi
        ? String(item.resmiGazeteSayisi).trim()
        : undefined;

      const title = String(
        item.baslik ||
          item.title ||
          (applicationNumber
            ? `Bireysel Başvuru No: ${applicationNumber}`
            : `E. ${caseNumber || "-"}, K. ${decisionNumber || "-"}`)
      ).trim();

      const applicant = item.basvurucu ? String(item.basvurucu).trim() : undefined;
      const violatedRights = Array.isArray(item.ihlalEdilenHaklar)
        ? (item.ihlalEdilenHaklar as string[])
        : Array.isArray(item.rights)
          ? (item.rights as string[])
          : item.hak
            ? [String(item.hak).trim()]
            : undefined;

      const outcome = String(
        item.sonuc || item.outcome || item.kararSonucu || "Karara Bağlandı"
      ).trim();
      const summary =
        item.ozet || item.summary ? String(item.ozet || item.summary).trim() : undefined;
      const url = item.url ? String(item.url) : `${AYM_BASE}/karar/${encodeURIComponent(id)}`;

      return {
        id,
        category,
        caseNumber,
        decisionNumber,
        applicationNumber,
        applicationDate,
        decisionDate,
        officialGazetteDate,
        officialGazetteNumber,
        title,
        applicant,
        violatedRights,
        outcome,
        summary,
        url,
      };
    });

    const markdown = this.renderDecisionsMarkdown(decisions, action, queryUrl);

    return {
      action,
      queryUrl,
      totalResults: explicitTotal !== undefined ? explicitTotal : decisions.length,
      decisions,
      markdown,
    };
  }

  /**
   * Parses JSON single decision detail.
   */
  private parseJsonDecisionDetail(
    data: Record<string, unknown>,
    queryUrl: string
  ): AnayasaMahkemesiActorResult {
    const rawDecision = (data.karar || data) as Record<string, unknown>;
    const id = String(rawDecision.id || rawDecision.kararId || "aym-detay");
    const category = this.normalizeCategory(rawDecision.kategori || rawDecision.category);
    const caseNumber = rawDecision.esasNo ? String(rawDecision.esasNo).trim() : undefined;
    const decisionNumber = rawDecision.kararNo ? String(rawDecision.kararNo).trim() : undefined;
    const applicationNumber = rawDecision.basvuruNo
      ? String(rawDecision.basvuruNo).trim()
      : undefined;
    const decisionDate = String(
      rawDecision.kararTarihi || rawDecision.decisionDate || "Belirtilmemiş"
    ).trim();
    const title = String(
      rawDecision.baslik ||
        rawDecision.title ||
        `T.C. Anayasa Mahkemesi Kararı (${caseNumber || applicationNumber || id})`
    ).trim();
    const applicant = rawDecision.basvurucu ? String(rawDecision.basvurucu).trim() : undefined;
    const outcome = String(rawDecision.sonuc || rawDecision.outcome || "Karara Bağlandı").trim();
    const summary = rawDecision.ozet ? String(rawDecision.ozet).trim() : undefined;
    const examinedNorm = rawDecision.incelenenNorm
      ? String(rawDecision.incelenenNorm).trim()
      : undefined;
    const facts = rawDecision.olaylar ? String(rawDecision.olaylar).trim() : undefined;
    const legalAssessment = rawDecision.gerekce ? String(rawDecision.gerekce).trim() : undefined;
    const verdict = rawDecision.hukum ? String(rawDecision.hukum).trim() : undefined;

    const fullTextHtml = String(rawDecision.metin || rawDecision.fullText || "");
    const fullTextMarkdown = fullTextHtml.includes("<")
      ? this.turndown.turndown(fullTextHtml)
      : fullTextHtml || summary || title;

    const dissentingOpinions: Array<{
      judgeName: string;
      type: "karsi_oy" | "farkli_gerekce";
      text: string;
    }> = [];

    if (Array.isArray(rawDecision.karsiOylar)) {
      for (const ko of rawDecision.karsiOylar as Record<string, unknown>[]) {
        dissentingOpinions.push({
          judgeName: String(ko.uye || ko.hakim || ko.judgeName || "Üye").trim(),
          type: (ko.tur as "karsi_oy" | "farkli_gerekce") || "karsi_oy",
          text: String(ko.metin || ko.text || "").trim(),
        });
      }
    }

    const detail: AnayasaMahkemesiDecisionDetail = {
      id,
      category,
      caseNumber,
      decisionNumber,
      applicationNumber,
      decisionDate,
      title,
      applicant,
      outcome,
      summary,
      examinedNorm,
      facts,
      legalAssessment,
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
   * Parses HTML decision list from AYM Bilgi Bankası table or cards.
   */
  private parseHtmlDecisions(
    html: string,
    queryUrl: string,
    action: AnayasaMahkemesiAction,
    options: AnayasaMahkemesiActorTaskOptions
  ): AnayasaMahkemesiActorResult {
    const $ = cheerio.load(html);
    const decisions: AnayasaMahkemesiDecisionItem[] = [];

    // Table rows selector
    $("table tbody tr, .karar-item, .search-result-item, .card").each((index, el) => {
      const $row = $(el);
      const link = $row.find("a").first();
      const href = link.attr("href") || "";
      const text = $row.text().replace(/\s+/g, " ").trim();
      if (!text || text.length < 5) return;

      const cells = $row.find("td");
      let caseNumber: string | undefined;
      let decisionNumber: string | undefined;
      let applicationNumber: string | undefined;
      let decisionDate = "";
      let outcome = "Karara Bağlandı";
      let title = link.text().trim();

      if (cells.length >= 3) {
        const col0 = $(cells[0]).text().trim();
        const col1 = $(cells[1]).text().trim();
        const col2 = $(cells[2]).text().trim();

        if (col0.includes("/")) {
          if (col0.length > 7 && !col0.includes("E.")) {
            applicationNumber = col0;
          } else {
            caseNumber = col0;
          }
        }
        if (col1.includes("/")) {
          decisionNumber = col1;
        }
        if (col2.match(/\d{2}[./-]\d{2}[./-]\d{4}/)) {
          decisionDate = col2;
        }
        if (cells.length >= 4) {
          outcome = $(cells[3]).text().trim() || outcome;
        }
      } else {
        // Match Esas/Karar or Başvuru patterns
        const appMatch = text.match(/(?:Başvuru\s*No|B\.No)\s*:\s*([0-9/]+)/i);
        if (appMatch) applicationNumber = appMatch[1];

        const esasMatch = text.match(/E\.?\s*([0-9/]+)/i);
        if (esasMatch) caseNumber = esasMatch[1];

        const kararMatch = text.match(/K\.?\s*([0-9/]+)/i);
        if (kararMatch) decisionNumber = kararMatch[1];

        const dateMatch = text.match(/(\d{2}[./-]\d{2}[./-]\d{4})/);
        if (dateMatch) decisionDate = dateMatch[1];

        if (text.includes("İhlal")) outcome = "İhlal";
        else if (text.includes("Kabul Edilemezlik")) outcome = "Kabul Edilemezlik";
        else if (text.includes("İptal")) outcome = "İptal";
        else if (text.includes("Ret")) outcome = "Ret";
      }

      if (!title) {
        title = applicationNumber
          ? `Bireysel Başvuru No: ${applicationNumber}`
          : caseNumber
            ? `E. ${caseNumber}, K. ${decisionNumber || "-"}`
            : `AYM Kararı ${index + 1}`;
      }

      const id = href
        ? href.split("/").filter(Boolean).pop() || `aym-${index + 1}`
        : `aym-${index + 1}`;
      const itemUrl = href.startsWith("http")
        ? href
        : href
          ? `${AYM_BASE}${href.startsWith("/") ? "" : "/"}${href}`
          : `${queryUrl}#${id}`;

      const category = this.normalizeCategory(
        applicationNumber ? "individual" : caseNumber ? "norm" : options.category
      );

      decisions.push({
        id,
        category,
        caseNumber,
        decisionNumber,
        applicationNumber,
        decisionDate: decisionDate || "Belirtilmemiş",
        title,
        outcome,
        url: itemUrl,
      });
    });

    const markdown = this.renderDecisionsMarkdown(decisions, action, queryUrl);

    return {
      action,
      queryUrl,
      totalResults: decisions.length,
      decisions,
      markdown,
    };
  }

  /**
   * Parses HTML single decision detail view.
   */
  private parseHtmlDecisionDetail(html: string, queryUrl: string): AnayasaMahkemesiActorResult {
    const $ = cheerio.load(html);

    const title =
      $("h1, .karar-baslik, .decision-title").first().text().trim() ||
      "T.C. Anayasa Mahkemesi Kararı";

    const contentEl = $(".karar-metni, .decision-content, #kararMetni, article, .content").first();
    const rawHtml = contentEl.length > 0 ? contentEl.html() || "" : $("body").html() || "";
    const fullTextMarkdown = this.turndown.turndown(rawHtml);

    // Extract metadata from headers or body
    const bodyText = $("body").text();
    const appMatch = bodyText.match(/(?:Başvuru\s*Numarası|Başvuru\s*No|B\.No)\s*:\s*([0-9/]+)/i);
    const esasMatch = bodyText.match(/Esas\s*Sayısı\s*:\s*([0-9/]+)/i);
    const kararMatch = bodyText.match(/Karar\s*Sayısı\s*:\s*([0-9/]+)/i);
    const dateMatch = bodyText.match(/Karar\s*Tarihi\s*:\s*(\d{2}[./-]\d{2}[./-]\d{4})/i);

    let outcome = "Karara Bağlandı";
    if (bodyText.includes("HAKKININ İHLAL EDİLDİĞİNE")) {
      outcome = "İhlal";
    } else if (bodyText.includes("BAŞVURUNUN KABUL EDİLEMEZ OLDUĞUNA")) {
      outcome = "Kabul Edilemezlik";
    } else if (bodyText.includes("İPTALİNE")) {
      outcome = "İptal";
    } else if (bodyText.includes("REDDİNE")) {
      outcome = "Ret";
    }

    const id = queryUrl.split("/").filter(Boolean).pop() || "aym-detay";
    const category = this.normalizeCategory(appMatch ? "individual" : "norm");

    const detail: AnayasaMahkemesiDecisionDetail = {
      id,
      category,
      caseNumber: esasMatch ? esasMatch[1] : undefined,
      decisionNumber: kararMatch ? kararMatch[1] : undefined,
      applicationNumber: appMatch ? appMatch[1] : undefined,
      decisionDate: dateMatch ? dateMatch[1] : "Belirtilmemiş",
      title,
      outcome,
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

  private normalizeCategory(cat?: unknown): "individual" | "norm" | "party" | "yuce_divan" {
    const s = String(cat || "").toLowerCase();
    if (s.includes("bireysel") || s.includes("individual")) return "individual";
    if (s.includes("parti") || s.includes("party")) return "party";
    if (s.includes("yuce") || s.includes("divan")) return "yuce_divan";
    return "norm";
  }

  private renderDecisionsMarkdown(
    decisions: AnayasaMahkemesiDecisionItem[],
    action: AnayasaMahkemesiAction,
    queryUrl: string
  ): string {
    const lines: string[] = [
      "# T.C. Anayasa Mahkemesi (AYM) Karar Listesi",
      "",
      `- **Eylem Modu:** \`${action}\``,
      `- **Sorgu Kaynağı:** [${queryUrl}](${queryUrl})`,
      `- **Toplam Karar:** ${decisions.length}`,
      "",
      "| # | Kategori | Esas/Başvuru No | Karar No | Karar Tarihi | Karar Sonucu | Bağlantı |",
      "|---|---|---|---|---|---|---|",
    ];

    decisions.forEach((item, idx) => {
      const ref = item.applicationNumber
        ? `B. ${item.applicationNumber}`
        : item.caseNumber
          ? `E. ${item.caseNumber}`
          : "-";
      const kararNo = item.decisionNumber ? `K. ${item.decisionNumber}` : "-";
      lines.push(
        `| ${idx + 1} | ${item.category} | ${ref} | ${kararNo} | ${item.decisionDate} | ${item.outcome} | [Kararı Aç](${item.url}) |`
      );
    });

    lines.push("");
    return lines.join("\n");
  }

  private renderDetailMarkdown(detail: AnayasaMahkemesiDecisionDetail): string {
    const lines: string[] = [
      `# ${detail.title}`,
      "",
      `- **Kategori:** ${detail.category}`,
      `- **Karar Tarihi:** ${detail.decisionDate}`,
      `- **Karar Sonucu:** ${detail.outcome}`,
      `- **Karar Kaynağı:** [${detail.url}](${detail.url})`,
    ];

    if (detail.applicationNumber) {
      lines.push(`- **Başvuru Numarası:** ${detail.applicationNumber}`);
    }
    if (detail.caseNumber) {
      lines.push(`- **Esas Numarası:** ${detail.caseNumber}`);
    }
    if (detail.decisionNumber) {
      lines.push(`- **Karar Numarası:** ${detail.decisionNumber}`);
    }
    if (detail.examinedNorm) {
      lines.push(`- **İncelenen Norm:** ${detail.examinedNorm}`);
    }

    lines.push("");
    lines.push("## Gerekçeli Karar ve Hüküm");
    lines.push("");
    lines.push(detail.fullTextMarkdown);

    if (detail.dissentingOpinions && detail.dissentingOpinions.length > 0) {
      lines.push("");
      lines.push("## Karşı Oylar ve Farklı Gerekçeler");
      lines.push("");
      for (const op of detail.dissentingOpinions) {
        lines.push(
          `### ${op.judgeName} (${op.type === "karsi_oy" ? "Karşı Oy" : "Farklı Gerekçe"})`
        );
        lines.push("");
        lines.push(op.text);
        lines.push("");
      }
    }

    return lines.join("\n");
  }
}
