/**
 * Actor Store Router, SSE Event Streamer, and Web MVP Controller for Protokol-7.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type http from "node:http";
import { join } from "node:path";
import { ACTOR_MANIFESTS } from "../actors/actor-manifests";
import type { ActorRegistry } from "../actors/actor-registry";
import type { StoredSessionState } from "../browser/session-vault";
import type { ProxyConfig } from "../network/proxy-manager";
import { globalRunRegistry } from "./run-registry";
import type { ActorTask, ApiExtractorTaskOptions } from "./types";

const POOL_ROOT = process.env.PROTOKOL_POOL_ROOT || "/home/l7v/protokol-data-pool";

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

export class StoreRouter {
  constructor(private readonly registry: ActorRegistry) {}

  // 1. GET /api/v1/store/actors
  handleListActors(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const list = Object.values(ACTOR_MANIFESTS).map((m) => ({
      name: m.name,
      title: m.title,
      category: m.category,
      version: m.version,
      description: m.description,
      author: m.author,
      tags: m.tags,
      actorType: m.actorType,
      successRate30d: 99.4,
      totalRuns: 1420,
    }));
    sendJson(res, 200, { actors: list, total: list.length });
  }

  // 2. GET /api/v1/store/actors/:name
  handleGetActor(res: http.ServerResponse, name: string): void {
    const manifest = ACTOR_MANIFESTS[name];
    if (!manifest) {
      sendJson(res, 404, { error: `Actor '${name}' not found in store catalog.` });
      return;
    }
    sendJson(res, 200, { actor: manifest });
  }

  // 3. POST /api/v1/store/actors/:name/run
  async handleRunActor(
    res: http.ServerResponse,
    name: string,
    body: Record<string, unknown>
  ): Promise<void> {
    const manifest = ACTOR_MANIFESTS[name];
    if (!manifest) {
      sendJson(res, 404, { error: `Actor '${name}' not found in store.` });
      return;
    }

    // Girdi parametrelerini şemaya göre doğrula
    const required = manifest.inputSchema.required || [];
    for (const reqField of required) {
      if (body[reqField] === undefined || body[reqField] === null || body[reqField] === "") {
        sendJson(res, 400, {
          error: `Eksik zorunlu parametre: '${reqField}' alanı doldurulmalıdır.`,
        });
        return;
      }
    }

    const run = globalRunRegistry.createRun(name, body);
    globalRunRegistry.startRun(run.runId);

    // Özel Sağlık E-Kütüphane çalıştırması
    if (name === "saglik-ekutuphane") {
      const checkpointPath = join(
        POOL_ROOT,
        "out/saglik-ekutuphane/00_map_index_pool/checkpoint.json"
      );
      if (existsSync(checkpointPath)) {
        try {
          const cp = JSON.parse(readFileSync(checkpointPath, "utf8"));
          globalRunRegistry.appendLog(
            run.runId,
            "INFO",
            `Havuz durumu okundu: ${cp.stats.extracted_texts} damıtılmış yayın mevcut.`
          );
          globalRunRegistry.completeRun(
            run.runId,
            {
              stats: cp.stats,
              categories: cp.categories,
              poolRoot: POOL_ROOT,
            },
            cp.stats.extracted_texts || 0
          );
          sendJson(res, 200, { runId: run.runId, status: "succeeded", run });
          return;
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          globalRunRegistry.failRun(run.runId, err);
          sendJson(res, 500, { runId: run.runId, status: "failed", error: err });
          return;
        }
      }
    }

    // Çekirdek aktör çalıştırıcısı
    const actor = this.registry.get(manifest.actorType);
    if (!actor) {
      const msg = `Aktör motoru '${manifest.actorType}' bulunamadı.`;
      globalRunRegistry.failRun(run.runId, msg);
      sendJson(res, 500, { runId: run.runId, status: "failed", error: msg });
      return;
    }

    const targetUrl = String(body.targetUrl || "");
    const rawOptions = (body.options as Record<string, unknown>) || {};
    const task: ActorTask = {
      taskId: run.runId,
      actorType: manifest.actorType,
      targetUrl,
      selectors: body.selectors as Record<string, string> | undefined,
      options: {
        timeoutMs: Number(body.timeoutMs || rawOptions.timeoutMs) || 30000,
        waitForSelector:
          body.waitForSelector || rawOptions.waitForSelector
            ? String(body.waitForSelector || rawOptions.waitForSelector)
            : undefined,
        captureScreenshot: Boolean(body.captureScreenshot || rawOptions.captureScreenshot),
        blockAssets: body.blockAssets !== false && rawOptions.blockAssets !== false,
        extractTables: body.extractTables !== false && rawOptions.extractTables !== false,
        extractJsonLd: body.extractJsonLd !== false && rawOptions.extractJsonLd !== false,
        crawlerOptions:
          body.maxPages || rawOptions.crawlerOptions
            ? {
                maxPages: Number(body.maxPages) || undefined,
                ...((rawOptions.crawlerOptions as object) || {}),
              }
            : undefined,
        pdfOptions:
          body.maxPages || body.pdfBase64 || rawOptions.pdfOptions
            ? {
                maxPages: body.maxPages ? Number(body.maxPages) : undefined,
                pdfBase64: body.pdfBase64 ? String(body.pdfBase64) : undefined,
                ...((rawOptions.pdfOptions as object) || {}),
              }
            : undefined,
        serpOptions:
          body.query || rawOptions.serpOptions
            ? {
                query: body.query ? String(body.query) : undefined,
                maxResults: body.maxResults ? Number(body.maxResults) : undefined,
                ...((rawOptions.serpOptions as object) || {}),
              }
            : undefined,
        arxivOptions:
          body.searchQuery || body.idList || rawOptions.arxivOptions
            ? {
                searchQuery: body.searchQuery ? String(body.searchQuery) : undefined,
                idList: Array.isArray(body.idList) ? (body.idList as string[]) : undefined,
                start: body.start !== undefined ? Number(body.start) : undefined,
                maxResults: body.maxResults !== undefined ? Number(body.maxResults) : undefined,
                sortBy:
                  (body.sortBy as "relevance" | "lastUpdatedDate" | "submittedDate") || undefined,
                sortOrder: (body.sortOrder as "ascending" | "descending") || undefined,
                downloadPdf: Boolean(body.downloadPdf),
                ...((rawOptions.arxivOptions as object) || {}),
              }
            : undefined,
        wikimediaOptions:
          body.title || body.lang || body.action || body.query || rawOptions.wikimediaOptions
            ? {
                title: body.title ? String(body.title) : undefined,
                lang: body.lang ? String(body.lang) : undefined,
                action: (body.action as "summary" | "article" | "search") || undefined,
                query: body.query ? String(body.query) : undefined,
                limit: body.limit !== undefined ? Number(body.limit) : undefined,
                ...((rawOptions.wikimediaOptions as object) || {}),
              }
            : undefined,
        openalexOptions:
          body.searchQuery || body.doi || body.minCitations || rawOptions.openalexOptions
            ? {
                searchQuery: body.searchQuery ? String(body.searchQuery) : undefined,
                doi: body.doi ? String(body.doi) : undefined,
                author: body.author ? String(body.author) : undefined,
                concept: body.concept ? String(body.concept) : undefined,
                publicationYear:
                  body.publicationYear !== undefined ? Number(body.publicationYear) : undefined,
                minCitations:
                  body.minCitations !== undefined ? Number(body.minCitations) : undefined,
                isOpenAccess:
                  body.isOpenAccess !== undefined ? Boolean(body.isOpenAccess) : undefined,
                perPage: body.perPage !== undefined ? Number(body.perPage) : undefined,
                page: body.page !== undefined ? Number(body.page) : undefined,
                ...((rawOptions.openalexOptions as object) || {}),
              }
            : undefined,
        stackExchangeOptions:
          body.query || body.site || body.tagged || rawOptions.stackExchangeOptions
            ? {
                query: body.query ? String(body.query) : undefined,
                site: body.site ? String(body.site) : undefined,
                tagged: body.tagged ? String(body.tagged) : undefined,
                minScore: body.minScore !== undefined ? Number(body.minScore) : undefined,
                acceptedOnly:
                  body.acceptedOnly !== undefined ? Boolean(body.acceptedOnly) : undefined,
                pageSize: body.pageSize !== undefined ? Number(body.pageSize) : undefined,
                page: body.page !== undefined ? Number(body.page) : undefined,
                ...((rawOptions.stackExchangeOptions as object) || {}),
              }
            : undefined,
        gutenbergOptions:
          body.searchQuery ||
          body.topic ||
          body.bookId ||
          body.downloadText ||
          rawOptions.gutenbergOptions
            ? {
                searchQuery: body.searchQuery ? String(body.searchQuery) : undefined,
                topic: body.topic ? String(body.topic) : undefined,
                bookId: body.bookId !== undefined ? Number(body.bookId) : undefined,
                downloadText: Boolean(body.downloadText),
                maxBytes: body.maxBytes !== undefined ? Number(body.maxBytes) : undefined,
                ...((rawOptions.gutenbergOptions as object) || {}),
              }
            : undefined,
        europePmcOptions:
          body.query || body.openAccessOnly || rawOptions.europePmcOptions
            ? {
                query: body.query ? String(body.query) : undefined,
                openAccessOnly: Boolean(body.openAccessOnly),
                pageSize: body.pageSize !== undefined ? Number(body.pageSize) : undefined,
                cursorMark: body.cursorMark ? String(body.cursorMark) : undefined,
                ...((rawOptions.europePmcOptions as object) || {}),
              }
            : undefined,
        ietfRfcOptions:
          body.rfcNumber || body.query || rawOptions.ietfRfcOptions
            ? {
                rfcNumber: body.rfcNumber !== undefined ? Number(body.rfcNumber) : undefined,
                query: body.query ? String(body.query) : undefined,
                limit: body.limit !== undefined ? Number(body.limit) : undefined,
                ...((rawOptions.ietfRfcOptions as object) || {}),
              }
            : undefined,
        saglikEkutuphaneOptions:
          body.action ||
          body.category ||
          body.publicationId !== undefined ||
          body.downloadPdf !== undefined ||
          rawOptions.saglikEkutuphaneOptions
            ? {
                action: (body.action as "list" | "detail" | "extract") || undefined,
                category: (body.category as "all" | "books" | "journals" | "articles") || undefined,
                publicationId:
                  body.publicationId !== undefined ? Number(body.publicationId) : undefined,
                page: body.page !== undefined ? Number(body.page) : undefined,
                limit: body.limit !== undefined ? Number(body.limit) : undefined,
                downloadPdf: body.downloadPdf !== undefined ? Boolean(body.downloadPdf) : undefined,
                ...((rawOptions.saglikEkutuphaneOptions as object) || {}),
              }
            : undefined,
        ktbEkitapOptions:
          body.action ||
          body.category ||
          body.bookId !== undefined ||
          body.detailUrl ||
          body.downloadPdf !== undefined ||
          rawOptions.ktbEkitapOptions
            ? {
                action: (body.action as "list" | "detail" | "extract") || undefined,
                category:
                  (body.category as
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
                    | "son-eklenen") || undefined,
                bookId: body.bookId !== undefined ? Number(body.bookId) : undefined,
                detailUrl: body.detailUrl ? String(body.detailUrl) : undefined,
                page: body.page !== undefined ? Number(body.page) : undefined,
                limit: body.limit !== undefined ? Number(body.limit) : undefined,
                downloadPdf: body.downloadPdf !== undefined ? Boolean(body.downloadPdf) : undefined,
                ...((rawOptions.ktbEkitapOptions as object) || {}),
              }
            : undefined,
        apiOptions:
          (rawOptions.apiOptions as ApiExtractorTaskOptions) ||
          (rawOptions.apiExtractorOptions as ApiExtractorTaskOptions) ||
          undefined,
        networkInterceptorOptions:
          body.urlPatterns ||
          body.maxCapturedRequests !== undefined ||
          body.waitForNetworkIdleMs !== undefined ||
          body.captureHeaders !== undefined ||
          rawOptions.networkInterceptorOptions
            ? {
                urlPatterns: Array.isArray(body.urlPatterns)
                  ? (body.urlPatterns as string[])
                  : undefined,
                maxCapturedRequests:
                  body.maxCapturedRequests !== undefined
                    ? Number(body.maxCapturedRequests)
                    : undefined,
                waitForNetworkIdleMs:
                  body.waitForNetworkIdleMs !== undefined
                    ? Number(body.waitForNetworkIdleMs)
                    : undefined,
                captureHeaders:
                  body.captureHeaders !== undefined ? Boolean(body.captureHeaders) : undefined,
                ...((rawOptions.networkInterceptorOptions as object) || {}),
              }
            : undefined,
        proxy: (rawOptions.proxy as ProxyConfig) || undefined,
        headers:
          (rawOptions.headers as Record<string, string>) ||
          (rawOptions.customHeaders as Record<string, string>) ||
          undefined,
        storageState: (rawOptions.storageState as string | StoredSessionState) || undefined,
      },
    };

    globalRunRegistry.appendLog(run.runId, "INFO", `Hedef adres taranıyor: ${targetUrl}`);

    try {
      const result = await actor.run(task, { task, startTime: Date.now() });
      if (result.status === "completed") {
        let count = 1;
        if (result.data && typeof result.data === "object") {
          const d = result.data as Record<string, unknown>;
          if (Array.isArray(d.items)) count = d.items.length;
          else if (Array.isArray(d.urls)) count = d.urls.length;
          else if (Array.isArray(d.pages)) count = d.pages.length;
          else if (Array.isArray(d.papers)) count = d.papers.length;
          else if (Array.isArray(d.results)) count = d.results.length;
        }
        globalRunRegistry.completeRun(run.runId, result.data, count);
        sendJson(res, 200, { runId: run.runId, status: "succeeded", result });
      } else {
        const err = result.errorMessage || "Aktör çalıştırma hatası.";
        globalRunRegistry.failRun(run.runId, err);
        sendJson(res, 500, { runId: run.runId, status: "failed", error: err });
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      globalRunRegistry.failRun(run.runId, err);
      sendJson(res, 500, { runId: run.runId, status: "failed", error: err });
    }
  }

  // 4. GET /api/v1/store/runs
  handleListRuns(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const runs = globalRunRegistry.listRuns(100);
    sendJson(res, 200, { runs, total: runs.length });
  }

  // 5. GET /api/v1/store/runs/:runId
  handleGetRun(res: http.ServerResponse, runId: string): void {
    const run = globalRunRegistry.getRun(runId);
    if (!run) {
      sendJson(res, 404, { error: `Run '${runId}' bulunamadı.` });
      return;
    }
    sendJson(res, 200, { run });
  }

  // 6. GET /api/v1/store/runs/:runId/events (SSE)
  handleRunEventsSSE(res: http.ServerResponse, runId: string): void {
    const run = globalRunRegistry.getRun(runId);
    if (!run) {
      sendJson(res, 404, { error: `Run '${runId}' bulunamadı.` });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Mevcut logları hemen bas
    for (const log of run.logs) {
      res.write(`data: ${JSON.stringify({ type: "log", ...log })}\n\n`);
    }

    if (run.status === "succeeded" || run.status === "failed") {
      res.write(`data: ${JSON.stringify({ type: "done", status: run.status })}\n\n`);
      res.end();
      return;
    }

    // Canlı dinle
    const onLog = (logEntry: unknown) => {
      res.write(`data: ${JSON.stringify({ type: "log", ...(logEntry as object) })}\n\n`);
    };
    const onDone = (doneRecord: unknown) => {
      res.write(`data: ${JSON.stringify({ type: "done", ...(doneRecord as object) })}\n\n`);
      cleanup();
      res.end();
    };

    const cleanup = () => {
      globalRunRegistry.removeListener(`log:${runId}`, onLog);
      globalRunRegistry.removeListener(`done:${runId}`, onDone);
      clearInterval(pingInterval);
    };

    globalRunRegistry.on(`log:${runId}`, onLog);
    globalRunRegistry.on(`done:${runId}`, onDone);

    const pingInterval = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15000);

    res.on("close", cleanup);
  }

  // 7. GET /api/v1/store/quarantine
  handleGetQuarantine(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const quarantineDir = join(POOL_ROOT, "quarantine_vetoed");
    const items: unknown[] = [];

    if (existsSync(quarantineDir)) {
      try {
        const entries = readdirSync(quarantineDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const auditPath = join(quarantineDir, entry.name, "veto_audit.json");
            if (existsSync(auditPath)) {
              try {
                const audit = JSON.parse(readFileSync(auditPath, "utf8"));
                items.push(audit);
              } catch {
                // ignore corrupted audit
              }
            }
          }
        }
      } catch {
        // ignore read error
      }
    }

    sendJson(res, 200, {
      totalQuarantined: items.length,
      quarantinePath: quarantineDir,
      items: (items as Array<{ vetoed_at: string }>).sort(
        (a, b) => new Date(b.vetoed_at).getTime() - new Date(a.vetoed_at).getTime()
      ),
    });
  }

  // 8. GET /.well-known/mcp.json (Model Context Protocol Tool Registry)
  handleGetMcpCatalog(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const tools = Object.values(ACTOR_MANIFESTS).map((m) => m.mcpTool);
    sendJson(res, 200, {
      protocolVersion: "2024-11-05",
      server: {
        name: "protokol-7-mcp-server",
        version: "1.0.0",
        description: "Headless Web Scraping, PDF Distillation and Browser Automation Actor Suite.",
      },
      tools,
    });
  }

  // 9. Headless Service Information
  handleServiceInfo(_req: http.IncomingMessage, res: http.ServerResponse): void {
    sendJson(res, 200, {
      service: "protokol-7",
      version: "1.0.0",
      mode: "headless",
      status: "operational",
      endpoints: {
        health: "/health",
        docs: "/docs",
        openapi: "/openapi.json",
        actors: "/api/v1/store/actors",
        runs: "/api/v1/store/runs",
        mcp: "/.well-known/mcp.json",
      },
    });
  }

  handleServeWeb(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.handleServiceInfo(req, res);
  }
}
