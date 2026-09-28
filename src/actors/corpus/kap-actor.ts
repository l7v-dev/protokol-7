/**
 * KapActor - Kamuoyu Aydınlatma Platformu (KAP) company disclosures,
 * financial reports, and regulatory filings extraction actor.
 * Conforms to docs/actor-contract.md and docs/actors/kap.md.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  KapActorResult,
  KapActorTaskOptions,
  KapDisclosureItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const KAP_BASE = "https://www.kap.org.tr";

export class KapActor implements IActor<KapActorResult> {
  readonly actorType = "kap" as const;
  readonly description =
    "Kamuoyu Aydınlatma Platformu (KAP) company disclosures, financial reports, and regulatory filings extraction actor.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<KapActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: KapActorTaskOptions =
      task.options?.kapOptions || (task.options as KapActorTaskOptions) || {};
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
  buildEndpointUrl(targetUrl?: string, options?: KapActorTaskOptions): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    if (options?.companyTicker) {
      const ticker = options.companyTicker.trim().toUpperCase();
      return `${KAP_BASE}/tr/api/member-disclosures/${ticker}`;
    }

    const url = new URL(`${KAP_BASE}/tr/api/disclosures`);

    if (options?.query) {
      url.searchParams.set("q", options.query.trim());
    }
    if (options?.disclosureType && options.disclosureType !== "all") {
      url.searchParams.set("type", options.disclosureType.trim());
    }
    if (options?.fromDate) {
      url.searchParams.set("fromDate", options.fromDate.trim());
    }
    if (options?.toDate) {
      url.searchParams.set("toDate", options.toDate.trim());
    }
    if (options?.limit) {
      url.searchParams.set("limit", String(options.limit));
    }

    return url.href;
  }

  /**
   * Normalizes raw response into structured disclosures.
   */
  private parseResponse(
    rawText: string,
    queryUrl: string,
    options: KapActorTaskOptions
  ): KapActorResult {
    // 1. Attempt JSON parse
    try {
      const parsed = JSON.parse(rawText);
      const items = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.data)
          ? parsed.data
          : Array.isArray(parsed.disclosures)
            ? parsed.disclosures
            : Array.isArray(parsed.items)
              ? parsed.items
              : Array.isArray(parsed.result)
                ? parsed.result
                : [];

      if (items.length > 0) {
        return this.parseJsonDisclosures(items, queryUrl, options);
      }
    } catch {
      // Fallback to HTML
    }

    return this.parseHtmlDisclosures(rawText, queryUrl, options);
  }

  /**
   * Parses JSON disclosure array from KAP API.
   */
  private parseJsonDisclosures(
    rawItems: Record<string, unknown>[],
    queryUrl: string,
    options: KapActorTaskOptions
  ): KapActorResult {
    let disclosures: KapDisclosureItem[] = rawItems.map((item, index) => {
      const id = String(
        item.disclosureIndex || item.id || item.disclosureId || item.index || `kap-${index + 1}`
      ).trim();

      const companyTicker = String(
        item.stockCodes ||
          item.companyTicker ||
          item.kod ||
          item.ticker ||
          item.memberCode ||
          options.companyTicker ||
          "BIST"
      )
        .trim()
        .toUpperCase();

      const companyName = String(
        item.companyTitle || item.companyName || item.sirketAdi || item.title || companyTicker
      ).trim();

      const publishDate = String(
        item.publishDate || item.yayinTarihi || item.date || item.disclosureDate || ""
      ).trim();

      const disclosureType = String(
        item.disclosureType ||
          item.disclosureClass ||
          item.tip ||
          item.ruleTypeTerm ||
          "Özel Durum Açıklaması"
      ).trim();

      const subject =
        item.subject || item.konu || item.summaryTitle
          ? String(item.subject || item.konu || item.summaryTitle).trim()
          : undefined;

      const summary =
        item.summary || item.ozet ? String(item.summary || item.ozet).trim() : undefined;

      const content =
        item.content || item.fullText || item.aciklama || item.text
          ? String(item.content || item.fullText || item.aciklama || item.text).trim()
          : undefined;

      const itemUrl = item.url ? String(item.url) : `${KAP_BASE}/tr/Bildirim/${id}`;

      const attachmentUrl =
        item.attachmentUrl || item.attachment
          ? String(item.attachmentUrl || item.attachment)
          : undefined;

      return {
        id,
        companyTicker,
        companyName,
        publishDate,
        disclosureType,
        subject,
        summary,
        content,
        url: itemUrl,
        attachmentUrl,
        metadata: {
          rawItem: item,
        },
      };
    });

    disclosures = this.applyFilters(disclosures, options);
    const markdown = this.renderMarkdownSummary(disclosures, queryUrl, options.companyTicker);

    return {
      totalCount: disclosures.length,
      companyTicker: options.companyTicker?.toUpperCase(),
      disclosures,
      queryUrl,
      markdown,
    };
  }

  /**
   * Parses HTML disclosures table or notification cards.
   */
  private parseHtmlDisclosures(
    html: string,
    queryUrl: string,
    options: KapActorTaskOptions
  ): KapActorResult {
    const $ = cheerio.load(html);
    const disclosures: KapDisclosureItem[] = [];

    // Parse notification table rows or disclosure cards
    $("table tbody tr, div.disclosure-row, div.notification-item, div.disclosure-card").each(
      (index, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (!text || text.length < 10) return;

        const cells = $el.find("td");
        let publishDate = "";
        let companyTicker = options.companyTicker?.toUpperCase() || "";
        let companyName = "";
        let disclosureType = "Özel Durum Açıklaması";
        let subject = "";

        if (cells.length >= 4) {
          publishDate = $(cells[0]).text().trim();
          companyTicker = $(cells[1]).text().trim().toUpperCase() || companyTicker;
          companyName = $(cells[2]).text().trim() || companyTicker;
          disclosureType = $(cells[3]).text().trim() || disclosureType;
          if (cells.length >= 5) {
            subject = $(cells[4]).text().trim();
          }
        } else {
          // Free card format
          const dateMatch = text.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{4}\s*(?:\d{1,2}:\d{2})?)/);
          if (dateMatch) publishDate = dateMatch[1].trim();

          const tickerMatch = text.match(/\b([A-Z]{3,5})\b/);
          if (tickerMatch && !companyTicker) companyTicker = tickerMatch[1];

          subject = text.substring(0, 200);
        }

        const href = $el.find("a").first().attr("href")?.trim();
        const idMatch = href?.match(/\/Bildirim\/(\d+)/i);
        const id = idMatch ? idMatch[1] : `kap-${index + 1}`;
        const itemUrl = href ? new URL(href, queryUrl).href : `${KAP_BASE}/tr/Bildirim/${id}`;

        const content = $el.find(".disclosure-text, .content, p").text().trim() || undefined;

        disclosures.push({
          id,
          companyTicker: companyTicker || "BIST",
          companyName: companyName || companyTicker || "Şirket",
          publishDate: publishDate || "-",
          disclosureType,
          subject: subject || undefined,
          summary: subject || undefined,
          content,
          url: itemUrl,
        });
      }
    );

    // If single disclosure detail HTML view
    if (disclosures.length === 0) {
      const pageText = $("body").text().trim();
      if (pageText.length > 50) {
        const title = $("h1, h2, title").first().text().trim() || "KAP Bildirimi";
        const ticker = options.companyTicker?.toUpperCase() || "BIST";
        disclosures.push({
          id: "kap-doc",
          companyTicker: ticker,
          companyName: ticker,
          publishDate: "-",
          disclosureType: "Özel Durum Açıklaması",
          subject: title,
          summary: title,
          content: pageText,
          url: queryUrl,
        });
      }
    }

    const filtered = this.applyFilters(disclosures, options);
    const markdown = this.renderMarkdownSummary(filtered, queryUrl, options.companyTicker);

    return {
      totalCount: filtered.length,
      companyTicker: options.companyTicker?.toUpperCase(),
      disclosures: filtered,
      queryUrl,
      markdown,
    };
  }

  /**
   * Filters disclosures according to options.
   */
  private applyFilters(
    items: KapDisclosureItem[],
    options: KapActorTaskOptions
  ): KapDisclosureItem[] {
    let result = items;

    if (options.companyTicker) {
      const targetTicker = options.companyTicker.trim().toUpperCase();
      result = result.filter(
        (d) =>
          d.companyTicker.toUpperCase().includes(targetTicker) ||
          targetTicker.includes(d.companyTicker.toUpperCase())
      );
    }

    if (options.disclosureType && options.disclosureType !== "all") {
      const targetType = normalizeTurkishText(options.disclosureType);
      result = result.filter((d) => normalizeTurkishText(d.disclosureType).includes(targetType));
    }

    if (options.query) {
      const targetQuery = normalizeTurkishText(options.query);
      result = result.filter((d) => {
        const normSubject = d.subject ? normalizeTurkishText(d.subject) : "";
        const normSummary = d.summary ? normalizeTurkishText(d.summary) : "";
        const normContent = d.content ? normalizeTurkishText(d.content) : "";
        const normCompany = normalizeTurkishText(d.companyName);
        return (
          normSubject.includes(targetQuery) ||
          normSummary.includes(targetQuery) ||
          normContent.includes(targetQuery) ||
          normCompany.includes(targetQuery)
        );
      });
    }

    if (options.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * Formats disclosures into clean LLM-ready GFM Markdown.
   */
  private renderMarkdownSummary(
    disclosures: KapDisclosureItem[],
    queryUrl: string,
    companyTicker?: string
  ): string {
    const lines: string[] = [];
    const tickerBadge = companyTicker ? ` — [${companyTicker.toUpperCase()}]` : "";
    lines.push(`# Kamuoyu Aydınlatma Platformu (KAP) Bildirimleri${tickerBadge}`);
    lines.push(`**Kaynak URL:** [${queryUrl}](${queryUrl})`);
    lines.push(`**Toplam Bildirim:** ${disclosures.length}\n`);

    for (const d of disclosures) {
      lines.push(`## [${d.companyTicker}] ${d.disclosureType} — ${d.id}`);
      lines.push(
        `* **Şirket:** ${d.companyName} | **Tarih:** ${d.publishDate} | **Bağlantı:** [KAP Detayı](${d.url})`
      );

      if (d.subject) {
        lines.push(`* **Konu:** ${d.subject}`);
      }

      if (d.summary) {
        lines.push(`\n**Özet:** ${d.summary}\n`);
      }

      if (d.content) {
        const preview = d.content.length > 600 ? `${d.content.substring(0, 600)}...` : d.content;
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
