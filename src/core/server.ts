/**
 * Protokol-7 Standalone HTTP REST & Automation Server.
 * Exposes scraping, crawling, and interactive browser actions via HTTP endpoints.
 */

import http from "node:http";
import { createDefaultActorRegistry } from "../actors/actor-registry";
import { BrowserPool } from "../browser/browser-pool";
import { InteractiveBrowserController } from "../browser/interactive-browser-controller";
import { globalPipedreamConnect } from "../integrations/pipedream-connect";
import { OPENAPI_SPECIFICATION, renderDocsHtml } from "./openapi-spec";
import { StoreRouter } from "./store-router";
import type { ActorTask, ActorType } from "./types";

const registry = createDefaultActorRegistry();
const storeRouter = new StoreRouter(registry);
const PORT = parseInt(process.env.PORT || "4000", 10);
const HOST = process.env.HOST || "0.0.0.0";

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

function sendError(
  res: http.ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  remedy: string,
  retryable = false,
  details?: unknown
): void {
  sendJson(res, statusCode, {
    success: false,
    error: message,
    code,
    retryable,
    remedy,
    timestamp: new Date().toISOString(),
    ...(details !== undefined ? { details } : {}),
  });
}

const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

async function parseBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_SIZE_BYTES) {
        req.destroy();
        reject(new Error("Payload too large. Maximum allowed body size is 10MB."));
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : ({} as T));
      } catch (_err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = parsedUrl.pathname;
    const method = req.method || "GET";

    try {
      // 0. OpenAPI 3.1 Specification & Interactive Documentation
      if (method === "GET" && pathname === "/openapi.json") {
        sendJson(res, 200, OPENAPI_SPECIFICATION);
        return;
      }

      if (method === "GET" && (pathname === "/docs" || pathname === "/api-docs")) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(renderDocsHtml());
        return;
      }

      // 1. Health check
      if (method === "GET" && pathname === "/health") {
        sendJson(res, 200, {
          status: "healthy",
          service: "protokol-7",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          activeBrowserContexts: BrowserPool.getActiveContexts(),
        });
        return;
      }

      // 2. List registered actors
      if (method === "GET" && (pathname === "/api/v1/actors" || pathname === "/actors")) {
        const actors = registry.list().map((actor) => ({
          actorType: actor.actorType,
          description: actor.description,
        }));
        sendJson(res, 200, { actors, total: actors.length });
        return;
      }

      // Execute actor task via /api/v1/actors or /api/actors
      if (method === "POST" && (pathname === "/api/v1/actors" || pathname === "/actors")) {
        const body = await parseBody<ActorTask>(req);
        if (!body.actorType || !body.targetUrl) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'actorType' or 'targetUrl' parameter.",
            "Provide both 'actorType' and 'targetUrl' in JSON body."
          );
          return;
        }
        const actor = registry.get(body.actorType);
        if (!actor) {
          sendError(
            res,
            404,
            "ACTOR_NOT_FOUND",
            `Actor '${body.actorType}' not found.`,
            "Check GET /api/v1/actors for registered actor types."
          );
          return;
        }
        const task: ActorTask = {
          taskId: body.taskId || `task-${Date.now()}`,
          actorType: body.actorType,
          targetUrl: body.targetUrl,
          selectors: body.selectors,
          options: body.options,
        };
        const result = await actor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // 3. Single page scrape (/scrape or /api/v1/scrape)
      if (method === "POST" && (pathname === "/api/v1/scrape" || pathname === "/scrape")) {
        const body = await parseBody<{
          targetUrl?: string;
          actorType?: ActorType;
          renderJavaScript?: boolean;
          selectors?: Record<string, string>;
          options?: ActorTask["options"];
        }>(req);

        if (!body.targetUrl) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'targetUrl' parameter.",
            "Provide 'targetUrl' string parameter in request body."
          );
          return;
        }

        const actorType: ActorType =
          body.actorType || (body.renderJavaScript ? "playwright-browser" : "cheerio-scraper");
        const actor = registry.get(actorType);
        if (!actor) {
          sendError(
            res,
            400,
            "ACTOR_NOT_REGISTERED",
            `Actor '${actorType}' not registered.`,
            "Check GET /api/v1/actors for valid actor types."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `scrape-${Date.now()}`,
          actorType,
          targetUrl: body.targetUrl,
          selectors: body.selectors,
          options: {
            renderJavaScript: body.renderJavaScript,
            ...body.options,
          },
        };

        const result = await actor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // 4. Crawl website (/crawl or /api/v1/crawl)
      if (method === "POST" && (pathname === "/api/v1/crawl" || pathname === "/crawl")) {
        const body = await parseBody<{
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        if (!body.targetUrl) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'targetUrl' parameter.",
            "Provide 'targetUrl' in request body."
          );
          return;
        }

        const crawler = registry.get("crawler");
        if (!crawler) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Crawler actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `crawl-${Date.now()}`,
          actorType: "crawler",
          targetUrl: body.targetUrl,
          options: body.options,
        };

        const result = await crawler.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Sitemap XML crawler (/sitemap or /api/v1/sitemap)
      if (method === "POST" && (pathname === "/api/v1/sitemap" || pathname === "/sitemap")) {
        const body = await parseBody<{
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        if (!body.targetUrl) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'targetUrl' parameter.",
            "Provide 'targetUrl' in request body."
          );
          return;
        }

        const sitemapActor = registry.get("sitemap-xml");
        if (!sitemapActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Sitemap actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `sitemap-${Date.now()}`,
          actorType: "sitemap-xml",
          targetUrl: body.targetUrl,
          options: body.options,
        };

        const result = await sitemapActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // LLM Markdown Reader (/reader or /api/v1/reader)
      if (method === "POST" && (pathname === "/api/v1/reader" || pathname === "/reader")) {
        const body = await parseBody<{
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        if (!body.targetUrl) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'targetUrl' parameter.",
            "Provide 'targetUrl' in request body."
          );
          return;
        }

        const readerActor = registry.get("markdown-reader");
        if (!readerActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Markdown reader actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `reader-${Date.now()}`,
          actorType: "markdown-reader",
          targetUrl: body.targetUrl,
          options: body.options,
        };

        const result = await readerActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Network Interceptor (/network/intercept or /api/v1/network/intercept)
      if (
        method === "POST" &&
        (pathname === "/api/v1/network/intercept" || pathname === "/network/intercept")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        if (!body.targetUrl) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'targetUrl' parameter.",
            "Provide 'targetUrl' in request body."
          );
          return;
        }

        const interceptor = registry.get("network-interceptor");
        if (!interceptor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Network interceptor actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `intercept-${Date.now()}`,
          actorType: "network-interceptor",
          targetUrl: body.targetUrl,
          options: body.options,
        };

        const result = await interceptor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // SERP Search (/search or /api/v1/search)
      if (method === "POST" && (pathname === "/api/v1/search" || pathname === "/search")) {
        const body = await parseBody<{
          query?: string;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const target = body.targetUrl || body.query;
        if (!target) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'query' or 'targetUrl' parameter.",
            "Provide 'query' or 'targetUrl' in request body."
          );
          return;
        }

        const serpActor = registry.get("serp-search");
        if (!serpActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "SERP search actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `serp-${Date.now()}`,
          actorType: "serp-search",
          targetUrl: target,
          options: body.options,
        };

        const result = await serpActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // PDF Document Extractor (/pdf or /api/v1/pdf)
      if (method === "POST" && (pathname === "/api/v1/pdf" || pathname === "/pdf")) {
        const body = await parseBody<{
          targetUrl?: string;
          pdfBase64?: string;
          options?: ActorTask["options"];
        }>(req);

        if (!body.targetUrl && !body.pdfBase64 && !body.options?.pdfOptions?.pdfBase64) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'targetUrl' or 'pdfBase64' parameter.",
            "Provide targetUrl or pdfBase64 parameter in request body."
          );
          return;
        }

        const pdfActor = registry.get("pdf-document");
        if (!pdfActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "PDF document actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `pdf-${Date.now()}`,
          actorType: "pdf-document",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            pdfOptions: {
              pdfBase64: body.pdfBase64 || body.options?.pdfOptions?.pdfBase64,
              ...body.options?.pdfOptions,
            },
          },
        };

        const result = await pdfActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // arXiv Research Paper Extractor (/arxiv or /api/v1/arxiv)
      if (method === "POST" && (pathname === "/api/v1/arxiv" || pathname === "/arxiv")) {
        const body = await parseBody<{
          targetUrl?: string;
          searchQuery?: string;
          idList?: string[];
          start?: number;
          maxResults?: number;
          sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate";
          sortOrder?: "ascending" | "descending";
          downloadPdf?: boolean;
          options?: ActorTask["options"];
        }>(req);

        const arxivActor = registry.get("arxiv");
        if (!arxivActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "arXiv actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `arxiv-${Date.now()}`,
          actorType: "arxiv",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            arxivOptions: {
              searchQuery: body.searchQuery,
              idList: body.idList,
              start: body.start,
              maxResults: body.maxResults,
              sortBy: body.sortBy,
              sortOrder: body.sortOrder,
              downloadPdf: body.downloadPdf,
              ...body.options?.arxivOptions,
            },
          },
        };

        const result = await arxivActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikimedia REST Knowledge Extractor (/wikimedia or /api/v1/wikimedia)
      if (method === "POST" && (pathname === "/api/v1/wikimedia" || pathname === "/wikimedia")) {
        const body = await parseBody<{
          targetUrl?: string;
          title?: string;
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const wikimediaActor = registry.get("wikimedia");
        if (!wikimediaActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikimedia actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wikimedia-${Date.now()}`,
          actorType: "wikimedia",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikimediaOptions: {
              title: body.title,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              ...body.options?.wikimediaOptions,
            },
          },
        };

        const result = await wikimediaActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // OpenAlex Scholarly Knowledge Extractor (/openalex or /api/v1/openalex)
      if (method === "POST" && (pathname === "/api/v1/openalex" || pathname === "/openalex")) {
        const body = await parseBody<{
          targetUrl?: string;
          searchQuery?: string;
          doi?: string;
          author?: string;
          concept?: string;
          publicationYear?: number;
          minCitations?: number;
          isOpenAccess?: boolean;
          perPage?: number;
          page?: number;
          mailto?: string;
          options?: ActorTask["options"];
        }>(req);

        const openalexActor = registry.get("openalex");
        if (!openalexActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "OpenAlex actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `openalex-${Date.now()}`,
          actorType: "openalex",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            openalexOptions: {
              searchQuery: body.searchQuery,
              doi: body.doi,
              author: body.author,
              concept: body.concept,
              publicationYear: body.publicationYear,
              minCitations: body.minCitations,
              isOpenAccess: body.isOpenAccess,
              perPage: body.perPage,
              page: body.page,
              mailto: body.mailto,
              ...body.options?.openalexOptions,
            },
          },
        };

        const result = await openalexActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Stack Exchange Reasoning Extractor (/stack-exchange or /api/v1/stack-exchange)
      if (
        method === "POST" &&
        (pathname === "/api/v1/stack-exchange" || pathname === "/stack-exchange")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          query?: string;
          site?: string;
          tagged?: string;
          minScore?: number;
          acceptedOnly?: boolean;
          pageSize?: number;
          page?: number;
          options?: ActorTask["options"];
        }>(req);

        const stackActor = registry.get("stack-exchange");
        if (!stackActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Stack Exchange actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `stack-${Date.now()}`,
          actorType: "stack-exchange",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            stackExchangeOptions: {
              query: body.query,
              site: body.site,
              tagged: body.tagged,
              minScore: body.minScore,
              acceptedOnly: body.acceptedOnly,
              pageSize: body.pageSize,
              page: body.page,
              ...body.options?.stackExchangeOptions,
            },
          },
        };

        const result = await stackActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Project Gutenberg Literature Extractor (/gutenberg or /api/v1/gutenberg)
      if (method === "POST" && (pathname === "/api/v1/gutenberg" || pathname === "/gutenberg")) {
        const body = await parseBody<{
          targetUrl?: string;
          searchQuery?: string;
          topic?: string;
          bookId?: number;
          downloadText?: boolean;
          maxBytes?: number;
          options?: ActorTask["options"];
        }>(req);

        const gutenbergActor = registry.get("gutenberg");
        if (!gutenbergActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Gutenberg actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `gutenberg-${Date.now()}`,
          actorType: "gutenberg",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            gutenbergOptions: {
              searchQuery: body.searchQuery,
              topic: body.topic,
              bookId: body.bookId,
              downloadText: body.downloadText,
              maxBytes: body.maxBytes,
              ...body.options?.gutenbergOptions,
            },
          },
        };

        const result = await gutenbergActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Europe PMC Biomedical Extractor (/europe-pmc or /api/v1/europe-pmc)
      if (method === "POST" && (pathname === "/api/v1/europe-pmc" || pathname === "/europe-pmc")) {
        const body = await parseBody<{
          targetUrl?: string;
          query?: string;
          openAccessOnly?: boolean;
          pageSize?: number;
          cursorMark?: string;
          synonym?: boolean;
          options?: ActorTask["options"];
        }>(req);

        const europePmcActor = registry.get("europe-pmc");
        if (!europePmcActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Europe PMC actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `europe-pmc-${Date.now()}`,
          actorType: "europe-pmc",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            europePmcOptions: {
              query: body.query,
              openAccessOnly: body.openAccessOnly,
              pageSize: body.pageSize,
              cursorMark: body.cursorMark,
              synonym: body.synonym,
              ...body.options?.europePmcOptions,
            },
          },
        };

        const result = await europePmcActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // IETF RFC Standards Extractor (/ietf-rfc or /api/v1/ietf-rfc)
      if (method === "POST" && (pathname === "/api/v1/ietf-rfc" || pathname === "/ietf-rfc")) {
        const body = await parseBody<{
          targetUrl?: string;
          rfcNumber?: number;
          query?: string;
          stream?: string;
          status?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const ietfRfcActor = registry.get("ietf-rfc");
        if (!ietfRfcActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "IETF RFC actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `ietf-rfc-${Date.now()}`,
          actorType: "ietf-rfc",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            ietfRfcOptions: {
              rfcNumber: body.rfcNumber,
              query: body.query,
              stream: body.stream,
              status: body.status,
              limit: body.limit,
              ...body.options?.ietfRfcOptions,
            },
          },
        };

        const result = await ietfRfcActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Saglik Bakanligi E-Kutuphane Extractor (/saglik-ekutuphane or /api/v1/saglik-ekutuphane)
      if (
        method === "POST" &&
        (pathname === "/api/v1/saglik-ekutuphane" || pathname === "/saglik-ekutuphane")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "list" | "detail" | "extract";
          category?: "all" | "books" | "journals" | "articles";
          publicationId?: number;
          page?: number;
          limit?: number;
          downloadPdf?: boolean;
          options?: ActorTask["options"];
        }>(req);

        const saglikActor = registry.get("saglik-ekutuphane");
        if (!saglikActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Saglik E-Kutuphane actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `saglik-${Date.now()}`,
          actorType: "saglik-ekutuphane",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            saglikEkutuphaneOptions: {
              action: body.action,
              category: body.category,
              publicationId: body.publicationId,
              page: body.page,
              limit: body.limit,
              downloadPdf: body.downloadPdf,
              ...body.options?.saglikEkutuphaneOptions,
            },
          },
        };

        const result = await saglikActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Kultur ve Turizm Bakanligi E-Kitap Extractor (/ktb-ekitap or /api/v1/ktb-ekitap)
      if (method === "POST" && (pathname === "/api/v1/ktb-ekitap" || pathname === "/ktb-ekitap")) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "list" | "detail" | "extract";
          category?:
            | "all"
            | "edebiyat"
            | "halk-bilimi"
            | "halk-kutuphaneleri"
            | "kultur"
            | "kulturel-miras"
            | "kutuphanecilik"
            | "sanat"
            | "tanitim"
            | "tarih"
            | "son-eklenen";
          bookId?: number;
          detailUrl?: string;
          page?: number;
          limit?: number;
          downloadPdf?: boolean;
          options?: ActorTask["options"];
        }>(req);

        const ktbActor = registry.get("ktb-ekitap");
        if (!ktbActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "KTB E-Kitap actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `ktb-${Date.now()}`,
          actorType: "ktb-ekitap",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            ktbEkitapOptions: {
              action: body.action,
              category: body.category,
              bookId: body.bookId,
              detailUrl: body.detailUrl,
              page: body.page,
              limit: body.limit,
              downloadPdf: body.downloadPdf,
              ...body.options?.ktbEkitapOptions,
            },
          },
        };

        const result = await ktbActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // 5. Interactive browser action (/browser/action or /api/v1/browser/action)
      if (
        method === "POST" &&
        (pathname === "/api/v1/browser/action" || pathname === "/browser/action")
      ) {
        const body = await parseBody<{
          sessionId?: string;
          action?: string;
          params?: Record<string, unknown>;
        }>(req);

        if (!body.sessionId || !body.action) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'sessionId' or 'action' parameter.",
            "Provide both 'sessionId' and 'action' in request body."
          );
          return;
        }

        const actionResult = await InteractiveBrowserController.executeAction(
          body.sessionId,
          body.action,
          body.params || {}
        );
        sendJson(res, actionResult.success ? 200 : 400, actionResult);
        return;
      }

      // 6. Close browser session (/browser/session/:id or /api/v1/browser/session/:id)
      const isDeleteSession =
        method === "DELETE" &&
        (pathname.startsWith("/api/v1/browser/session/") ||
          pathname.startsWith("/browser/session/"));

      if (isDeleteSession) {
        const prefix = pathname.startsWith("/api/v1/browser/session/")
          ? "/api/v1/browser/session/"
          : "/browser/session/";
        const sessionId = pathname.slice(prefix.length);
        if (sessionId) {
          await InteractiveBrowserController.closeSession(sessionId);
        }
        sendJson(res, 200, { success: true, closedSessionId: sessionId });
        return;
      }

      // 7. Actor Store & Web MVP Routes
      if (
        method === "GET" &&
        (pathname === "/" || pathname === "/store" || pathname === "/dashboard")
      ) {
        storeRouter.handleServeWeb(req, res);
        return;
      }

      if (method === "GET" && pathname === "/.well-known/mcp.json") {
        storeRouter.handleGetMcpCatalog(req, res);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/store/actors") {
        storeRouter.handleListActors(req, res);
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/v1/store/actors/")) {
        const actorName = pathname.slice("/api/v1/store/actors/".length);
        storeRouter.handleGetActor(res, actorName);
        return;
      }

      if (
        method === "POST" &&
        pathname.startsWith("/api/v1/store/actors/") &&
        pathname.endsWith("/run")
      ) {
        const match = pathname.match(/^\/api\/v1\/store\/actors\/([^/]+)\/run$/);
        if (match) {
          const body = await parseBody<Record<string, unknown>>(req);
          await storeRouter.handleRunActor(res, match[1], body);
          return;
        }
      }

      if (method === "GET" && pathname === "/api/v1/store/runs") {
        storeRouter.handleListRuns(req, res);
        return;
      }

      if (
        method === "GET" &&
        pathname.startsWith("/api/v1/store/runs/") &&
        pathname.endsWith("/events")
      ) {
        const match = pathname.match(/^\/api\/v1\/store\/runs\/([^/]+)\/events$/);
        if (match) {
          storeRouter.handleRunEventsSSE(res, match[1]);
          return;
        }
      }

      if (method === "GET" && pathname.startsWith("/api/v1/store/runs/")) {
        const runId = pathname.slice("/api/v1/store/runs/".length);
        storeRouter.handleGetRun(res, runId);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/store/quarantine") {
        storeRouter.handleGetQuarantine(req, res);
        return;
      }

      // Pipedream Connect Endpoints
      if (
        method === "GET" &&
        (pathname === "/api/v1/pipedream/config" || pathname === "/api/pipedream/config")
      ) {
        sendJson(res, 200, {
          status: "ok",
          ...globalPipedreamConnect.getConfigSummary(),
        });
        return;
      }

      if (
        method === "POST" &&
        (pathname === "/api/v1/pipedream/connect-token" ||
          pathname === "/api/v1/pipedream/tokens" ||
          pathname === "/api/pipedream/tokens")
      ) {
        const body = await parseBody<{
          externalUserId?: string;
          external_user_id?: string;
          app?: string;
          successRedirectUrl?: string;
          success_redirect_url?: string;
          errorRedirectUrl?: string;
          error_redirect_url?: string;
        }>(req);
        const externalUserId = body.externalUserId || body.external_user_id;
        if (!externalUserId) {
          sendJson(res, 400, { error: "Missing required 'externalUserId' parameter." });
          return;
        }
        try {
          const result = await globalPipedreamConnect.createConnectToken({
            externalUserId,
            app: body.app,
            successRedirectUrl: body.successRedirectUrl || body.success_redirect_url,
            errorRedirectUrl: body.errorRedirectUrl || body.error_redirect_url,
          });
          sendJson(res, 200, result);
        } catch (tokenErr) {
          const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
          sendJson(res, 500, {
            error: "Failed to generate Pipedream Connect token",
            details: msg,
          });
        }
        return;
      }

      if (
        method === "GET" &&
        (pathname === "/api/v1/pipedream/accounts" || pathname === "/api/pipedream/accounts")
      ) {
        const externalUserId =
          parsedUrl.searchParams.get("externalUserId") ||
          parsedUrl.searchParams.get("external_user_id");
        if (!externalUserId) {
          sendJson(res, 400, { error: "Missing required query parameter 'externalUserId'." });
          return;
        }
        const app = parsedUrl.searchParams.get("app") || undefined;
        try {
          const accounts = await globalPipedreamConnect.listAccounts(externalUserId, app);
          sendJson(res, 200, {
            accounts,
            total: Array.isArray(accounts) ? accounts.length : 0,
          });
        } catch (accErr) {
          const msg = accErr instanceof Error ? accErr.message : String(accErr);
          sendJson(res, 500, {
            error: "Failed to list connected accounts",
            details: msg,
          });
        }
        return;
      }

      if (
        method === "DELETE" &&
        (pathname.startsWith("/api/v1/pipedream/accounts/") ||
          pathname.startsWith("/api/pipedream/accounts/"))
      ) {
        const prefix = pathname.startsWith("/api/v1/pipedream/accounts/")
          ? "/api/v1/pipedream/accounts/"
          : "/api/pipedream/accounts/";
        const accountId = pathname.slice(prefix.length);
        if (!accountId) {
          sendJson(res, 400, { error: "Missing required 'accountId' path parameter." });
          return;
        }
        try {
          await globalPipedreamConnect.deleteAccount(accountId);
          sendJson(res, 200, { status: "deleted", accountId });
        } catch (delErr) {
          const msg = delErr instanceof Error ? delErr.message : String(delErr);
          sendJson(res, 500, {
            error: "Failed to delete account",
            details: msg,
          });
        }
        return;
      }

      if (
        method === "GET" &&
        (pathname === "/api/v1/pipedream/mcp/config" || pathname === "/api/pipedream/mcp/config")
      ) {
        const appSlug = parsedUrl.searchParams.get("appSlug") || parsedUrl.searchParams.get("app");
        const externalUserId =
          parsedUrl.searchParams.get("externalUserId") ||
          parsedUrl.searchParams.get("external_user_id");
        if (!appSlug || !externalUserId) {
          sendJson(res, 400, {
            error: "Missing required query parameters 'appSlug' and 'externalUserId'.",
          });
          return;
        }
        const config = globalPipedreamConnect.getMcpConfig({ appSlug, externalUserId });
        sendJson(res, 200, config);
        return;
      }

      if (
        method === "POST" &&
        (pathname === "/api/v1/pipedream/mcp/token" || pathname === "/api/pipedream/mcp/token")
      ) {
        try {
          const accessToken = await globalPipedreamConnect.getDeveloperAccessToken();
          sendJson(res, 200, { accessToken });
        } catch (tokenErr) {
          const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
          sendJson(res, 500, {
            error: "Failed to obtain developer access token",
            details: msg,
          });
        }
        return;
      }

      // 404 Catch-all
      sendError(
        res,
        404,
        "ROUTE_NOT_FOUND",
        "Route not found",
        "Check GET /docs or GET /openapi.json for registered routes.",
        false,
        { path: pathname, method }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPayloadTooLarge = message.includes("Payload too large");
      sendError(
        res,
        isPayloadTooLarge ? 413 : 500,
        isPayloadTooLarge ? "PAYLOAD_TOO_LARGE" : "INTERNAL_SERVER_ERROR",
        isPayloadTooLarge ? "Payload too large" : "Internal server error",
        isPayloadTooLarge
          ? "Reduce body payload to under 10MB."
          : "Inspect server logs and retry with valid payload.",
        !isPayloadTooLarge,
        message
      );
    }
  });
}

const isMainModule =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith("/server.ts") || process.argv[1].endsWith("/server.js"));

if (isMainModule && process.env.NODE_ENV !== "test") {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(
      `[protokol-7] Web Scraping & Browser Automation Service listening on http://${HOST}:${PORT}`
    );
  });
}
