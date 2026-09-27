/**
 * ArxivActor - Academic paper retrieval and metadata extraction actor.
 * Interfaces with the official arXiv Export Query API (Atom 1.0 XML) to query preprints,
 * extract normalized metadata, and optionally parse full text from paper PDFs.
 */

import * as cheerio from "cheerio";
import { extractText, getDocumentProxy } from "unpdf";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ArxivActorResult,
  ArxivActorTaskOptions,
  ArxivAuthor,
  ArxivPaperItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 10;
const MAX_PDF_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
const ARXIV_API_BASE = "https://export.arxiv.org/api/query";

export class ArxivActor implements IActor<ArxivActorResult> {
  readonly actorType = "arxiv" as const;
  readonly description =
    "Queries arXiv Export Query API (Atom 1.0) for preprints, extracts metadata, abstracts, and optional PDF text.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ArxivActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: ArxivActorTaskOptions = task.options?.arxivOptions || {};
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

      // 2. Resolve query parameters and base endpoint
      const resolvedQueryUrl = this.buildApiUrl(task.targetUrl, options);

      // 3. Validate resolved query URL against SSRF policy
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

      // 4. Fetch Atom XML from arXiv Export API
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(resolvedQueryUrl, {
          signal: controller.signal,
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; arxiv-actor)",
            Accept: "application/atom+xml, application/xml, text/xml, */*",
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
          errorMessage: `arXiv API returned HTTP error ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const xmlText = await response.text();

      // 5. Parse Atom 1.0 XML response via Cheerio
      const parseResult = this.parseAtomFeed(xmlText);

      // 6. Optional PDF full text extraction
      if (options.downloadPdf && parseResult.papers.length > 0) {
        await this.enrichPapersWithPdfText(parseResult.papers, timeoutMs, allowLocalNetwork);
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: response.status,
        data: {
          totalResults: parseResult.totalResults,
          startIndex: parseResult.startIndex,
          itemsPerPage: parseResult.itemsPerPage,
          papers: parseResult.papers,
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
   * Constructs the arXiv query API URL from options or extracts arXiv ID from a target URL.
   */
  private buildApiUrl(targetUrl: string | undefined, options: ArxivActorTaskOptions): string {
    const idList = [...(options.idList || [])];
    let baseEndpoint = ARXIV_API_BASE;

    if (targetUrl) {
      if (targetUrl.includes("/api/query") || targetUrl.includes("/query")) {
        try {
          const parsed = new URL(targetUrl);
          const existingQuery = parsed.searchParams.get("search_query");
          if (existingQuery && !options.searchQuery) {
            options.searchQuery = existingQuery;
          }
          const existingIdList = parsed.searchParams.get("id_list");
          if (existingIdList) {
            for (const id of existingIdList.split(",")) {
              const trimmed = id.trim();
              if (trimmed && !idList.includes(trimmed)) {
                idList.push(trimmed);
              }
            }
          }
          baseEndpoint = `${parsed.origin}${parsed.pathname}`;
        } catch {
          baseEndpoint = targetUrl;
        }
      } else {
        const extractedId = this.extractArxivId(targetUrl);
        if (extractedId && !idList.includes(extractedId)) {
          idList.push(extractedId);
        }
      }
    }

    const url = new URL(baseEndpoint);

    if (options.searchQuery) {
      url.searchParams.set("search_query", options.searchQuery);
    }

    if (idList.length > 0) {
      url.searchParams.set("id_list", idList.join(","));
    }

    if (options.start !== undefined && options.start >= 0) {
      url.searchParams.set("start", String(options.start));
    }

    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    url.searchParams.set("max_results", String(Math.max(1, maxResults)));

    if (options.sortBy) {
      url.searchParams.set("sortBy", options.sortBy);
    }

    if (options.sortOrder) {
      url.searchParams.set("sortOrder", options.sortOrder);
    }

    return url.toString();
  }

  /**
   * Extracts clean arXiv ID from various URL patterns:
   * - https://arxiv.org/abs/2301.07067v2
   * - https://arxiv.org/pdf/2301.07067.pdf
   * - https://arxiv.org/html/2301.07067
   * - arxiv:2301.07067
   * - cs/0101001
   */
  private extractArxivId(input: string): string | undefined {
    const trimmed = input.trim();
    const urlMatch = trimmed.match(
      /(?:abs|pdf|html)\/([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)(?:\.pdf)?/i
    );
    if (urlMatch) {
      return urlMatch[1];
    }

    const urnMatch = trimmed.match(
      /^arxiv:\s*([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)/i
    );
    if (urnMatch) {
      return urnMatch[1];
    }

    // Bare modern ID e.g. 2301.07067 or 2301.07067v1
    const bareMatch = trimmed.match(/^(\d{4}\.\d{4,5}(?:v\d+)?)$/);
    if (bareMatch) {
      return bareMatch[1];
    }

    return undefined;
  }

  /**
   * Parses Atom 1.0 XML feed into structured paper entries.
   */
  private parseAtomFeed(xml: string): {
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
    papers: ArxivPaperItem[];
  } {
    const $ = cheerio.load(xml, { xmlMode: true });

    const totalResultsStr = $("opensearch\\:totalResults, totalResults").text().trim();
    const startIndexStr = $("opensearch\\:startIndex, startIndex").text().trim();
    const itemsPerPageStr = $("opensearch\\:itemsPerPage, itemsPerPage").text().trim();

    const totalResults = Number.parseInt(totalResultsStr, 10) || 0;
    const startIndex = Number.parseInt(startIndexStr, 10) || 0;
    const itemsPerPage = Number.parseInt(itemsPerPageStr, 10) || 0;

    const papers: ArxivPaperItem[] = [];

    $("entry").each((_, entryEl) => {
      const entry = $(entryEl);
      const rawId = entry.find("id").text().trim();

      // Clean ID extracts e.g. 2301.07067v1 from http://arxiv.org/abs/2301.07067v1
      const idMatch = rawId.match(
        /(?:abs\/)?([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5}(?:v\d+)?)$/i
      );
      const cleanId = idMatch ? idMatch[1] : rawId;

      // Extract title and normalize whitespace
      const title = entry.find("title").text().replace(/\s+/g, " ").trim();

      // Extract summary / abstract
      const summary = entry.find("summary").text().replace(/\s+/g, " ").trim();

      // Extract authors with optional affiliation
      const authors: ArxivAuthor[] = [];
      entry.find("author").each((_, authorEl) => {
        const authorNode = $(authorEl);
        const name = authorNode.find("name").text().trim();
        const affiliation =
          authorNode.find("arxiv\\:affiliation, affiliation").text().trim() || undefined;
        if (name) {
          authors.push({ name, affiliation });
        }
      });

      const published = entry.find("published").text().trim();
      const updated = entry.find("updated").text().trim();

      // Categories
      const primaryCategoryNode = entry.find("arxiv\\:primary_category, primary_category");
      let primaryCategory = primaryCategoryNode.attr("term") || "";

      const categories: string[] = [];
      entry.find("category").each((_, catEl) => {
        const term = $(catEl).attr("term");
        if (term && !categories.includes(term)) {
          categories.push(term);
        }
      });

      if (!primaryCategory && categories.length > 0) {
        primaryCategory = categories[0];
      }

      // Links: find PDF link and HTML / alternate link
      let pdfUrl = "";
      let htmlUrl = "";

      entry.find("link").each((_, linkEl) => {
        const link = $(linkEl);
        const href = link.attr("href") || "";
        const titleAttr = link.attr("title");
        const typeAttr = link.attr("type");
        const relAttr = link.attr("rel");

        if (titleAttr === "pdf" || typeAttr === "application/pdf" || href.includes("/pdf/")) {
          pdfUrl = href;
        } else if (relAttr === "alternate" || href.includes("/abs/")) {
          htmlUrl = href;
        }
      });

      // Canonical link fallbacks
      if (!pdfUrl && cleanId) {
        pdfUrl = `https://arxiv.org/pdf/${cleanId}.pdf`;
      }
      if (!htmlUrl && cleanId) {
        htmlUrl = `https://arxiv.org/abs/${cleanId}`;
      }

