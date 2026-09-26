/**
 * KtbEkitapActor - Turkish Ministry of Culture and Tourism E-Book portal actor.
 * Scrapes ekitap.ktb.gov.tr for public e-books across literary, historical, and cultural categories.
 * Handles anti-hotlinking Referer header injection and distills extracted PDF texts into sanitized LLM-ready markdown.
 */

import * as cheerio from "cheerio";
import { extractText } from "unpdf";
import { ContextGuard } from "../core/context-guard";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  KtbEkitapAction,
  KtbEkitapActorResult,
  KtbEkitapCategory,
  KtbEkitapItem,
  KtbEkitapTaskOptions,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_BASE_URL = "https://ekitap.ktb.gov.tr";
const DEFAULT_TIMEOUT_MS = 35_000;
const DEFAULT_LIMIT = 20;

const CATEGORY_MAP: Record<string, { key: string; label: string; href: string }> = {
  edebiyat: { key: "edebiyat", label: "Edebiyat", href: "/TR-78351/edebiyat.html" },
  "halk-bilimi": {
    key: "halk-bilimi",
    label: "Halk Bilimi",
    href: "/TR-78667/halk-bilimi--halk-kulturu.html",
  },
  "halk-kutuphaneleri": {
    key: "halk-kutuphaneleri",
    label: "Halk Kütüphaneleri",
    href: "/TR-265065/halk-kutuphaneleri.html",
  },
  kultur: { key: "kultur", label: "Kültür", href: "/TR-80049/kultur.html" },
  "kulturel-miras": {
    key: "kulturel-miras",
    label: "Kültürel Miras",
    href: "/TR-80392/kulturel-miras.html",
  },
  kutuphanecilik: {
    key: "kutuphanecilik",
    label: "Kütüphanecilik",
    href: "/TR-265064/kutuphanecilik-calismalari.html",
  },
  sanat: { key: "sanat", label: "Sanat", href: "/TR-81061/sanat.html" },
  tanitim: { key: "tanitim", label: "Tanıtım Eserleri", href: "/TR-271645/tanitim-eserleri.html" },
  tarih: { key: "tarih", label: "Tarih", href: "/TR-81461/tarih.html" },
  "son-eklenen": {
    key: "son-eklenen",
    label: "Son Eklenen Kitaplar",
    href: "/TR-82759/son-eklenen-kitaplar.html",
  },
};

export class KtbEkitapActor implements IActor<KtbEkitapActorResult> {
  readonly actorType = "ktb-ekitap" as const;
  readonly description =
    "Scrapes Turkish Ministry of Culture and Tourism e-book portal (ekitap.ktb.gov.tr) with anti-hotlink referral and LLM text sanitization.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<KtbEkitapActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: KtbEkitapTaskOptions = task.options?.ktbEkitapOptions || {};
    const action: KtbEkitapAction =
      options.action || (options.bookId || options.detailUrl ? "detail" : "list");
    const category: KtbEkitapCategory = options.category || "son-eklenen";
    const page = options.page || 1;
    const limit = options.limit || DEFAULT_LIMIT;
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    const baseUrl = this.resolveBaseUrl(task.targetUrl);

