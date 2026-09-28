/**
 * ResmiGazeteActor - T.C. Resmî Gazete daily issues, laws, decrees, regulations, and announcements extraction actor.
 * Conforms to docs/actor-contract.md and docs/actors/resmi-gazete.md.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  ResmiGazeteActorResult,
  ResmiGazeteActorTaskOptions,
  ResmiGazeteItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const RESMI_GAZETE_BASE = "https://www.resmigazete.gov.tr";

export class ResmiGazeteActor implements IActor<ResmiGazeteActorResult> {
  readonly actorType = "resmi-gazete" as const;
  readonly description =
    "T.C. Resmî Gazete daily issues, laws, decrees, regulations, and announcements extraction actor.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<ResmiGazeteActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: ResmiGazeteActorTaskOptions =
      task.options?.resmiGazeteOptions || (task.options as ResmiGazeteActorTaskOptions) || {};
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
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

      // 5. Parse HTML content with Cheerio
      const html = await response.text();
      const resultData = this.parseResmiGazeteHtml(html, endpoint, options);

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
   * Constructs the upstream Resmî Gazete URL from input options.
   */
  buildEndpointUrl(targetUrl?: string, options?: ResmiGazeteActorTaskOptions): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    if (options?.date) {
      const cleanDate = options.date.replace(/[-/.]/g, "").trim();
      if (/^\d{8}$/.test(cleanDate)) {
        const year = cleanDate.substring(0, 4);
        const month = cleanDate.substring(4, 6);
        return `${RESMI_GAZETE_BASE}/eskiler/${year}/${month}/${cleanDate}.htm`;
      }
    }

    return RESMI_GAZETE_BASE;
  }

  /**
   * Parses Resmî Gazete HTML into structured domain models.
   */
  private parseResmiGazeteHtml(
    html: string,
    queryUrl: string,
    options: ResmiGazeteActorTaskOptions
  ): ResmiGazeteActorResult {
    const $ = cheerio.load(html);

    // Extract Issue date & number from headers or title
    const titleText = $("title").text().trim();
    let issueNumber: number | undefined;
    let isRepeated = false;
    let dateStr = "";

    // Parse date from URL if available (e.g. /2024/03/20240315.htm)
    const urlDateMatch = queryUrl.match(/(\d{4})\/(\d{2})\/(\d{4})(\d{2})(\d{2})/);
    if (urlDateMatch) {
      dateStr = `${urlDateMatch[3]}-${urlDateMatch[4]}-${urlDateMatch[5]}`;
    }

    // Try finding date and issue number from body text/headers
    const headerText = $("body").text();
    const issueMatch =
      headerText.match(/Sayı\s*:\s*(\d+)/i) || titleText.match(/Sayı\s*:\s*(\d+)/i);
    if (issueMatch) {
      issueNumber = Number.parseInt(issueMatch[1], 10);
    }

    if (options.issueNumber && !issueNumber) {
      issueNumber = options.issueNumber;
    }

    if (
      headerText.toLowerCase().includes("mükerrer") ||
      titleText.toLowerCase().includes("mükerrer") ||
      /[_-]m\d*\.htm/i.test(queryUrl)
    ) {
      isRepeated = true;
    }

    // If dateStr is still empty, look for Turkish date pattern in header
    if (!dateStr) {
      const dateMatch = headerText.match(/(\d{1,2})\s+([A-Za-zÇĞİÖŞÜçğıöşü]+)\s+(\d{4})/);
      if (dateMatch) {
        dateStr = `${dateMatch[3]}-${this.monthNameToNumber(dateMatch[2])}-${dateMatch[1].padStart(2, "0")}`;
      } else {
        dateStr = new Date().toISOString().split("T")[0];
      }
    }

    const items: ResmiGazeteItem[] = [];
    let currentSection = "GENEL";
    let currentSubSection = "";

    // Standard Resmî Gazete daily bulletin uses HTML tables or div sections
    $("body")
      .find("*")
      .each((_, element) => {
        const $el = $(element);
        const text = $el.text().trim();
        const upper = text.toUpperCase();

        // Check if this is a heading/category line (has no <a> child, length < 100)
        if ($el.children("a").length === 0 && text.length > 0 && text.length < 100) {
          if (
            upper.includes("YÜRÜTME VE İDARE") ||
            upper.includes("YARGI BÖLÜMÜ") ||
            upper.includes("İLÂN BÖLÜMÜ")
          ) {
            currentSection = text.replace(/\s+/g, " ");
            currentSubSection = "";
          } else if (
            upper.includes("KANUN") ||
            upper.includes("CUMHURBAŞKANI") ||
            upper.includes("YÖNETMELİK") ||
            upper.includes("TEBLİĞ") ||
            upper.includes("KURUL KARAR") ||
            upper.includes("ANAYASA MAHKEMESİ") ||
            upper.includes("YARGITAY") ||
            upper.includes("DANIŞTAY") ||
            upper.includes("İLÂN")
          ) {
            currentSubSection = text.replace(/\s+/g, " ");
          }
        }

        // If this element is directly an <a> tag
        if (element.tagName && element.tagName.toLowerCase() === "a") {
          const linkText = text;
          const href = $el.attr("href")?.trim();

          if (
            !href ||
            href.startsWith("#") ||
            href.startsWith("javascript:") ||
            linkText.length < 5
          ) {
            return;
          }

          const absoluteUrl = this.resolveAbsoluteUrl(href, queryUrl);
          const isPdf = absoluteUrl.toLowerCase().endsWith(".pdf");

          // Extract act number or decision number if present
          const actMatch =
            linkText.match(/(\d+)\s*Sayılı/i) ||
            linkText.match(/Karar\s*Sayısı\s*[:\s]*(\d+(?:\/\d+)?)/i) ||
            linkText.match(/Karar\s*No\.?\s*[:\s]*(\d+(?:\/\d+)?)/i);
          const actNumber = actMatch ? actMatch[1] : undefined;

          // Deduplicate URLs
          if (items.some((item) => item.url === absoluteUrl || item.title === linkText)) {
            return;
          }

          const category = currentSubSection
            ? `${currentSection} - ${currentSubSection}`
            : currentSection;

          const item: ResmiGazeteItem = {
            id: `rg-${dateStr.replace(/-/g, "")}-${items.length + 1}`,
            title: linkText,
            category,
            actNumber,
            url: absoluteUrl,
            pdfUrl: isPdf ? absoluteUrl : undefined,
            metadata: {
              issueDate: dateStr,
              issueNumber,
              isRepeated,
            },
          };

          items.push(item);
        }
      });

    // If it is a direct document page (e.g. single law or regulation text without internal links)
    if (items.length === 0) {
      const pageText = $("body").text().trim();
      if (pageText.length > 50) {
        const mainHeading =
          $("h1, h2, b").first().text().trim() || titleText || "Resmî Gazete Belgesi";
        const docCategory = currentSubSection
          ? `${currentSection} - ${currentSubSection}`
          : currentSection;
        items.push({
          id: `rg-${dateStr.replace(/-/g, "")}-doc`,
          title: mainHeading,
          category: docCategory,
          url: queryUrl,
          content: this.cleanDocumentText($, queryUrl),
          metadata: {
            issueDate: dateStr,
            issueNumber,
            isRepeated,
          },
        });
      }
    }

    // Category and query filtering
    let filteredItems = items;
    if (options.category && options.category !== "all") {
      const targetCat = normalizeTurkishText(options.category);
      filteredItems = filteredItems.filter((i) => {
        const itemCat = normalizeTurkishText(i.category);
        if (targetCat === "cumhurbaskanligi") {
          return itemCat.includes("cumhurbaskan");
        }
        if (targetCat === "yonetmelik") {
          return itemCat.includes("yonetmelik");
        }
        if (targetCat === "teblig") {
          return itemCat.includes("teblig");
        }
        if (targetCat === "kanun") {
          return itemCat.includes("kanun");
        }
        if (targetCat === "kurul-karari" || targetCat === "kurul") {
          return itemCat.includes("kurul");
        }
        if (targetCat === "ilanlar" || targetCat === "ilan") {
          return itemCat.includes("ilan");
        }
        return itemCat.includes(targetCat);
      });
    }

    if (options.query) {
      const targetQuery = normalizeTurkishText(options.query);
      filteredItems = filteredItems.filter((i) => {
        const normTitle = normalizeTurkishText(i.title);
        const normCat = normalizeTurkishText(i.category);
        const normAct = i.actNumber ? normalizeTurkishText(i.actNumber) : "";
        const normContent = i.content ? normalizeTurkishText(i.content) : "";
        return (
          normTitle.includes(targetQuery) ||
          normCat.includes(targetQuery) ||
          normAct.includes(targetQuery) ||
          normContent.includes(targetQuery)
        );
      });
    }

    if (options.limit && options.limit > 0) {
      filteredItems = filteredItems.slice(0, options.limit);
    }

    // Generate LLM markdown summary
    const markdown = this.renderMarkdownSummary(
      dateStr,
      issueNumber,
      isRepeated,
      filteredItems,
      queryUrl
    );

    return {
      date: dateStr,
      issueNumber,
      isRepeated,
      totalItems: filteredItems.length,
      items: filteredItems,
      queryUrl,
      markdown,
    };
  }

  /**
   * Resolves relative URLs to absolute Resmî Gazete URLs.
   */
  private resolveAbsoluteUrl(href: string, base: string): string {
    try {
      return new URL(href, base).href;
    } catch {
      if (href.startsWith("/")) {
        return `${RESMI_GAZETE_BASE}${href}`;
      }
      return href;
    }
  }

  /**
   * Cleans document body into markdown text.
   */
  private cleanDocumentText($: cheerio.CheerioAPI, _url: string): string {
    $("script, style, meta, noscript").remove();
    const paragraphs: string[] = [];

    $("p, table, div.madde, div.fıkra").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 0) {
        paragraphs.push(text);
      }
    });

    return paragraphs.join("\n\n");
  }

  /**
   * Converts Turkish month names to zero-padded numeric string.
   */
  private monthNameToNumber(name: string): string {
    const months: Record<string, string> = {
      ocak: "01",
      şubat: "02",
      mart: "03",
      nisan: "04",
      mayıs: "05",
      haziran: "06",
      temmuz: "07",
      ağustos: "08",
      eylül: "09",
      ekim: "10",
      kasım: "11",
      aralık: "12",
    };
    return months[name.toLowerCase()] || "01";
  }

  /**
   * Formats structured Resmî Gazete entries into LLM-ready GFM markdown.
   */
  private renderMarkdownSummary(
    date: string,
    issueNumber: number | undefined,
    isRepeated: boolean,
    items: ResmiGazeteItem[],
    queryUrl: string
  ): string {
    const lines: string[] = [];
    const issueDisplay = issueNumber ? `Sayı: ${issueNumber}` : "Bülten";
    const repeatedDisplay = isRepeated ? " (MÜKERRER)" : "";

    lines.push(`# T.C. Resmî Gazete — ${date}${repeatedDisplay}`);
    lines.push(`**Yayın Bilgisi:** ${issueDisplay} | **Tarih:** ${date}`);
    lines.push(`**Kaynak URL:** [${queryUrl}](${queryUrl})`);
    lines.push(`**Toplam Kayıt:** ${items.length}\n`);

    lines.push("## İndeks ve Mevzuat Listesi\n");

    let currentCat = "";
    for (const item of items) {
      if (item.category !== currentCat) {
        currentCat = item.category;
        lines.push(`### ${currentCat}\n`);
      }

      const actTag = item.actNumber ? ` **[No: ${item.actNumber}]**` : "";
      const pdfTag = item.pdfUrl ? ` ([PDF](${item.pdfUrl}))` : "";
      lines.push(`- [${item.title}](${item.url})${actTag}${pdfTag}`);

      if (item.content) {
        lines.push(`\n> ${item.content.substring(0, 300)}...\n`);
      }
    }

    return lines.join("\n");
  }
}

/**
 * Normalizes Turkish characters and removes diacritics for deterministic matching.
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
