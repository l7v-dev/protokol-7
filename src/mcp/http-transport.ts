/**
 * src/mcp/http-transport.ts
 *
 * HTTP Transport Adapter for Protokol-7 Model Context Protocol (MCP) Server.
 * Exposes JSON-RPC 2.0 MCP interface over HTTP POST /mcp and Server-Sent Events GET /mcp/events.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { globalRunRegistry } from "../core/run-registry";
import { verifyMcpToken } from "./auth-guard";
import type { JsonRpcRequest, JsonRpcResponse, ProtokolMcpServer } from "./protokol-mcp-server";

const DEFAULT_MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface HttpMcpTransportOptions {
  maxPayloadBytes?: number;
}

export class HttpMcpTransport {
  private readonly server: ProtokolMcpServer;
  private readonly maxPayloadBytes: number;

  constructor(server: ProtokolMcpServer, options?: HttpMcpTransportOptions) {
    this.server = server;
    this.maxPayloadBytes = options?.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES;
  }

  /**
   * Handles incoming JSON-RPC 2.0 requests over HTTP POST /mcp.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      this.sendJsonRpc(res, 405, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Method Not Allowed: MCP HTTP endpoint accepts only POST requests.",
        },
      });
      return;
    }

    if (!verifyMcpToken(req)) {
      this.sendJsonRpc(res, 401, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: "Unauthorized: Invalid or missing Bearer token in Authorization header.",
        },
      });
      return;
    }

    let rawBody: string;
    try {
      rawBody = await this.readRequestBody(req);
    } catch (readErr) {
      const isTooLarge = readErr instanceof Error && readErr.message === "PAYLOAD_TOO_LARGE";
      this.sendJsonRpc(res, isTooLarge ? 413 : 400, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: isTooLarge ? -32000 : -32700,
          message: isTooLarge
            ? "Payload Too Large: Request exceeds maximum allowed size."
            : "Parse error: Failed to read request body.",
        },
      });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch (_parseErr) {
      this.sendJsonRpc(res, 400, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error: Invalid JSON syntax in request body.",
        },
      });
      return;
    }

    if (!this.isValidJsonRpcRequest(parsed)) {
      const reqId =
        typeof (parsed as Record<string, unknown>)?.id === "string" ||
        typeof (parsed as Record<string, unknown>)?.id === "number"
          ? ((parsed as Record<string, unknown>).id as string | number)
          : null;

      this.sendJsonRpc(res, 400, {
        jsonrpc: "2.0",
        id: reqId,
        error: {
          code: -32600,
          message: "Invalid Request: 'jsonrpc' must be '2.0' and 'method' must be a valid string.",
        },
      });
      return;
    }

    try {
      const response = await this.server.processRequest(parsed);
      if (response === null) {
        // Notification handled without response
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
        });
        res.end();
        return;
      }

      this.sendJsonRpc(res, 200, response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendJsonRpc(res, 500, {
        jsonrpc: "2.0",
        id: parsed.id ?? null,
        error: {
          code: -32603,
          message: `Internal error: ${msg}`,
        },
      });
    }
  }

  /**
   * Handles Server-Sent Events (SSE) stream over GET /mcp/events (Phase 2).
   * Supports filtering by runId via query parameter '?runId=<runId>'.
   */
  handleEvents(req: IncomingMessage, res: ServerResponse): void {
    if (!verifyMcpToken(req)) {
      this.sendJsonRpc(res, 401, {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: "Unauthorized: Invalid or missing Bearer token in Authorization header.",
        },
      });
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const targetRunId = parsedUrl.searchParams.get("runId");

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    res.write('event: connected\ndata: {"status":"connected","protocolVersion":"2024-11-05"}\n\n');

    let onLog: ((logEntry: unknown) => void) | undefined;
    let onStatus: ((status: unknown) => void) | undefined;
    let onDone: ((doneRun: unknown) => void) | undefined;
    let onCreated: ((createdRun: unknown) => void) | undefined;

    if (targetRunId) {
      const existingRun = globalRunRegistry.getRun(targetRunId);
      if (existingRun) {
        res.write(`event: run-status\ndata: ${JSON.stringify(existingRun)}\n\n`);
      }

      onLog = (logEntry: unknown) => {
        res.write(`event: log\ndata: ${JSON.stringify(logEntry)}\n\n`);
      };
      onStatus = (status: unknown) => {
        res.write(`event: status\ndata: ${JSON.stringify({ runId: targetRunId, status })}\n\n`);
      };
      onDone = (doneRun: unknown) => {
        res.write(`event: done\ndata: ${JSON.stringify(doneRun)}\n\n`);
      };

      globalRunRegistry.on(`log:${targetRunId}`, onLog);
      globalRunRegistry.on(`status:${targetRunId}`, onStatus);
      globalRunRegistry.on(`done:${targetRunId}`, onDone);
    } else {
      onCreated = (createdRun: unknown) => {
        res.write(`event: run-created\ndata: ${JSON.stringify(createdRun)}\n\n`);
      };
      globalRunRegistry.on("created", onCreated);
    }

    const pingTimer = setInterval(() => {
      res.write(": ping\n\n");
    }, 15000);

    res.on("close", () => {
      clearInterval(pingTimer);
      if (targetRunId) {
        if (onLog) globalRunRegistry.removeListener(`log:${targetRunId}`, onLog);
        if (onStatus) globalRunRegistry.removeListener(`status:${targetRunId}`, onStatus);
        if (onDone) globalRunRegistry.removeListener(`done:${targetRunId}`, onDone);
      } else if (onCreated) {
        globalRunRegistry.removeListener("created", onCreated);
      }
    });
  }

  private readRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      req.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > this.maxPayloadBytes) {
          req.destroy();
          reject(new Error("PAYLOAD_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });

      req.on("error", (err) => {
        reject(err);
      });
    });
  }

  private isValidJsonRpcRequest(val: unknown): val is JsonRpcRequest {
    if (typeof val !== "object" || val === null || Array.isArray(val)) {
      return false;
    }
    const candidate = val as Record<string, unknown>;
    if (candidate.jsonrpc !== "2.0") {
      return false;
    }
    if (typeof candidate.method !== "string" || candidate.method.trim().length === 0) {
      return false;
    }
    return true;
  }

  private sendJsonRpc(res: ServerResponse, statusCode: number, payload: JsonRpcResponse): void {
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end(JSON.stringify(payload));
  }
}