    try {
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(baseUrl, { allowLocalNetwork });
      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 400,
          errorMessage: `SSRF validation rejected base URL: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      if (action === "list") {
        return await this.handleListAction(
          task,
          baseUrl,
          category,
          page,
          limit,
          timeoutMs,
          allowLocalNetwork,
          startTime
        );
      }

      if (action === "detail" || action === "extract") {
        const bookId = options.bookId || this.extractIdFromUrl(options.detailUrl || task.targetUrl);
        const targetDetailUrl =
          options.detailUrl || (bookId ? `${baseUrl}/TR-${bookId}/kitap.html` : task.targetUrl);

        if (!targetDetailUrl?.startsWith("http")) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 400,
            errorMessage: "Missing required bookId or detailUrl for detail/extract action.",
            executionDurationMs: Date.now() - startTime,
          };
        }

        return await this.handleDetailOrExtractAction(
          task,
          baseUrl,
          targetDetailUrl,
          bookId,
          action === "extract" || options.downloadPdf === true,
          timeoutMs,
          allowLocalNetwork,
          startTime
        );
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 400,
        errorMessage: `Unsupported action: '${action}'. Valid actions are 'list', 'detail', and 'extract'.`,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: `KtbEkitapActor execution failure: ${message}`,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private resolveBaseUrl(targetUrl?: string): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      try {
        const u = new URL(targetUrl);
        return `${u.protocol}//${u.host}`;
      } catch {
        return DEFAULT_BASE_URL;
      }
    }
    return DEFAULT_BASE_URL;
  }

  private extractIdFromUrl(url?: string): number | undefined {
    if (!url) return undefined;
    const match = url.match(/TR-(\d+)/i);
    return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
  }

  private async handleListAction(
    task: ActorTask,
    baseUrl: string,
    category: KtbEkitapCategory,
    page: number,
    limit: number,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<KtbEkitapActorResult>> {
    const catEntry = CATEGORY_MAP[category] || CATEGORY_MAP["son-eklenen"];
    const listUrl = `${baseUrl}${catEntry.href}`;

    const resp = await safeRedirectFetch(listUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (Protokol-7 KTB Extractor)",
        Accept: "text/html,application/xhtml+xml",
      },
      timeoutMs,
      allowLocalNetwork,
      retryOptions: { maxRetries: 2, initialDelayMs: 500 },
    });

    if (!resp.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: resp.status,
        errorMessage: `Failed to fetch category page: HTTP ${resp.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    const items: KtbEkitapItem[] = [];

    // Scan links leading to book detail pages or direct PDF attachments
    $("a").each((_, el) => {
      if (items.length >= limit) return false;
      const href = $(el).attr("href");
      if (!href) return;

      const isBookDetail = href.startsWith("/TR-") && href.endsWith(".html");
      const isEklentiPdf = href.includes("/Eklenti/") && href.toLowerCase().includes(".pdf");

      if (isBookDetail || isEklentiPdf) {
        const idMatch = href.match(/TR-(\d+)/i) || href.match(/\/Eklenti\/(\d+)/i);
        if (idMatch?.[1]) {
          const id = Number.parseInt(idMatch[1], 10);
          if (!items.some((it) => it.id === id)) {
            const rawTitle = $(el).text().trim() || $(el).attr("title")?.trim() || `Book ${id}`;
            const cleanTitle = rawTitle.replace(/\s+/g, " ");

            const detailUrl = isBookDetail ? `${baseUrl}${href}` : `${baseUrl}/TR-${id}/kitap.html`;

            const downloadUrl = isEklentiPdf
              ? href.startsWith("http")
                ? href
                : `${baseUrl}${href}`
              : undefined;

            items.push({
              id,
              title: cleanTitle,
              category: catEntry.key,
              detailUrl,
              downloadUrl,
            });
          }
        }
      }
    });

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        totalItems: items.length,
        action: "list",
        category,
        page,
        items,
        queryUrl: listUrl,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleDetailOrExtractAction(
    task: ActorTask,
    baseUrl: string,
    detailUrl: string,
    explicitBookId: number | undefined,
    shouldExtractText: boolean,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<KtbEkitapActorResult>> {
    const resp = await safeRedirectFetch(detailUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (Protokol-7 KTB Extractor)",
        Accept: "text/html,application/xhtml+xml",
      },
      timeoutMs,
      allowLocalNetwork,
      retryOptions: { maxRetries: 2, initialDelayMs: 500 },
    });

    if (!resp.ok) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: resp.status,
        errorMessage: `Failed to fetch book detail page: HTTP ${resp.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    let downloadHref: string | undefined;
    $("a").each((_, a) => {
      const h = $(a).attr("href");
      if (h?.includes("/Eklenti/") && (h.toLowerCase().includes(".pdf") || h.includes("pdf?"))) {
        downloadHref = h;
      }
    });

    const id = explicitBookId || this.extractIdFromUrl(detailUrl) || Date.now();
    const title =
      $("h1").text().trim() ||
      $("h2").text().trim() ||
      $(".book-title").text().trim() ||
      $("title").text().trim() ||
      `Book ${id}`;

    let author: string | undefined;
    let publisher: string | undefined;
    let year: string | undefined;
    let pageCount: number | undefined;

    // Parse metadata lines from info boxes or paragraphs
    $("p, li, div").each((_, el) => {
      const txt = $(el).text().trim();
      const lower = txt.toLowerCase();
      if (lower.startsWith("yazar:") || lower.startsWith("yazarı:")) {
        author = txt.split(":")[1]?.trim();
      } else if (lower.startsWith("yayınevi:") || lower.startsWith("yayınlayan:")) {
        publisher = txt.split(":")[1]?.trim();
      } else if (lower.startsWith("yıl:") || lower.startsWith("basım yılı:")) {
        year = txt.split(":")[1]?.trim();
      } else if (lower.startsWith("sayfa:") || lower.startsWith("sayfa sayısı:")) {
        const count = Number.parseInt(txt.split(":")[1]?.trim() || "", 10);
        if (!Number.isNaN(count)) pageCount = count;
      }
    });

    const summary = $(".summary, .description, #ozet, .book-summary").text().trim() || undefined;

    const downloadUrl = downloadHref
      ? downloadHref.startsWith("http")
        ? downloadHref
        : `${baseUrl}${downloadHref}`
      : undefined;

    let extractedMarkdown: string | undefined;

    if (shouldExtractText && downloadUrl) {
      try {
        // Enforce anti-hotlinking Referer header matching detailUrl
        const pdfResp = await safeRedirectFetch(downloadUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (Protokol-7 KTB Extractor)",
            Referer: detailUrl,
            Accept: "application/pdf,*/*",
          },
          timeoutMs,
          allowLocalNetwork,
          retryOptions: { maxRetries: 2, initialDelayMs: 500 },
        });

        if (pdfResp.ok) {
          const arrayBuf = await pdfResp.arrayBuffer();
          const buf = Buffer.from(arrayBuf);

          if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
            const pdfResult = await extractText(new Uint8Array(arrayBuf));
            const pages = Array.isArray(pdfResult.text)
              ? pdfResult.text
              : [String(pdfResult.text || "")];

            const cleanText = this.sanitizeTextForLlm(pages);
            extractedMarkdown = `# ${title}\n\n${cleanText}`;

            if (!pageCount && pdfResult.totalPages) {
              pageCount = pdfResult.totalPages;
            }
          }
        }
      } catch {
        // Graceful error recovery: return metadata even if PDF stream fails
      }
    }

    const item: KtbEkitapItem = {
      id,
      title,
      category: "culture",
      detailUrl,
      downloadUrl,
      author,
      publisher,
      year,
      pageCount,
      summary,
      extractedMarkdown,
    };

    return {
      taskId: task.taskId,
      actorType: this.actorType,
      status: "completed",
      statusCode: 200,
      data: {
        totalItems: 1,
        action: shouldExtractText ? "extract" : "detail",
        items: [item],
        queryUrl: detailUrl,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Sanitizes extracted PDF pages for LLM consumption:
   * 1. Strips repeating boilerplate headers and footers across page boundaries.
   * 2. Heuristic word de-hyphenation across line endings.
   * 3. Paragraph normalization.
   */
  public sanitizeTextForLlm(pages: string[]): string {
    if (!pages || pages.length === 0) return "";

    const normalizedPages = pages.map((p) =>
      p
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
    );

    const boilerplateLines = new Set<string>();
    if (pages.length >= 3) {
      const pageLineCounts = new Map<string, number>();
      for (const lines of normalizedPages) {
        if (lines.length > 4) {
          const candidates = new Set([...lines.slice(0, 2), ...lines.slice(-2)]);
          for (const c of candidates) {
            if (c.length > 4 && !/^\d+$/.test(c)) {
              pageLineCounts.set(c, (pageLineCounts.get(c) || 0) + 1);
            }
          }
        }
      }

      const threshold = Math.max(2, Math.floor(pages.length * 0.5));
      for (const [line, count] of pageLineCounts.entries()) {
        if (count >= threshold) {
          boilerplateLines.add(line);
        }
      }
    }

    const cleanedPages = normalizedPages.map((lines) =>
      lines
        .filter((line) => {
          if (boilerplateLines.has(line)) return false;
          if (/^[-—–\s]*\d+[-—–\s]*$/.test(line)) return false;
          if (/^Sayfa\s+\d+$/i.test(line)) return false;
          if (/^[<\s>•.\-_=]{4,}$/.test(line)) return false;
          return true;
        })
        .join("\n")
    );

    let fullText = "";
    for (const pageText of cleanedPages) {
      const trimmed = pageText.trim();
      if (!trimmed) continue;

      if (!fullText) {
        fullText = trimmed;
        continue;
      }

      const hyphenMatch = fullText.match(/([a-zA-ZçğıöşüÇĞİÖŞÜ])-$/);
      const firstWordMatch = trimmed.match(/^([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/);

      if (hyphenMatch && firstWordMatch) {
        fullText = fullText.slice(0, -1) + trimmed;
      } else {
        const lastChar = fullText.slice(-1);
        const isSentenceEnd = [".", "!", "?", ":", ";"].includes(lastChar);
        if (isSentenceEnd) {
          fullText += `\n\n${trimmed}`;
        } else {
          fullText += ` ${trimmed}`;
        }
      }
    }

    const sanitized = fullText
      .replace(/([a-zA-ZçğıöşüÇĞİÖŞÜ])-[\r\n]+\s*([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/giu, "$1$2")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return ContextGuard.stripInvisibleUnicode(sanitized);
  }
}
