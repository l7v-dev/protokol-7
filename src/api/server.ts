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
import { getDaemonRunHealth } from "../storage/daemon-run-monitor";
import type { ColdVaultExportOptions } from "../vault/types";
import { OPENAPI_SPECIFICATION, renderDocsHtml } from "./openapi-spec";
import {
  ControlRouter,
  type CreateJobRequestBody,
  type CreateSourceRequestBody,
} from "./routers/control-router";
import { DatasetRouter } from "./routers/dataset-router";
import { JobRouter, type ScheduleJobRequestBody } from "./routers/job-router";
import { PipelineRouter, type PipelineRunRequestBody } from "./routers/pipeline-router";
import { StoreRouter } from "./routers/store-router";
import { VaultRouter } from "./routers/vault-router";
import type {
  ActorTask,
  ActorType,
  ArchiveFormat,
  SupportedDocumentFormat,
  YoutubeTranscriptOutputFormat,
} from "./types";

const registry = createDefaultActorRegistry();
const storeRouter = new StoreRouter(registry);
const pipelineRouter = new PipelineRouter();
const datasetRouter = new DatasetRouter();
const jobRouter = new JobRouter(undefined, pipelineRouter.getRunner(), undefined, registry);
const vaultRouter = new VaultRouter();
const controlRouter = new ControlRouter();
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
      if (method === "GET" && (pathname === "/health" || pathname === "/api/v1/health")) {
        const daemonHealth = getDaemonRunHealth();
        sendJson(res, 200, {
          status:
            daemonHealth.monitoring === "unavailable" || daemonHealth.stale_runs.length
              ? "degraded"
              : "healthy",
          service: "protokol-7",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          activeBrowserContexts: BrowserPool.getActiveContexts(),
          daemonMonitoring: daemonHealth.monitoring,
          stale_runs: daemonHealth.stale_runs,
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

      // LLM Markdown Reader (/reader or /api/v1/reader, aliases: /markdown, /api/v1/markdown)
      if (
        method === "POST" &&
        (pathname === "/api/v1/reader" ||
          pathname === "/reader" ||
          pathname === "/api/v1/markdown" ||
          pathname === "/markdown")
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

      // Network Interceptor (/network/intercept or /api/v1/network/intercept, aliases: /intercept, /api/v1/intercept)
      if (
        method === "POST" &&
        (pathname === "/api/v1/network/intercept" ||
          pathname === "/network/intercept" ||
          pathname === "/api/v1/intercept" ||
          pathname === "/intercept")
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

      // SERP Search (/search or /api/v1/search, aliases: /serp, /api/v1/serp)
      if (
        method === "POST" &&
        (pathname === "/api/v1/search" ||
          pathname === "/search" ||
          pathname === "/api/v1/serp" ||
          pathname === "/serp")
      ) {
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

      // Document Extractor (/documents or /api/v1/documents, aliases: /document, /api/v1/document)
      if (
        method === "POST" &&
        (pathname === "/api/v1/documents" ||
          pathname === "/documents" ||
          pathname === "/api/v1/document" ||
          pathname === "/document")
      ) {
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

      // Archive Extractor (/archives or /api/v1/archives, aliases: /archive, /api/v1/archive)
      if (
        method === "POST" &&
        (pathname === "/api/v1/archives" ||
          pathname === "/archives" ||
          pathname === "/api/v1/archive" ||
          pathname === "/archive")
      ) {
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

      // Wikipedia Structured Knowledge Extractor (/wikipedia or /api/v1/wikipedia)
      if (method === "POST" && (pathname === "/api/v1/wikipedia" || pathname === "/wikipedia")) {
        const body = await parseBody<{
          targetUrl?: string;
          title?: string;
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const wikipediaActor = registry.get("wikipedia");
        if (!wikipediaActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikipedia actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wikipedia-${Date.now()}`,
          actorType: "wikipedia",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikipediaOptions: {
              title: body.title,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              ...body.options?.wikipediaOptions,
            },
          },
        };

        const result = await wikipediaActor.run(task, { task, startTime: Date.now() });
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

      // T.C. Resmî Gazete Harvester (/resmi-gazete or /api/v1/resmi-gazete)
      if (
        method === "POST" &&
        (pathname === "/api/v1/resmi-gazete" || pathname === "/resmi-gazete")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          date?: string;
          issueNumber?: number;
          category?:
            | "all"
            | "kanun"
            | "cumhurbaskanligi"
            | "yonetmelik"
            | "teblig"
            | "kurul-karari"
            | "ilanlar";
          query?: string;
          format?: "markdown" | "json";
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const rgActor = registry.get("resmi-gazete");
        if (!rgActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Resmi Gazete actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `rg-${Date.now()}`,
          actorType: "resmi-gazete",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            resmiGazeteOptions: {
              date: body.date,
              issueNumber: body.issueNumber,
              category: body.category,
              query: body.query,
              format: body.format,
              limit: body.limit,
              ...body.options?.resmiGazeteOptions,
            },
          },
        };

        const result = await rgActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Yargıtay & Danıştay Jurisprudence Harvester (/yargitay or /api/v1/yargitay)
      if (method === "POST" && (pathname === "/api/v1/yargitay" || pathname === "/yargitay")) {
        const body = await parseBody<{
          targetUrl?: string;
          court?: "yargitay" | "danistay";
          chamber?: string;
          caseNumber?: string;
          decisionNumber?: string;
          year?: number;
          legalArea?: "all" | "hukuk" | "ceza" | "idari" | "vergi";
          query?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const yargitayActor = registry.get("yargitay");
        if (!yargitayActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Yargitay actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `yargitay-${Date.now()}`,
          actorType: "yargitay",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            yargitayOptions: {
              court: body.court,
              chamber: body.chamber,
              caseNumber: body.caseNumber,
              decisionNumber: body.decisionNumber,
              year: body.year,
              legalArea: body.legalArea,
              query: body.query,
              limit: body.limit,
              ...body.options?.yargitayOptions,
            },
          },
        };

        const result = await yargitayActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Kamuoyu Aydınlatma Platformu (KAP) Harvester (/kap or /api/v1/kap)
      if (method === "POST" && (pathname === "/api/v1/kap" || pathname === "/kap")) {
        const body = await parseBody<{
          targetUrl?: string;
          companyTicker?: string;
          disclosureType?: "all" | "oda" | "fr" | "dg" | "gk" | string;
          fromDate?: string;
          toDate?: string;
          query?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const kapActor = registry.get("kap");
        if (!kapActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "KAP actor is not available.",
            "Verify actor registry initialization."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `kap-${Date.now()}`,
          actorType: "kap",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            kapOptions: {
              companyTicker: body.companyTicker,
              disclosureType: body.disclosureType,
              fromDate: body.fromDate,
              toDate: body.toDate,
              query: body.query,
              limit: body.limit,
              ...body.options?.kapOptions,
            },
          },
        };

        const result = await kapActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // GitHub Repository & Code Harvester (/github or /api/v1/github)
      if (method === "POST" && (pathname === "/api/v1/github" || pathname === "/github")) {
        const body = await parseBody<{
          targetUrl?: string;
          owner?: string;
          repo?: string;
          action?: "repo" | "readme" | "issues" | "pulls" | "releases" | "tree";
          state?: "open" | "closed" | "all";
          limit?: number;
          token?: string;
          options?: ActorTask["options"];
        }>(req);

        const githubActor = registry.get("github");
        if (!githubActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "GitHub actor is not available.",
            "Ensure GithubActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `github-${Date.now()}`,
          actorType: "github",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            githubOptions: {
              owner: body.owner,
              repo: body.repo,
              action: body.action,
              state: body.state,
              limit: body.limit,
              token: body.token,
              ...body.options?.githubOptions,
            },
          },
        };

        const result = await githubActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // OpenReview Academic Submissions & Reviews (/openreview or /api/v1/openreview)
      if (method === "POST" && (pathname === "/api/v1/openreview" || pathname === "/openreview")) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "submissions" | "forum" | "note";
          venue?: string;
          forumId?: string;
          noteId?: string;
          query?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const openreviewActor = registry.get("openreview");
        if (!openreviewActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "OpenReview actor is not available.",
            "Ensure OpenReviewActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `openreview-${Date.now()}`,
          actorType: "openreview",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            openreviewOptions: {
              action: body.action,
              venue: body.venue,
              forumId: body.forumId,
              noteId: body.noteId,
              query: body.query,
              limit: body.limit,
              ...body.options?.openreviewOptions,
            },
          },
        };

        const result = await openreviewActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Hacker News Discussions & Architecture Post-Mortems (/hacker-news or /api/v1/hacker-news)
      if (
        method === "POST" &&
        (pathname === "/api/v1/hacker-news" || pathname === "/hacker-news")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "top" | "best" | "new" | "ask" | "show" | "story" | "search";
          storyId?: number;
          query?: string;
          limit?: number;
          maxComments?: number;
          options?: ActorTask["options"];
        }>(req);

        const hnActor = registry.get("hacker-news");
        if (!hnActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Hacker News actor is not available.",
            "Ensure HackerNewsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `hn-${Date.now()}`,
          actorType: "hacker-news",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            hackerNewsOptions: {
              action: body.action,
              storyId: body.storyId,
              query: body.query,
              limit: body.limit,
              maxComments: body.maxComments,
              ...body.options?.hackerNewsOptions,
            },
          },
        };

        const result = await hnActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Hugging Face Datasets Server Harvester (/huggingface-datasets or /api/v1/huggingface-datasets)
      if (
        method === "POST" &&
        (pathname === "/api/v1/huggingface-datasets" || pathname === "/huggingface-datasets")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          dataset?: string;
          action?: "rows" | "splits" | "info" | "size";
          config?: string;
          split?: string;
          offset?: number;
          limit?: number;
          hfToken?: string;
          options?: ActorTask["options"];
        }>(req);

        const dataset = body.dataset || body.options?.huggingfaceDatasetsOptions?.dataset;
        if (!dataset && !body.targetUrl) {
          sendError(
            res,
            400,
            "MISSING_REQUIRED_PARAMETER",
            "Missing required 'dataset' or 'targetUrl' parameter.",
            "Provide dataset identifier (e.g. 'openai/gsm8k') in request body."
          );
          return;
        }

        const hfActor = registry.get("huggingface-datasets");
        if (!hfActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Hugging Face Datasets actor is not available.",
            "Ensure HuggingFaceDatasetsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `hf-${Date.now()}`,
          actorType: "huggingface-datasets",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            huggingfaceDatasetsOptions: {
              dataset: dataset || "",
              action: body.action,
              config: body.config,
              split: body.split,
              offset: body.offset,
              limit: body.limit,
              hfToken: body.hfToken,
              ...body.options?.huggingfaceDatasetsOptions,
            },
          },
        };

        const result = await hfActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Mathematical Reasoning & CoT Harvester (/math-reasoning or /api/v1/math-reasoning)
      if (
        method === "POST" &&
        (pathname === "/api/v1/math-reasoning" || pathname === "/math-reasoning")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          benchmark?: "gsm8k" | "math" | "svamp" | "olympiadbench" | string;
          subject?: string;
          split?: "train" | "test" | string;
          offset?: number;
          limit?: number;
          hfToken?: string;
          options?: ActorTask["options"];
        }>(req);

        const mathActor = registry.get("math-reasoning");
        if (!mathActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Mathematical reasoning actor is not available.",
            "Ensure MathReasoningActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `math-${Date.now()}`,
          actorType: "math-reasoning",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            mathReasoningOptions: {
              benchmark: body.benchmark,
              subject: body.subject,
              split: body.split,
              offset: body.offset,
              limit: body.limit,
              hfToken: body.hfToken,
              ...body.options?.mathReasoningOptions,
            },
          },
        };

        const result = await mathActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Code Generation & Evaluation Benchmark Harvester (/code-eval or /api/v1/code-eval)
      if (method === "POST" && (pathname === "/api/v1/code-eval" || pathname === "/code-eval")) {
        const body = await parseBody<{
          targetUrl?: string;
          benchmark?: "humaneval" | "mbpp" | "swe-bench" | string;
          split?: string;
          offset?: number;
          limit?: number;
          hfToken?: string;
          options?: ActorTask["options"];
        }>(req);

        const codeActor = registry.get("code-eval");
        if (!codeActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Code evaluation actor is not available.",
            "Ensure CodeEvalActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `code-eval-${Date.now()}`,
          actorType: "code-eval",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            codeEvalOptions: {
              benchmark: body.benchmark,
              split: body.split,
              offset: body.offset,
              limit: body.limit,
              hfToken: body.hfToken,
              ...body.options?.codeEvalOptions,
            },
          },
        };

        const result = await codeActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Formal Mathematical Proofs & Theorems Harvester (/proofwiki or /api/v1/proofwiki)
      if (method === "POST" && (pathname === "/api/v1/proofwiki" || pathname === "/proofwiki")) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "theorem" | "search" | "random" | "category" | string;
          title?: string;
          query?: string;
          category?: string;
          limit?: number;
          options?: ActorTask["options"];
        }>(req);

        const proofWikiActor = registry.get("proofwiki");
        if (!proofWikiActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "ProofWiki actor is not available.",
            "Ensure ProofWikiActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `proofwiki-${Date.now()}`,
          actorType: "proofwiki",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            proofWikiOptions: {
              action: body.action,
              title: body.title,
              query: body.query,
              category: body.category,
              limit: body.limit,
              ...body.options?.proofWikiOptions,
            },
          },
        };

        const result = await proofWikiActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Lean 4 & Mathlib Computer-Verified Formal Proofs Harvester (/lean-mathlib or /api/v1/lean-mathlib)
      if (
        method === "POST" &&
        (pathname === "/api/v1/lean-mathlib" || pathname === "/lean-mathlib")
      ) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "file" | "theorem" | "search" | "random" | string;
          repo?: string;
          path?: string;
          theorem?: string;
          query?: string;
          limit?: number;
          githubToken?: string;
          options?: ActorTask["options"];
        }>(req);

        const leanActor = registry.get("lean-mathlib");
        if (!leanActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Lean Mathlib actor is not available.",
            "Ensure LeanMathlibActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `lean-mathlib-${Date.now()}`,
          actorType: "lean-mathlib",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            leanMathlibOptions: {
              action: body.action,
              repo: body.repo,
              path: body.path,
              theorem: body.theorem,
              query: body.query,
              limit: body.limit,
              githubToken: body.githubToken,
              ...body.options?.leanMathlibOptions,
            },
          },
        };

        const result = await leanActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // LessWrong & Alignment Forum Epistemic Rationality Harvester (/lesswrong or /api/v1/lesswrong)
      if (method === "POST" && (pathname === "/api/v1/lesswrong" || pathname === "/lesswrong")) {
        const body = await parseBody<{
          targetUrl?: string;
          action?: "posts" | "post" | "comments" | "sequence" | "search" | string;
          platform?: "lesswrong" | "alignmentforum" | string;
          postId?: string;
          slug?: string;
          sequenceId?: string;
          query?: string;
          limit?: number;
          view?: "curated" | "top" | "new" | string;
          includeComments?: boolean;
          maxComments?: number;
          options?: ActorTask["options"];
        }>(req);

        const lwActor = registry.get("lesswrong");
        if (!lwActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "LessWrong actor is not available.",
            "Ensure LessWrongActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `lesswrong-${Date.now()}`,
          actorType: "lesswrong",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            lessWrongOptions: {
              action: body.action,
              platform: body.platform,
              postId: body.postId,
              slug: body.slug,
              sequenceId: body.sequenceId,
              query: body.query,
              limit: body.limit,
              view: body.view,
              includeComments: body.includeComments,
              maxComments: body.maxComments,
              ...body.options?.lessWrongOptions,
            },
          },
        };

        const result = await lwActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // YouTube Transcripts Harvester (/youtube-transcripts or /api/v1/youtube-transcripts)
      if (
        method === "POST" &&
        (pathname === "/api/v1/youtube-transcripts" || pathname === "/youtube-transcripts")
      ) {
        const body = await parseBody<{
          urls?: string[];
          videoId?: string;
          outputFormat?: YoutubeTranscriptOutputFormat;
          languageCode?: string;
          cleanText?: boolean;
          maxRetries?: number;
          preferBrowser?: boolean;
          channelNameBoolean?: boolean;
          channelIDBoolean?: boolean;
          datePublishedBoolean?: boolean;
          dateTextBoolean?: boolean;
          viewCountBoolean?: boolean;
          keywordsBoolean?: boolean;
          thumbnailBoolean?: boolean;
          descriptionBoolean?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const ytActor = registry.get("youtube-transcripts");
        if (!ytActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "YouTube Transcripts actor is not available.",
            "Ensure YoutubeTranscriptsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `yt-${Date.now()}`,
          actorType: "youtube-transcripts",
          targetUrl: body.targetUrl || body.urls?.[0] || body.videoId || "",
          options: {
            ...body.options,
            youtubeTranscriptsOptions: {
              urls: body.urls,
              videoId: body.videoId,
              outputFormat: body.outputFormat,
              languageCode: body.languageCode,
              cleanText: body.cleanText,
              maxRetries: body.maxRetries,
              preferBrowser: body.preferBrowser,
              channelNameBoolean: body.channelNameBoolean,
              channelIDBoolean: body.channelIDBoolean,
              datePublishedBoolean: body.datePublishedBoolean,
              dateTextBoolean: body.dateTextBoolean,
              viewCountBoolean: body.viewCountBoolean,
              keywordsBoolean: body.keywordsBoolean,
              thumbnailBoolean: body.thumbnailBoolean,
              descriptionBoolean: body.descriptionBoolean,
              targetUrl: body.targetUrl,
              ...body.options?.youtubeTranscriptsOptions,
            },
          },
        };

        const result = await ytActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikisource Harvester (/wikisource or /api/v1/wikisource)
      if (method === "POST" && (pathname === "/api/v1/wikisource" || pathname === "/wikisource")) {
        const body = await parseBody<{
          title?: string;
          titles?: string[];
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          fetchFullArticles?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wsActor = registry.get("wikisource");
        if (!wsActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikisource actor is not available.",
            "Ensure WikisourceActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `ws-${Date.now()}`,
          actorType: "wikisource",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikisourceOptions: {
              title: body.title,
              titles: body.titles,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              fetchFullArticles: body.fetchFullArticles,
              ...body.options?.wikisourceOptions,
            },
          },
        };

        const result = await wsActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wiktionary Lexical Extractor (/wiktionary or /api/v1/wiktionary)
      if (method === "POST" && (pathname === "/api/v1/wiktionary" || pathname === "/wiktionary")) {
        const body = await parseBody<{
          word?: string;
          words?: string[];
          lang?: string;
          action?: "definition" | "entry" | "search" | "random";
          query?: string;
          limit?: number;
          extractMarkdown?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wtActor = registry.get("wiktionary");
        if (!wtActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "WiktionaryActor is not registered in runtime registry.",
            "Verify actor registration in createDefaultActorRegistry()."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wt-${Date.now()}`,
          actorType: "wiktionary",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wiktionaryOptions: {
              word: body.word,
              words: body.words,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              extractMarkdown: body.extractMarkdown,
              ...body.options?.wiktionaryOptions,
            },
          },
        };

        const result = await wtActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikiquote Harvester (/wikiquote or /api/v1/wikiquote)
      if (method === "POST" && (pathname === "/api/v1/wikiquote" || pathname === "/wikiquote")) {
        const body = await parseBody<{
          title?: string;
          titles?: string[];
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          fetchFullArticles?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wqActor = registry.get("wikiquote");
        if (!wqActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikiquote actor is not available.",
            "Ensure WikiquoteActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wq-${Date.now()}`,
          actorType: "wikiquote",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikiquoteOptions: {
              title: body.title,
              titles: body.titles,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              fetchFullArticles: body.fetchFullArticles,
              ...body.options?.wikiquoteOptions,
            },
          },
        };

        const result = await wqActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikibooks Harvester (/wikibooks or /api/v1/wikibooks)
      if (method === "POST" && (pathname === "/api/v1/wikibooks" || pathname === "/wikibooks")) {
        const body = await parseBody<{
          title?: string;
          titles?: string[];
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          fetchFullArticles?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wbActor = registry.get("wikibooks");
        if (!wbActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikibooks actor is not available.",
            "Ensure WikibooksActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wb-${Date.now()}`,
          actorType: "wikibooks",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikibooksOptions: {
              title: body.title,
              titles: body.titles,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              fetchFullArticles: body.fetchFullArticles,
              ...body.options?.wikibooksOptions,
            },
          },
        };

        const result = await wbActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikiversity Harvester (/wikiversity or /api/v1/wikiversity)
      if (
        method === "POST" &&
        (pathname === "/api/v1/wikiversity" || pathname === "/wikiversity")
      ) {
        const body = await parseBody<{
          title?: string;
          titles?: string[];
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          fetchFullArticles?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wvActor = registry.get("wikiversity");
        if (!wvActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikiversity actor is not available.",
            "Ensure WikiversityActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wv-${Date.now()}`,
          actorType: "wikiversity",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikiversityOptions: {
              title: body.title,
              titles: body.titles,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              fetchFullArticles: body.fetchFullArticles,
              ...body.options?.wikiversityOptions,
            },
          },
        };

        const result = await wvActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikivoyage Harvester (/wikivoyage or /api/v1/wikivoyage)
      if (method === "POST" && (pathname === "/api/v1/wikivoyage" || pathname === "/wikivoyage")) {
        const body = await parseBody<{
          title?: string;
          titles?: string[];
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          fetchFullArticles?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wvyActor = registry.get("wikivoyage");
        if (!wvyActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikivoyage actor is not available.",
            "Ensure WikivoyageActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wvy-${Date.now()}`,
          actorType: "wikivoyage",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikivoyageOptions: {
              title: body.title,
              titles: body.titles,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              fetchFullArticles: body.fetchFullArticles,
              ...body.options?.wikivoyageOptions,
            },
          },
        };

        const result = await wvyActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikinews Harvester (/wikinews or /api/v1/wikinews)
      if (method === "POST" && (pathname === "/api/v1/wikinews" || pathname === "/wikinews")) {
        const body = await parseBody<{
          title?: string;
          titles?: string[];
          lang?: string;
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          fetchFullArticles?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wnActor = registry.get("wikinews");
        if (!wnActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikinews actor is not available.",
            "Ensure WikinewsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wn-${Date.now()}`,
          actorType: "wikinews",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikinewsOptions: {
              title: body.title,
              titles: body.titles,
              lang: body.lang,
              action: body.action,
              query: body.query,
              limit: body.limit,
              fetchFullArticles: body.fetchFullArticles,
              ...body.options?.wikinewsOptions,
            },
          },
        };

        const result = await wnActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikispecies Harvester (/wikispecies or /api/v1/wikispecies)
      if (
        method === "POST" &&
        (pathname === "/api/v1/wikispecies" || pathname === "/wikispecies")
      ) {
        const body = await parseBody<{
          title?: string;
          taxon?: string;
          titles?: string[];
          action?: "summary" | "article" | "search";
          query?: string;
          limit?: number;
          fetchFullArticles?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wspActor = registry.get("wikispecies");
        if (!wspActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikispecies actor is not available.",
            "Ensure WikispeciesActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wsp-${Date.now()}`,
          actorType: "wikispecies",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikispeciesOptions: {
              title: body.title,
              taxon: body.taxon,
              titles: body.titles,
              action: body.action,
              query: body.query,
              limit: body.limit,
              fetchFullArticles: body.fetchFullArticles,
              ...body.options?.wikispeciesOptions,
            },
          },
        };

        const result = await wspActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Wikidata Harvester (/wikidata or /api/v1/wikidata)
      if (method === "POST" && (pathname === "/api/v1/wikidata" || pathname === "/wikidata")) {
        const body = await parseBody<{
          entityId?: string;
          entityIds?: string[];
          action?: "entity" | "search" | "sparql" | "claims";
          query?: string;
          sparql?: string;
          propertyId?: string;
          lang?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const wdActor = registry.get("wikidata");
        if (!wdActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Wikidata actor is not available.",
            "Ensure WikidataActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `wd-${Date.now()}`,
          actorType: "wikidata",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            wikidataOptions: {
              entityId: body.entityId,
              entityIds: body.entityIds,
              action: body.action,
              query: body.query,
              sparql: body.sparql,
              propertyId: body.propertyId,
              lang: body.lang,
              limit: body.limit,
              ...body.options?.wikidataOptions,
            },
          },
        };

        const result = await wdActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Stanford Encyclopedia of Philosophy (/stanford-phil or /api/v1/stanford-phil)
      if (
        method === "POST" &&
        (pathname === "/api/v1/stanford-phil" || pathname === "/stanford-phil")
      ) {
        const body = await parseBody<{
          slug?: string;
          action?: "entry" | "search" | "contents";
          query?: string;
          letter?: string;
          limit?: number;
          includeBibliography?: boolean;
          includeRelated?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const sepActor = registry.get("stanford-phil");
        if (!sepActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Stanford Encyclopedia of Philosophy actor is not available.",
            "Ensure StanfordPhilActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `sep-${Date.now()}`,
          actorType: "stanford-phil",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            stanfordPhilOptions: {
              slug: body.slug,
              action: body.action,
              query: body.query,
              letter: body.letter,
              limit: body.limit,
              includeBibliography: body.includeBibliography,
              includeRelated: body.includeRelated,
              ...body.options?.stanfordPhilOptions,
            },
          },
        };

        const result = await sepActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Internet Encyclopedia of Philosophy (/internet-phil or /api/v1/internet-phil)
      if (
        method === "POST" &&
        (pathname === "/api/v1/internet-phil" || pathname === "/internet-phil")
      ) {
        const body = await parseBody<{
          slug?: string;
          action?: "entry" | "search";
          query?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const iepActor = registry.get("internet-phil");
        if (!iepActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Internet Encyclopedia of Philosophy actor is not available.",
            "Ensure InternetPhilActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `iep-${Date.now()}`,
          actorType: "internet-phil",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            internetPhilOptions: {
              slug: body.slug,
              action: body.action,
              query: body.query,
              limit: body.limit,
              ...body.options?.internetPhilOptions,
            },
          },
        };

        const result = await iepActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Metamath Proof Explorer (/metamath or /api/v1/metamath)
      if (method === "POST" && (pathname === "/api/v1/metamath" || pathname === "/metamath")) {
        const body = await parseBody<{
          theorem?: string;
          axiom?: string;
          action?: "theorem" | "search" | "axiom";
          query?: string;
          database?: "set.mm" | "iset.mm" | "ql.mm";
          includeProofSteps?: boolean;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const mmActor = registry.get("metamath");
        if (!mmActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Metamath actor is not available.",
            "Ensure MetamathActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `mm-${Date.now()}`,
          actorType: "metamath",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            metamathOptions: {
              theorem: body.theorem,
              axiom: body.axiom,
              action: body.action,
              query: body.query,
              database: body.database,
              includeProofSteps: body.includeProofSteps,
              limit: body.limit,
              ...body.options?.metamathOptions,
            },
          },
        };

        const result = await mmActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // PhilPapers Archive (/philpapers or /api/v1/philpapers)
      if (method === "POST" && (pathname === "/api/v1/philpapers" || pathname === "/philpapers")) {
        const body = await parseBody<{
          id?: string;
          action?: "record" | "search" | "category";
          query?: string;
          category?: string;
          filterSubject?: string;
          startYear?: number;
          endYear?: number;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const ppActor = registry.get("philpapers");
        if (!ppActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "PhilPapers actor is not available.",
            "Ensure PhilPapersActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `pp-${Date.now()}`,
          actorType: "philpapers",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            philpapersOptions: {
              id: body.id,
              action: body.action,
              query: body.query,
              category: body.category,
              filterSubject: body.filterSubject,
              startYear: body.startYear,
              endYear: body.endYear,
              limit: body.limit,
              ...body.options?.philpapersOptions,
            },
          },
        };

        const result = await ppActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // DevDocs Documentation (/devdocs or /api/v1/devdocs)
      if (method === "POST" && (pathname === "/api/v1/devdocs" || pathname === "/devdocs")) {
        const body = await parseBody<{
          action?: "list_docs" | "search" | "entry";
          doc?: string;
          path?: string;
          query?: string;
          category?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const devdocsActor = registry.get("devdocs");
        if (!devdocsActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "DevDocs actor is not available.",
            "Ensure DevDocsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `devdocs-${Date.now()}`,
          actorType: "devdocs",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            devdocsOptions: {
              action: body.action,
              doc: body.doc,
              path: body.path,
              query: body.query,
              category: body.category,
              limit: body.limit,
              ...body.options?.devdocsOptions,
            },
          },
        };

        const result = await devdocsActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Rosetta Code (/rosetta-code or /api/v1/rosetta-code)
      if (
        method === "POST" &&
        (pathname === "/api/v1/rosetta-code" || pathname === "/rosetta-code")
      ) {
        const body = await parseBody<{
          action?: "task" | "search" | "random" | "languages";
          task?: string;
          language?: string;
          query?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const rosettaActor = registry.get("rosetta-code");
        if (!rosettaActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Rosetta Code actor is not available.",
            "Ensure RosettaCodeActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `rosetta-${Date.now()}`,
          actorType: "rosetta-code",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            rosettaCodeOptions: {
              action: body.action,
              task: body.task,
              language: body.language,
              query: body.query,
              limit: body.limit,
              ...body.options?.rosettaCodeOptions,
            },
          },
        };

        const result = await rosettaActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Papers With Code (/papers-with-code or /api/v1/papers-with-code)
      if (
        method === "POST" &&
        (pathname === "/api/v1/papers-with-code" || pathname === "/papers-with-code")
      ) {
        const body = await parseBody<{
          action?: "paper" | "search" | "trending" | "daily";
          paper?: string;
          arxivId?: string;
          query?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const pwcActor = registry.get("papers-with-code");
        if (!pwcActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Papers With Code actor is not available.",
            "Ensure PapersWithCodeActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `pwc-${Date.now()}`,
          actorType: "papers-with-code",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            papersWithCodeOptions: {
              action: body.action,
              paper: body.paper,
              arxivId: body.arxivId,
              query: body.query,
              limit: body.limit,
              ...body.options?.papersWithCodeOptions,
            },
          },
        };

        const result = await pwcActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // LibreTexts STEM Textbooks (/libretexts or /api/v1/libretexts)
      if (method === "POST" && (pathname === "/api/v1/libretexts" || pathname === "/libretexts")) {
        const body = await parseBody<{
          action?: "page" | "search" | "subpages" | "toc";
          library?: string;
          pageId?: number | string;
          path?: string;
          query?: string;
          limit?: number;
          includeHtml?: boolean;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const ltActor = registry.get("libretexts");
        if (!ltActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "LibreTexts actor is not available.",
            "Ensure LibreTextsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `libretexts-${Date.now()}`,
          actorType: "libretexts",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            libretextsOptions: {
              action: body.action,
              library: body.library,
              pageId: body.pageId,
              path: body.path,
              query: body.query,
              limit: body.limit,
              includeHtml: body.includeHtml,
              ...body.options?.libretextsOptions,
            },
          },
        };

        const result = await ltActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Open Textbook Library (/open-textbook or /api/v1/open-textbook)
      if (
        method === "POST" &&
        (pathname === "/api/v1/open-textbook" || pathname === "/open-textbook")
      ) {
        const body = await parseBody<{
          action?: "book" | "search" | "subjects";
          bookId?: number | string;
          query?: string;
          subject?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const otActor = registry.get("open-textbook");
        if (!otActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Open Textbook actor is not available.",
            "Ensure OpenTextbookActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `opentextbook-${Date.now()}`,
          actorType: "open-textbook",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            openTextbookOptions: {
              action: body.action,
              bookId: body.bookId,
              query: body.query,
              subject: body.subject,
              limit: body.limit,
              ...body.options?.openTextbookOptions,
            },
          },
        };

        const result = await otActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Semantic Scholar Graph API (/semantic-scholar or /api/v1/semantic-scholar)
      if (
        method === "POST" &&
        (pathname === "/api/v1/semantic-scholar" || pathname === "/semantic-scholar")
      ) {
        const body = await parseBody<{
          action?: "paper" | "search" | "author" | "author_search" | "citations" | "references";
          paperId?: string;
          authorId?: string;
          query?: string;
          fields?: string;
          limit?: number;
          offset?: number;
          year?: string;
          apiKey?: string;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const s2Actor = registry.get("semantic-scholar");
        if (!s2Actor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Semantic Scholar actor is not available.",
            "Ensure SemanticScholarActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `semanticscholar-${Date.now()}`,
          actorType: "semantic-scholar",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            semanticScholarOptions: {
              action: body.action,
              paperId: body.paperId,
              authorId: body.authorId,
              query: body.query,
              fields: body.fields,
              limit: body.limit,
              offset: body.offset,
              year: body.year,
              apiKey: body.apiKey,
              ...body.options?.semanticScholarOptions,
            },
          },
        };

        const result = await s2Actor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Anayasa Mahkemesi (/anayasa-mahkemesi or /api/v1/anayasa-mahkemesi)
      if (
        method === "POST" &&
        (pathname === "/api/v1/anayasa-mahkemesi" || pathname === "/anayasa-mahkemesi")
      ) {
        const body = await parseBody<{
          action?: "individual_application" | "norm_review" | "search" | "decision";
          query?: string;
          category?: "individual" | "norm" | "party" | "yuce_divan" | "all";
          applicationNumber?: string;
          caseNumber?: string;
          decisionNumber?: string;
          decisionId?: string;
          right?: string;
          outcome?: string;
          year?: number;
          limit?: number;
          offset?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const aymActor = registry.get("anayasa-mahkemesi");
        if (!aymActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Anayasa Mahkemesi actor is not available.",
            "Ensure AnayasaMahkemesiActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `aym-${Date.now()}`,
          actorType: "anayasa-mahkemesi",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            anayasaMahkemesiOptions: {
              action: body.action,
              query: body.query,
              category: body.category,
              applicationNumber: body.applicationNumber,
              caseNumber: body.caseNumber,
              decisionNumber: body.decisionNumber,
              decisionId: body.decisionId,
              right: body.right,
              outcome: body.outcome,
              year: body.year,
              limit: body.limit,
              offset: body.offset,
              ...body.options?.anayasaMahkemesiOptions,
            },
          },
        };

        const result = await aymActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Danıştay (/danistay or /api/v1/danistay)
      if (method === "POST" && (pathname === "/api/v1/danistay" || pathname === "/danistay")) {
        const body = await parseBody<{
          action?: "search" | "decision";
          query?: string;
          chamber?: string;
          caseNumber?: string;
          decisionNumber?: string;
          decisionId?: string;
          year?: number;
          legalArea?: string;
          decisionType?: string;
          limit?: number;
          offset?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const danistayActor = registry.get("danistay");
        if (!danistayActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Danıştay actor is not available.",
            "Ensure DanistayActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `danistay-${Date.now()}`,
          actorType: "danistay",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            danistayOptions: {
              action: body.action,
              query: body.query,
              chamber: body.chamber,
              caseNumber: body.caseNumber,
              decisionNumber: body.decisionNumber,
              decisionId: body.decisionId,
              year: body.year,
              legalArea: body.legalArea,
              decisionType: body.decisionType,
              limit: body.limit,
              offset: body.offset,
              ...body.options?.danistayOptions,
            },
          },
        };

        const result = await danistayActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Google Patents (/google-patents or /api/v1/google-patents)
      if (
        method === "POST" &&
        (pathname === "/api/v1/google-patents" || pathname === "/google-patents")
      ) {
        const body = await parseBody<{
          action?: "patent" | "search" | "claims";
          patentId?: string;
          query?: string;
          inventor?: string;
          assignee?: string;
          country?: string;
          status?: "grant" | "application" | "all";
          before?: string;
          after?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const patentsActor = registry.get("google-patents");
        if (!patentsActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Google Patents actor is not available.",
            "Ensure GooglePatentsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `patents-${Date.now()}`,
          actorType: "google-patents",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            googlePatentsOptions: {
              action: body.action,
              patentId: body.patentId,
              query: body.query,
              inventor: body.inventor,
              assignee: body.assignee,
              country: body.country,
              status: body.status,
              before: body.before,
              after: body.after,
              limit: body.limit,
              ...body.options?.googlePatentsOptions,
            },
          },
        };

        const result = await patentsActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Perseus Digital Library (/perseus-dl or /api/v1/perseus-dl)
      if (method === "POST" && (pathname === "/api/v1/perseus-dl" || pathname === "/perseus-dl")) {
        const body = await parseBody<{
          action?: "text" | "morph" | "search";
          doc?: string;
          subReference?: string;
          word?: string;
          language?: string;
          query?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const perseusActor = registry.get("perseus-dl");
        if (!perseusActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Perseus Digital Library actor is not available.",
            "Ensure PerseusDlActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `perseus-${Date.now()}`,
          actorType: "perseus-dl",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            perseusDlOptions: {
              action: body.action,
              doc: body.doc,
              subReference: body.subReference,
              word: body.word,
              language: body.language,
              query: body.query,
              limit: body.limit,
              ...body.options?.perseusDlOptions,
            },
          },
        };

        const result = await perseusActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Sacred Texts (/sacred-texts or /api/v1/sacred-texts)
      if (
        method === "POST" &&
        (pathname === "/api/v1/sacred-texts" || pathname === "/sacred-texts")
      ) {
        const body = await parseBody<{
          action?: "text" | "catalog" | "search";
          tradition?: string;
          path?: string;
          query?: string;
          limit?: number;
          targetUrl?: string;
          options?: ActorTask["options"];
        }>(req);

        const sacredTextsActor = registry.get("sacred-texts");
        if (!sacredTextsActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Internet Sacred Text Archive actor is not available.",
            "Ensure SacredTextsActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `sacred-texts-${Date.now()}`,
          actorType: "sacred-texts",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            sacredTextsOptions: {
              action: body.action,
              tradition: body.tradition,
              path: body.path,
              query: body.query,
              limit: body.limit,
              ...body.options?.sacredTextsOptions,
            },
          },
        };

        const result = await sacredTextsActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Instagram Public Harvester (/instagram or /api/v1/instagram)
      if (method === "POST" && (pathname === "/api/v1/instagram" || pathname === "/instagram")) {
        const body = await parseBody<{
          action?: "profile" | "post" | "recent_posts" | "hashtag";
          username?: string;
          shortcode?: string;
          hashtag?: string;
          limit?: number;
          targetUrl?: string;
          useBrowser?: boolean;
          renderJavaScript?: boolean;
          sessionCookies?: Array<{ name: string; value: string; domain?: string; path?: string }>;
          extractMarkdown?: boolean;
          extractComments?: boolean;
          commentsLimit?: number;
          options?: ActorTask["options"];
        }>(req);

        const instagramActor = registry.get("instagram");
        if (!instagramActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Instagram harvester actor is not available.",
            "Ensure InstagramActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `instagram-${Date.now()}`,
          actorType: "instagram",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            instagramOptions: {
              action: body.action,
              username: body.username,
              shortcode: body.shortcode,
              hashtag: body.hashtag,
              limit: body.limit,
              targetUrl: body.targetUrl,
              useBrowser: body.useBrowser,
              renderJavaScript: body.renderJavaScript,
              sessionCookies: body.sessionCookies,
              extractMarkdown: body.extractMarkdown,
              extractComments: body.extractComments,
              commentsLimit: body.commentsLimit,
              ...body.options?.instagramOptions,
            },
          },
        };

        const result = await instagramActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // PubMed & PMC Biomedical Literature Extractor (/pubmed or /api/v1/pubmed)
      if (method === "POST" && (pathname === "/api/v1/pubmed" || pathname === "/pubmed")) {
        const body = await parseBody<{
          action?: "search" | "summary" | "fetch" | "bioc";
          query?: string;
          pmids?: string[];
          pmcids?: string[];
          maxResults?: number;
          apiKey?: string;
          targetUrl?: string;
          timeoutMs?: number;
          options?: ActorTask["options"];
        }>(req);

        const pubmedActor = registry.get("pubmed");
        if (!pubmedActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "PubMed extractor actor is not available.",
            "Ensure PubmedActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `pubmed-${Date.now()}`,
          actorType: "pubmed",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            pubmedOptions: {
              action: body.action,
              query: body.query,
              pmids: body.pmids,
              pmcids: body.pmcids,
              maxResults: body.maxResults,
              apiKey: body.apiKey,
              timeoutMs: body.timeoutMs,
              ...body.options?.pubmedOptions,
            },
          },
        };

        const result = await pubmedActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // bioRxiv & medRxiv Life Sciences Preprint Extractor (/biorxiv or /api/v1/biorxiv)
      if (method === "POST" && (pathname === "/api/v1/biorxiv" || pathname === "/biorxiv")) {
        const body = await parseBody<{
          server?: "biorxiv" | "medrxiv";
          doi?: string;
          interval?: string;
          category?: string;
          query?: string;
          cursor?: number;
          limit?: number;
          targetUrl?: string;
          timeoutMs?: number;
          options?: ActorTask["options"];
        }>(req);

        const biorxivActor = registry.get("biorxiv");
        if (!biorxivActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "bioRxiv extractor actor is not available.",
            "Ensure BiorxivActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `biorxiv-${Date.now()}`,
          actorType: "biorxiv",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            biorxivOptions: {
              server: body.server,
              doi: body.doi,
              interval: body.interval,
              category: body.category,
              query: body.query,
              cursor: body.cursor,
              limit: body.limit,
              timeoutMs: body.timeoutMs,
              ...body.options?.biorxivOptions,
            },
          },
        };

        const result = await biorxivActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // DOAJ (Directory of Open Access Journals) Extractor (/doaj or /api/v1/doaj)
      if (method === "POST" && (pathname === "/api/v1/doaj" || pathname === "/doaj")) {
        const body = await parseBody<{
          action?: "search_articles" | "search_journals" | "get_article";
          query?: string;
          articleId?: string;
          page?: number;
          pageSize?: number;
          sort?: string;
          targetUrl?: string;
          timeoutMs?: number;
          options?: ActorTask["options"];
        }>(req);

        const doajActor = registry.get("doaj");
        if (!doajActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "DOAJ extractor actor is not available.",
            "Ensure DoajActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `doaj-${Date.now()}`,
          actorType: "doaj",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            doajOptions: {
              action: body.action,
              query: body.query,
              articleId: body.articleId,
              page: body.page,
              pageSize: body.pageSize,
              sort: body.sort,
              timeoutMs: body.timeoutMs,
              ...body.options?.doajOptions,
            },
          },
        };

        const result = await doajActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // TUBITAK ULAKBIM Aperta Extractor (/aperta or /api/v1/aperta)
      if (method === "POST" && (pathname === "/api/v1/aperta" || pathname === "/aperta")) {
        const body = await parseBody<{
          action?: "search_records" | "get_record" | "list_files";
          query?: string;
          recordId?: string;
          page?: number;
          pageSize?: number;
          sort?: string;
          targetUrl?: string;
          timeoutMs?: number;
          options?: ActorTask["options"];
        }>(req);

        const apertaActor = registry.get("aperta");
        if (!apertaActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Aperta extractor actor is not available.",
            "Ensure ApertaActor is registered in the ActorRegistry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `aperta-${Date.now()}`,
          actorType: "aperta",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            apertaOptions: {
              action: body.action,
              query: body.query,
              recordId: body.recordId,
              page: body.page,
              pageSize: body.pageSize,
              sort: body.sort,
              timeoutMs: body.timeoutMs,
              ...body.options?.apertaOptions,
            },
          },
        };

        const result = await apertaActor.run(task, { task, startTime: Date.now() });
        sendJson(res, result.status === "completed" ? 200 : result.statusCode || 500, {
          success: result.status === "completed",
          ...result,
        });
        return;
      }

      // Binance Vision Public Data Extractor (/binance-vision or /api/v1/binance-vision)
      if (
        method === "POST" &&
        (pathname === "/api/v1/binance-vision" || pathname === "/binance-vision")
      ) {
        const body = await parseBody<{
          action?: "list_files" | "list_symbols" | "get_file_info";
          market?: "spot" | "futures_um" | "futures_cm";
          dataType?: "klines" | "trades" | "aggTrades";
          symbol?: string;
          interval?: string;
          periodType?: "monthly" | "daily";
          year?: string;
          month?: string;
          limit?: number;
          targetUrl?: string;
          timeoutMs?: number;
          options?: ActorTask["options"];
        }>(req);

        const binanceActor = registry.get("binance-vision");
        if (!binanceActor) {
          sendError(
            res,
            500,
            "ACTOR_UNAVAILABLE",
            "Binance Vision extractor actor is not available.",
            "Verify actor registration in actor-registry."
          );
          return;
        }

        const task: ActorTask = {
          taskId: `binance-vision-${Date.now()}`,
          actorType: "binance-vision",
          targetUrl: body.targetUrl || "",
          options: {
            ...body.options,
            binanceVisionOptions: {
              action: body.action,
              market: body.market,
              dataType: body.dataType,
              symbol: body.symbol,
              interval: body.interval,
              periodType: body.periodType,
              year: body.year,
              month: body.month,
              limit: body.limit,
              timeoutMs: body.timeoutMs,
              ...body.options?.binanceVisionOptions,
            },
          },
        };

        const result = await binanceActor.run(task, { task, startTime: Date.now() });
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

        try {
          const actionResult = await InteractiveBrowserController.executeAction(
            body.sessionId,
            body.action,
            body.params || {}
          );
          sendJson(res, actionResult.success ? 200 : 400, actionResult);
        } catch (actionErr) {
          const message = actionErr instanceof Error ? actionErr.message : String(actionErr);
          sendError(
            res,
            400,
            "BROWSER_ACTION_FAILED",
            `Browser action execution failed: ${message}`,
            "Verify session validity and action parameters."
          );
        }
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

      if (method === "GET" && pathname.startsWith("/api/v1/lineage/")) {
        datasetRouter.handleRunLineage(res, pathname.slice("/api/v1/lineage/".length));
        return;
      }
      if (method === "POST" && /^\/api\/v1\/datasets\/[^/]+\/release$/.test(pathname)) {
        const parts = pathname.split("/");
        datasetRouter.handleRelease(
          res,
          parts[4],
          await parseBody<import("../dataset/types").ReleaseReview>(req)
        );
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

        if (parts.length === 2 && parts[1] === "gates") {
          datasetRouter.handleGetGates(res, parts[0]);
          return;
        }
        if (parts.length === 2 && parts[1] === "lineage") {
          datasetRouter.handleDatasetLineage(res, parts[0]);
          return;
        }

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

      // 12. Control Plane & Task Ledger Routes (/api/v1/control/*)
      if (method === "POST" && pathname === "/api/v1/control/jobs") {
        const body = await parseBody<CreateJobRequestBody>(req);
        await controlRouter.handleCreateJob(res, body);
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/v1/control/jobs/")) {
        const jobId = pathname.slice("/api/v1/control/jobs/".length).trim();
        await controlRouter.handleGetJob(res, jobId);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/control/sources") {
        const body = await parseBody<CreateSourceRequestBody>(req);
        await controlRouter.handleCreateSource(res, body);
        return;
      }

      if (method === "GET" && pathname.startsWith("/api/v1/control/sources/")) {
        const sourceId = pathname.slice("/api/v1/control/sources/".length).trim();
        await controlRouter.handleGetSource(res, sourceId);
        return;
      }

      if (method === "POST" && pathname === "/api/v1/control/leases/reap") {
        await controlRouter.handleReapLeases(res);
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
