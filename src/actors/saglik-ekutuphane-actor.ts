/**
 * SaglikEkutuphaneActor - Turkish Ministry of Health E-Library scraping actor.
 * Scrapes ekutuphane.saglik.gov.tr for health publications, books, journals, and articles,
 * extracting metadata, download links, and distilling PDF contents into text.
 */

import * as cheerio from "cheerio";
import { extractText } from "unpdf";
import { ContextGuard } from "../core/context-guard";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  SaglikEkutuphaneAction,
  SaglikEkutuphaneActorResult,
  SaglikEkutuphaneCategory,
  SaglikEkutuphaneItem,
  SaglikEkutuphaneTaskOptions,
} from "../core/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_BASE_URL = "https://ekutuphane.saglik.gov.tr";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LIMIT = 20;

const CATEGORY_ENDPOINTS: Record<string, { key: string; label: string; endpoint: string }> = {
  books: { key: "books", label: "Kitap", endpoint: "/YayinTur/Kitap" },
  journals: { key: "journals", label: "Dergi", endpoint: "/YayinTur/Dergi" },
  articles: { key: "articles", label: "Makale", endpoint: "/YayinTur/Makale" },
};

export class SaglikEkutuphaneActor implements IActor<SaglikEkutuphaneActorResult> {
  readonly actorType = "saglik-ekutuphane" as const;
  readonly description =
    "Scrapes Turkish Ministry of Health e-library (ekutuphane.saglik.gov.tr) for books, journals, and articles.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<SaglikEkutuphaneActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: SaglikEkutuphaneTaskOptions = task.options?.saglikEkutuphaneOptions || {};
    const action: SaglikEkutuphaneAction =
      options.action || (options.publicationId ? "detail" : "list");
    const category: SaglikEkutuphaneCategory = options.category || "all";
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
        const publicationId = options.publicationId || this.extractIdFromUrl(task.targetUrl);
        if (!publicationId) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 400,
            errorMessage: "Missing required publicationId for detail/extract action.",
            executionDurationMs: Date.now() - startTime,
          };
        }

        return await this.handleDetailOrExtractAction(
          task,
          baseUrl,
          publicationId,
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
        errorMessage: `SaglikEkutuphaneActor execution failure: ${message}`,
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
    const match = url.match(/\/Yayin\/(\d+)/i);
    return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
  }

  private async handleListAction(
    task: ActorTask,
    baseUrl: string,
    category: SaglikEkutuphaneCategory,
    page: number,
    limit: number,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<SaglikEkutuphaneActorResult>> {
    const categoriesToScan =
      category === "all"
        ? Object.values(CATEGORY_ENDPOINTS)
        : [CATEGORY_ENDPOINTS[category] || CATEGORY_ENDPOINTS.books];

    const items: SaglikEkutuphaneItem[] = [];
    let lastQueryUrl = "";

    for (const cat of categoriesToScan) {
      if (items.length >= limit) break;

      const listUrl = `${baseUrl}${cat.endpoint}?sayfa=${page}`;
      lastQueryUrl = listUrl;

      const resp = await safeRedirectFetch(listUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Protokol7Bot/1.0; +https://protokol-7.internal)",
          Accept: "text/html,application/xhtml+xml",
        },
        timeoutMs,
        allowLocalNetwork,
        retryOptions: { maxRetries: 2, initialDelayMs: 500 },
      });

      if (!resp.ok) {
        continue;
      }

      const html = await resp.text();
      const $ = cheerio.load(html);

      $('a[href*="/Yayin/"]').each((_, el) => {
        if (items.length >= limit) return false;
        const href = $(el).attr("href");
        if (!href) return;

        const match = href.match(/\/Yayin\/(\d+)/);
        if (match?.[1]) {
          const id = Number.parseInt(match[1], 10);
          if (!items.some((item) => item.id === id)) {
            const rawTitle =
              $(el).text().trim() || $(el).attr("title")?.trim() || `Publication ${id}`;
            const cleanTitle = rawTitle.replace(/\s+/g, " ");

            items.push({
              id,
              title: cleanTitle,
              category: cat.key,
              detailUrl: `${baseUrl}/Yayin/${id}`,
              downloadUrl: `${baseUrl}/Eklenti/${id}`,
            });
          }
        }
      });
    }

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
        queryUrl: lastQueryUrl,
      },
      executionDurationMs: Date.now() - startTime,
    };
  }

  private async handleDetailOrExtractAction(
    task: ActorTask,
    baseUrl: string,
    publicationId: number,
    shouldExtractText: boolean,
    timeoutMs: number,
    allowLocalNetwork: boolean,
    startTime: number
  ): Promise<ActorResult<SaglikEkutuphaneActorResult>> {
    const detailUrl = `${baseUrl}/Yayin/${publicationId}`;

    const resp = await safeRedirectFetch(detailUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Protokol7Bot/1.0; +https://protokol-7.internal)",
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
        errorMessage: `Failed to fetch publication detail page: HTTP ${resp.status}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    const html = await resp.text();
    const $ = cheerio.load(html);

    const title =
      $("h2 strong").text().trim() ||
      $("h2").text().trim() ||
      $(".panel-title").text().trim() ||
      `Publication ${publicationId}`;

    const detailBox = $("#yayinDetay").length > 0 ? $("#yayinDetay") : $(".panel-body");

    let publisher = "";
    let year = "";
    let language = "";
    let pageCount: number | undefined;
    let fileSizeBytes: number | undefined;
    let originalFilename = "";

    const textLines = detailBox
      .text()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of textLines) {
      const lower = line.toLowerCase();
      if (lower.includes("yayınlayan:") || lower.includes("yayinlayan:")) {
        publisher = line.split(":")[1]?.trim() || "";
      } else if (lower.includes("basım yılı:") || lower.includes("basim yili:")) {
        year = line.split(":")[1]?.trim() || "";
      } else if (lower.includes("dili:") || lower.includes("dil:")) {
        language = line.split(":")[1]?.trim() || "";
      } else if (lower.includes("sayfa sayısı:") || lower.includes("sayfa sayisi:")) {
        const countStr = line.split(":")[1]?.trim();
        pageCount = countStr ? Number.parseInt(countStr, 10) : undefined;
      } else if (lower.includes("dosya adı:") || lower.includes("dosya adi:")) {
        originalFilename = line.split(":")[1]?.trim() || "";
      } else if (lower.includes("boyut:") || lower.includes("dosya boyutu:")) {
        const sizeStr = line.split(":")[1]?.trim() || "";
        fileSizeBytes = this.parseSizeToBytes(sizeStr);
      }
    }

    const downloadLinkEl = $('a[href*="/Eklenti/"]').first();
    const relativeDownload = downloadLinkEl.attr("href");
    const downloadUrl = relativeDownload
      ? relativeDownload.startsWith("http")
        ? relativeDownload
        : `${baseUrl}${relativeDownload}`
      : `${baseUrl}/Eklenti/${publicationId}`;

    let extractedText: string | undefined;

    if (shouldExtractText) {
      try {
        const pdfResp = await safeRedirectFetch(downloadUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; Protokol7Bot/1.0; +https://protokol-7.internal)",
            Accept: "application/pdf,*/*",
          },
          timeoutMs,
          allowLocalNetwork,
          retryOptions: { maxRetries: 2, initialDelayMs: 500 },
        });

        if (pdfResp.ok) {
          const arrayBuf = await pdfResp.arrayBuffer();
          const buf = Buffer.from(arrayBuf);

          // Magic byte validation (%PDF-)
          if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1").startsWith("%PDF-")) {
            const pdfResult = await extractText(new Uint8Array(arrayBuf));
            const rawPdfText = Array.isArray(pdfResult.text)
              ? pdfResult.text.join("\n\n")
              : String(pdfResult.text || "");
            extractedText = ContextGuard.stripInvisibleUnicode(rawPdfText);

            if (!pageCount && pdfResult.totalPages) {
              pageCount = pdfResult.totalPages;
            }
          }
        }
      } catch {
        // PDF download or extraction failed gracefully; metadata preserved
      }
    }

    const item: SaglikEkutuphaneItem = {
      id: publicationId,
      title,
      category: "healthcare",
      detailUrl,
      downloadUrl,
      publisher: publisher || undefined,
      year: year || undefined,
      language: language || undefined,
      pageCount: Number.isNaN(pageCount) ? undefined : pageCount,
      fileSizeBytes,
      originalFilename: originalFilename || undefined,
      extractedText,
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

  private parseSizeToBytes(sizeStr: string): number | undefined {
    const match = sizeStr.match(/([\d.,]+)\s*(kb|mb|gb|b)/i);
    if (!match) return undefined;

    const val = Number.parseFloat(match[1].replace(",", "."));
    const unit = match[2].toUpperCase();

    if (unit === "KB") return Math.round(val * 1024);
    if (unit === "MB") return Math.round(val * 1024 * 1024);
    if (unit === "GB") return Math.round(val * 1024 * 1024 * 1024);
    return Math.round(val);
  }
}