      // Supplementary fields
      const doi = entry.find("arxiv\\:doi, doi").text().trim() || undefined;
      const comment =
        entry.find("arxiv\\:comment, comment").text().replace(/\s+/g, " ").trim() || undefined;
      const journalRef =
        entry.find("arxiv\\:journal_ref, journal_ref").text().replace(/\s+/g, " ").trim() ||
        undefined;

      papers.push({
        id: cleanId,
        entryUrl: rawId,
        title,
        summary,
        authors,
        published,
        updated,
        primaryCategory,
        categories,
        doi,
        comment,
        journalRef,
        pdfUrl,
        htmlUrl,
      });
    });

    return {
      totalResults: totalResults || papers.length,
      startIndex,
      itemsPerPage: itemsPerPage || papers.length,
      papers,
    };
  }

  /**
   * Fetches paper PDFs and extracts full-text using unpdf.
   */
  private async enrichPapersWithPdfText(
    papers: ArxivPaperItem[],
    timeoutMs: number,
    allowLocalNetwork: boolean
  ): Promise<void> {
    for (const paper of papers) {
      if (!paper.pdfUrl) continue;

      try {
        const ssrfCheck = await SSRFGuard.validateUrlWithDns(paper.pdfUrl, {
          allowLocalNetwork,
        });
        if (!ssrfCheck.valid) {
          continue;
        }

        const response = await safeRedirectFetch(paper.pdfUrl, {
          timeoutMs,
          allowLocalNetwork,
          headers: {
            "User-Agent": "protokol-7/1.0 (+https://github.com/protokol-7; arxiv-actor)",
            Accept: "application/pdf, */*",
          },
        });

        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_PDF_SIZE_BYTES) continue;

        const uint8Data = new Uint8Array(arrayBuffer);
        // Verify %PDF- signature
        const header = Buffer.from(uint8Data.slice(0, 5)).toString("ascii");
        if (!header.startsWith("%PDF-")) continue;

        const doc = await getDocumentProxy(uint8Data);
        const extracted = await extractText(doc);

        const rawPages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
        const cleanPages = rawPages.map((p) => (p || "").trim()).filter(Boolean);

        paper.fullText = cleanPages.join("\n\n");
        paper.pageCount = extracted.totalPages || cleanPages.length;
      } catch {
        // Tolerant on individual PDF download failures, keep metadata intact
      }
    }
  }
}
