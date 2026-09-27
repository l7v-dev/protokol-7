/**
 * Protokol-7 Standalone HTTP REST & Automation Server.
 * Exposes scraping, crawling, and interactive browser actions via HTTP endpoints.
 */

import http from "node:http";
import { createDefaultActorRegistry } from "../actors/actor-registry";
import { BrowserPool } from "../browser/browser-pool";
import { InteractiveBrowserController } from "../browser/interactive-browser-controller";
import type { PublishDatasetOptions } from "../dataset/types";
import { globalPipedreamConnect } from "../integrations/pipedream-connect";
import { HttpMcpTransport, ProtokolMcpServer } from "../mcp";
import { globalOcrRegistry } from "../ocr";
import type { ColdVaultExportOptions } from "../vault/types";
import { DatasetRouter } from "./routers/dataset-router";
import { JobRouter, type ScheduleJobRequestBody } from "./routers/job-router";
import { OPENAPI_SPECIFICATION, renderDocsHtml } from "./openapi-spec";
import { PipelineRouter, type PipelineRunRequestBody } from "./routers/pipeline-router";
import { StoreRouter } from "./routers/store-router";
import type { ActorTask, ActorType, ArchiveFormat, SupportedDocumentFormat } from "./types";
import { VaultRouter } from "./routers/vault-router";

