/**
 * Protokol-7 Standalone HTTP REST & Automation Server.
 * Exposes scraping, crawling, and interactive browser actions via HTTP endpoints.
 */

import http from "node:http";
import { createDefaultActorRegistry } from "./actor-registry";
import { BrowserPool } from "./browser-pool";
import { InteractiveBrowserController } from "./interactive-browser-controller";
import { ActorTask, ActorType } from "./types";

const registry = createDefaultActorRegistry();
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
          sendJson(res, 400, { error: "Missing required 'actorType' or 'targetUrl' parameter." });
          return;
        }
        const actor = registry.get(body.actorType);
        if (!actor) {
          sendJson(res, 404, { error: `Actor '${body.actorType}' not found.` });
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
          sendJson(res, 400, { error: "Missing required 'targetUrl' parameter." });
          return;
        }

        const actorType: ActorType =
          body.actorType || (body.renderJavaScript ? "playwright-browser" : "cheerio-scraper");
        const actor = registry.get(actorType);
        if (!actor) {
          sendJson(res, 400, { error: `Actor '${actorType}' not registered.` });
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
          sendJson(res, 400, { error: "Missing required 'targetUrl' parameter." });
          return;
        }

        const crawler = registry.get("crawler");
        if (!crawler) {
          sendJson(res, 500, { error: "Crawler actor is not available." });
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
          sendJson(res, 400, { error: "Missing required 'targetUrl' parameter." });
          return;
        }

        const sitemapActor = registry.get("sitemap-xml");
        if (!sitemapActor) {
          sendJson(res, 500, { error: "Sitemap actor is not available." });
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
          sendJson(res, 400, { error: "Missing required 'targetUrl' parameter." });
          return;
        }

        const readerActor = registry.get("markdown-reader");
        if (!readerActor) {
          sendJson(res, 500, { error: "Markdown reader actor is not available." });
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
          sendJson(res, 400, { error: "Missing required 'sessionId' or 'action' parameter." });
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

      // 404 Catch-all
      sendJson(res, 404, {
        error: "Route not found",
        path: pathname,
        method,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isPayloadTooLarge = message.includes("Payload too large");
      sendJson(res, isPayloadTooLarge ? 413 : 500, {
        error: isPayloadTooLarge ? "Payload too large" : "Internal server error",
        details: message,
      });
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(
      `[protokol-7] Web Scraping & Browser Automation Service listening on http://${HOST}:${PORT}`
    );
  });
}