const registry = createDefaultActorRegistry();
const storeRouter = new StoreRouter(registry);
const pipelineRouter = new PipelineRouter();
const datasetRouter = new DatasetRouter();
const jobRouter = new JobRouter(undefined, pipelineRouter.getRunner(), undefined, registry);
const vaultRouter = new VaultRouter();
const mcpServer = new ProtokolMcpServer(registry);
const httpMcpTransport = new HttpMcpTransport(mcpServer);
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

      // MCP Model Context Protocol HTTP Transport
      if (pathname === "/mcp") {
        if (method === "POST") {
          await httpMcpTransport.handleRequest(req, res);
          return;
        }
        res.writeHead(405, {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32600,
              message: "Method Not Allowed: MCP HTTP endpoint accepts only POST requests.",
            },
          })
        );
        return;
      }

      if (pathname === "/mcp/events" && method === "GET") {
        httpMcpTransport.handleEvents(req, res);
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

      // Document Extractor (/documents or /api/v1/documents)
      if (method === "POST" && (pathname === "/api/v1/documents" || pathname === "/documents")) {
        const body = await parseBody<{
          targetUrl?: string;
          documentBase64?: string;
          format?: SupportedDocumentFormat;
          maxRows?: number;
          delimiter?: string;
          options?: ActorTask["options"];
        }>(req);

        if (
          !body.targetUrl &&
          !body.documentBase64 &&
          !body.options?.documentOptions?.documentBase64
        ) {
          sendError(
            res,
            400,
            "INVALID_ARGUMENTS",
            "Either targetUrl or documentBase64 must be provided.",
            "Provide a target URL or base64 encoded document content."
          );
          return;
        }

        const docActor = registry.get("document-extractor");
        if (!docActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Document extractor actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `doc-${Date.now()}`,
          actorType: "document-extractor",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            documentOptions: {
              format: body.format,
              maxRows: body.maxRows,
              delimiter: body.delimiter,
              documentBase64: body.documentBase64 || body.options?.documentOptions?.documentBase64,
              ...body.options?.documentOptions,
            },
          },
        };

        const result = await docActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Archive Extractor (/archives or /api/v1/archives)
      if (method === "POST" && (pathname === "/api/v1/archives" || pathname === "/archives")) {
        const body = await parseBody<{
          targetUrl?: string;
          archiveBase64?: string;
          format?: ArchiveFormat;
          pattern?: string;
          previewMaxChars?: number;
          extractTextPreviews?: boolean;
          options?: ActorTask["options"];
        }>(req);

        if (
          !body.targetUrl &&
          !body.archiveBase64 &&
          !body.options?.archiveOptions?.archiveBase64
        ) {
          sendError(
            res,
            400,
            "INVALID_ARGUMENTS",
            "Either targetUrl or archiveBase64 must be provided.",
            "Provide a target URL or base64 encoded archive content."
          );
          return;
        }

        const archiveActor = registry.get("archive-extractor");
        if (!archiveActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Archive extractor actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `archive-${Date.now()}`,
          actorType: "archive-extractor",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            archiveOptions: {
              format: body.format,
              pattern: body.pattern,
              previewLength: body.previewMaxChars,
              extractTextPreviews: body.extractTextPreviews ?? true,
              archiveBase64: body.archiveBase64 || body.options?.archiveOptions?.archiveBase64,
              ...body.options?.archiveOptions,
            },
          },
        };

        const result = await archiveActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Optical Character Recognition (/ocr or /api/v1/ocr)
      if (method === "POST" && (pathname === "/api/v1/ocr" || pathname === "/ocr")) {
        const body = await parseBody<{
          imageBase64?: string;
          mimeType?: string;
          connector?: string;
          language?: string;
          prompt?: string;
          options?: Record<string, unknown>;
        }>(req);

        if (!body.imageBase64) {
          sendError(
            res,
            400,
            "INVALID_ARGUMENTS",
            "imageBase64 payload is required for OCR extraction.",
            "Provide base64-encoded image data."
          );
          return;
        }

        try {
          const ocrResult = await globalOcrRegistry.executeOcr(
            {
              imageBase64: body.imageBase64,
              mimeType: body.mimeType,
              language: body.language,
              prompt: body.prompt,
              options: body.options,
            },
            body.connector
          );

          sendJson(res, 200, {
            success: true,
            data: ocrResult,
          });
        } catch (ocrErr) {
          const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr);
          sendError(
            res,
            422,
            "OCR_FAILED",
            `OCR execution failed: ${msg}`,
            "Verify image payload format, OCR connector availability, or endpoint configuration."
          );
        }
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

      // EPUB Extractor (/epub or /api/v1/epub)
      if (method === "POST" && (pathname === "/api/v1/epub" || pathname === "/epub")) {
        const body = await parseBody<{
          targetUrl?: string;
          epubBase64?: string;
          includeTableOfContents?: boolean;
          maxChapters?: number;
          options?: ActorTask["options"];
        }>(req);

        if (!body.targetUrl && !body.epubBase64 && !body.options?.epubOptions?.epubBase64) {
          sendError(
            res,
            400,
            "INVALID_ARGUMENTS",
            "Either targetUrl or epubBase64 must be provided.",
            "Provide an EPUB download URL or base64-encoded EPUB container payload."
          );
          return;
        }

        const epubActor = registry.get("epub-extractor");
        if (!epubActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "EPUB extractor actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `epub-${Date.now()}`,
          actorType: "epub-extractor",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            epubOptions: {
              epubBase64: body.epubBase64 || body.options?.epubOptions?.epubBase64,
              includeTableOfContents:
                body.includeTableOfContents ?? body.options?.epubOptions?.includeTableOfContents,
              maxChapters: body.maxChapters ?? body.options?.epubOptions?.maxChapters,
              ...body.options?.epubOptions,
            },
          },
        };

        const result = await epubActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // DergiPark Academic Journal Harvester (/dergipark or /api/v1/dergipark)
      if (method === "POST" && (pathname === "/api/v1/dergipark" || pathname === "/dergipark")) {
        const body = await parseBody<{
          action?: "search" | "record" | "list-sets";
          set?: string;
          identifier?: string;
          keyword?: string;
          maxRecords?: number;
          resumptionToken?: string;
          options?: ActorTask["options"];
        }>(req);

        const dergiParkActor = registry.get("dergipark");
        if (!dergiParkActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "DergiPark actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `dp-${Date.now()}`,
          actorType: "dergipark",
          targetUrl: "https://dergipark.org.tr/api/public/oai",
          options: {
            ...body.options,
            dergiParkOptions: {
              action: body.action,
              set: body.set,
              identifier: body.identifier,
              keyword: body.keyword,
              maxRecords: body.maxRecords,
              resumptionToken: body.resumptionToken,
              ...body.options?.dergiParkOptions,
            },
          },
        };

        const result = await dergiParkActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Internet Archive Item Fetcher (/internet-archive or /api/v1/internet-archive)
      if (
        method === "POST" &&
        (pathname === "/api/v1/internet-archive" || pathname === "/internet-archive")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "metadata" | "search" | "text";
          identifier?: string;
          searchQuery?: string;
          mediaType?: string;
          maxResults?: number;
          maxTextChars?: number;
          options?: ActorTask["options"];
        }>(req);

        const iaActor = registry.get("internet-archive");
        if (!iaActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Internet Archive actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `ia-${Date.now()}`,
          actorType: "internet-archive",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            internetArchiveOptions: {
              action: body.action,
              identifier: body.identifier,
              searchQuery: body.searchQuery,
              mediaType: body.mediaType,
              maxResults: body.maxResults,
              maxTextChars: body.maxTextChars,
              ...body.options?.internetArchiveOptions,
            },
          },
        };

        const result = await iaActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // ClinicalTrials.gov Protocol Harvester (/clinical-trials or /api/v1/clinical-trials)
      if (
        method === "POST" &&
        (pathname === "/api/v1/clinical-trials" || pathname === "/clinical-trials")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          query?: string;
          condition?: string;
          intervention?: string;
          status?: string | string[];
          nctId?: string;
          pageSize?: number;
          pageToken?: string;
          options?: ActorTask["options"];
        }>(req);

        const ctActor = registry.get("clinical-trials");
        if (!ctActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "ClinicalTrials actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `ct-${Date.now()}`,
          actorType: "clinical-trials",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            clinicalTrialsOptions: {
              query: body.query,
              condition: body.condition,
              intervention: body.intervention,
              status: body.status,
              nctId: body.nctId,
              pageSize: body.pageSize,
              pageToken: body.pageToken,
              ...body.options?.clinicalTrialsOptions,
            },
          },
        };

        const result = await ctActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // openFDA Dataset Harvester (/open-fda or /api/v1/open-fda)
      if (method === "POST" && (pathname === "/api/v1/open-fda" || pathname === "/open-fda")) {
        const body = await parseBody<{
          targetUrl?: string;
          endpoint?: "drug/label" | "drug/event" | "device/510k" | "food/enforcement";
          search?: string;
          limit?: number;
          skip?: number;
          options?: ActorTask["options"];
        }>(req);

        const fdaActor = registry.get("open-fda");
        if (!fdaActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "openFDA actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `fda-${Date.now()}`,
          actorType: "open-fda",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            openFdaOptions: {
              endpoint: body.endpoint,
              search: body.search,
              limit: body.limit,
              skip: body.skip,
              ...body.options?.openFdaOptions,
            },
          },
        };

        const result = await fdaActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // SEC EDGAR Financial Filings Harvester (/sec-edgar or /api/v1/sec-edgar)
      if (method === "POST" && (pathname === "/api/v1/sec-edgar" || pathname === "/sec-edgar")) {
        const body = await parseBody<{
          targetUrl?: string;
          ticker?: string;
          cik?: string;
          formType?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const secActor = registry.get("sec-edgar");
        if (!secActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "SEC EDGAR actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `sec-${Date.now()}`,
          actorType: "sec-edgar",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            secEdgarOptions: {
              ticker: body.ticker,
              cik: body.cik,
              formType: body.formType,
              limit: body.limit,
              ...body.options?.secEdgarOptions,
            },
          },
        };

        const result = await secActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // CourtListener Legal Opinions Harvester (/court-listener or /api/v1/court-listener)
      if (
        method === "POST" &&
        (pathname === "/api/v1/court-listener" || pathname === "/court-listener")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          query?: string;
          court?: string;
          judge?: string;
          opinionId?: number;
          limit?: number;
          page?: number;
          options?: ActorTask["options"];
        }>(req);

        const clActor = registry.get("court-listener");
        if (!clActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "CourtListener actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `cl-${Date.now()}`,
          actorType: "court-listener",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            courtListenerOptions: {
              query: body.query,
              court: body.court,
              judge: body.judge,
              opinionId: body.opinionId,
              limit: body.limit,
              page: body.page,
              ...body.options?.courtListenerOptions,
            },
          },
        };

        const result = await clActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Software Heritage Code Archive (/software-heritage or /api/v1/software-heritage)
      if (
        method === "POST" &&
        (pathname === "/api/v1/software-heritage" || pathname === "/software-heritage")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          swhid?: string;
          originUrl?: string;
          action?: "content" | "directory" | "origin" | "revision";
          rawTextMaxChars?: number;
          options?: ActorTask["options"];
        }>(req);

        const swhActor = registry.get("software-heritage");
        if (!swhActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Software Heritage actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `swh-${Date.now()}`,
          actorType: "software-heritage",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            softwareHeritageOptions: {
              swhid: body.swhid,
              originUrl: body.originUrl,
              action: body.action,
              rawTextMaxChars: body.rawTextMaxChars,
              ...body.options?.softwareHeritageOptions,
            },
          },
        };

        const result = await swhActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // EUR-Lex European Union Law (/eur-lex or /api/v1/eur-lex)
      if (method === "POST" && (pathname === "/api/v1/eur-lex" || pathname === "/eur-lex")) {
        const body = await parseBody<{
          targetUrl?: string;
          celex?: string;
          query?: string;
          language?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const eurLexActor = registry.get("eur-lex");
        if (!eurLexActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "EUR-Lex actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `eurlex-${Date.now()}`,
          actorType: "eur-lex",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            eurLexOptions: {
              celex: body.celex,
              query: body.query,
              language: body.language,
              limit: body.limit,
              ...body.options?.eurLexOptions,
            },
          },
        };

        const result = await eurLexActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // OpenStax Textbook Harvester (/openstax or /api/v1/openstax)
      if (method === "POST" && (pathname === "/api/v1/openstax" || pathname === "/openstax")) {
        const body = await parseBody<{
          targetUrl?: string;
          query?: string;
          bookId?: number | string;
          slug?: string;
          action?: "catalog" | "search" | "detail" | "chapter";
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const openStaxActor = registry.get("openstax");
        if (!openStaxActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "OpenStax actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `openstax-${Date.now()}`,
          actorType: "openstax",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            openstaxOptions: {
              query: body.query,
              bookId: body.bookId,
              slug: body.slug,
              action: body.action,
              limit: body.limit,
              ...body.options?.openstaxOptions,
            },
          },
        };

        const result = await openStaxActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // MIT OpenCourseWare Harvester (/mit-ocw or /api/v1/mit-ocw)
      if (method === "POST" && (pathname === "/api/v1/mit-ocw" || pathname === "/mit-ocw")) {
        const body = await parseBody<{
          targetUrl?: string;
          query?: string;
          courseSlug?: string;
          action?: "search" | "course";
          limit?: number;
          offset?: number;
          options?: ActorTask["options"];
        }>(req);

        const mitActor = registry.get("mit-ocw");
        if (!mitActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "MIT OpenCourseWare actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `mitocw-${Date.now()}`,
          actorType: "mit-ocw",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            mitOcwOptions: {
              query: body.query,
              courseSlug: body.courseSlug,
              action: body.action,
              limit: body.limit,
              offset: body.offset,
              ...body.options?.mitOcwOptions,
            },
          },
        };

        const result = await mitActor.run(task, { task, startTime: Date.now() });
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

      // 7. Headless Service Information & Actor Store Routes
      if (
        method === "GET" &&
        (pathname === "/" || pathname === "/store" || pathname === "/dashboard")
      ) {
        storeRouter.handleServiceInfo(req, res);
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

      // 8. Declarative YAML Pipeline Execution & History Routes
      if (method === "POST" && pathname === "/api/v1/pipelines/run") {
        const body = await parseBody<PipelineRunRequestBody>(req);
        await pipelineRouter.handleRunPipeline(res, body);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/pipelines/runs") {
        pipelineRouter.handleListRuns(req, res);
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/v1/pipelines/runs/")) {
        const runId = pathname.slice("/api/v1/pipelines/runs/".length);
        pipelineRouter.handleGetRun(res, runId);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/pipelines/templates") {
        pipelineRouter.handleListTemplates(res);
        return;
      }

      // 9. Training Dataset Snapshot & Manifest Routes
      if (method === "POST" && pathname === "/api/v1/datasets/publish") {
        const body = await parseBody<PublishDatasetOptions>(req);
        await datasetRouter.handlePublishDataset(res, body);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/datasets") {
        datasetRouter.handleListDatasets(res);
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/v1/datasets/")) {
        const subPath = pathname.slice("/api/v1/datasets/".length);
        const parts = subPath.split("/").filter(Boolean);

        // /api/v1/datasets/:name
        if (parts.length === 1) {
          datasetRouter.handleGetDataset(res, parts[0]);
          return;
        }

        // /api/v1/datasets/:name/manifest
        if (parts.length === 2 && parts[1] === "manifest") {
          datasetRouter.handleGetLatestManifest(res, parts[0]);
          return;
        }

        // /api/v1/datasets/:name/snapshots
        if (parts.length === 2 && parts[1] === "snapshots") {
          datasetRouter.handleListSnapshots(res, parts[0]);
          return;
        }

        // /api/v1/datasets/:name/snapshots/:snapshotId
        if (parts.length === 3 && parts[1] === "snapshots") {
          datasetRouter.handleGetSnapshot(res, parts[0], parts[2]);
          return;
        }
      }

      // 10. Scheduled Jobs & Cron Routes
      if (method === "POST" && pathname === "/api/v1/jobs/schedule") {
        const body = await parseBody<ScheduleJobRequestBody>(req);
        await jobRouter.handleScheduleJob(res, body);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/jobs") {
        jobRouter.handleListJobs(res);
        return;
      }

      if (pathname.startsWith("/api/v1/jobs/")) {
        const subPath = pathname.slice("/api/v1/jobs/".length);
        const parts = subPath.split("/").filter(Boolean);

        if (parts.length === 1) {
          const jobId = parts[0];
          if (method === "GET") {
            jobRouter.handleGetJob(res, jobId);
            return;
          }
          if (method === "DELETE") {
            jobRouter.handleCancelJob(res, jobId);
            return;
          }
        }

        if (parts.length === 2 && parts[1] === "stop" && method === "POST") {
          jobRouter.handleCancelJob(res, parts[0]);
          return;
        }
      }

      // 11. Cold Vault Physical Storage Routes
      if (method === "POST" && pathname === "/api/v1/vault/export") {
        const body = await parseBody<ColdVaultExportOptions>(req);
        await vaultRouter.handleExport(res, body);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/vault/verify") {
        const body = await parseBody<{ volumeRoot: string }>(req);
        await vaultRouter.handleVerify(res, body);
        return;
      }

      if (method === "GET" && pathname === "/api/v1/vault/inspect") {
        const volumeRoot = parsedUrl.searchParams.get("volumeRoot") || "";
        vaultRouter.handleInspect(res, volumeRoot);
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

  const gracefulShutdown = async (signal: string) => {
    console.log(`[protokol-7] Received ${signal}. Initiating graceful shutdown...`);
    server.close(async () => {
      try {
        await BrowserPool.shutdown();
      } catch (err) {
        console.error("[protokol-7] Error during browser pool shutdown:", err);
      }
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void gracefulShutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void gracefulShutdown("SIGTERM");
  });
}
