/**
 * src/mcp/protokol-mcp-server.ts
 *
 * Protokol-7 Native Stdio Model Context Protocol (MCP) Server.
 * Exposes scraping, document distillation, and crawling actors
 * to AI agent clients (Claude Desktop, Cursor, Antigravity, Cline)
 * using standard JSON-RPC 2.0 over standard I/O (stdio).
 */

import readline from "node:readline";
import { ACTOR_MANIFESTS, type ActorManifest } from "../actors/actor-manifests";
import { ActorRegistry, createDefaultActorRegistry } from "../actors/actor-registry";
import type {
  ActorTask,
  ActorType,
  ApiExtractorTaskOptions,
  ArxivActorTaskOptions,
  EuropePmcActorTaskOptions,
  GutenbergActorTaskOptions,
  IetfRfcActorTaskOptions,
  KtbEkitapTaskOptions,
  NetworkInterceptorTaskOptions,
  OpenAlexActorTaskOptions,
  PdfDocumentTaskOptions,
  SaglikEkutuphaneTaskOptions,
  SerpSearchTaskOptions,
  StackExchangeActorTaskOptions,
  WikimediaActorTaskOptions,
} from "../core/types";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export class ProtokolMcpServer {
  private readonly registry: ActorRegistry;
  private readonly toolToManifestMap = new Map<string, ActorManifest>();
  private rl?: readline.Interface;

  constructor(registry?: ActorRegistry) {
    this.registry = registry || createDefaultActorRegistry();
    for (const manifest of Object.values(ACTOR_MANIFESTS)) {
      if (manifest.mcpTool?.name) {
        this.toolToManifestMap.set(manifest.mcpTool.name, manifest);
      }
    }
  }

  getTools() {
    return Array.from(this.toolToManifestMap.values()).map((m) => ({
      name: m.mcpTool.name,
      description: m.mcpTool.description,
      inputSchema: m.mcpTool.inputSchema,
    }));
  }

  async processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
    const { id, method, params } = request;

    switch (method) {
      case "initialize": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "protokol-7-mcp",
              version: "1.0.0",
            },
          },
        };
      }

      case "notifications/initialized": {
        return null;
      }

      case "ping": {
        return {
          jsonrpc: "2.0",
          id,
          result: {},
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: this.getTools(),
          },
        };
      }

      case "tools/call": {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments as Record<string, unknown>) || {};
        const manifest = this.toolToManifestMap.get(toolName);

        if (!manifest) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `[ERROR] Unknown tool: ${toolName}`,
                },
              ],
              isError: true,
            },
          };
        }

        const actor = this.registry.get(manifest.actorType as ActorType);
        if (!actor) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `[ERROR] No registered actor implementation for type: ${manifest.actorType}`,
                },
              ],
              isError: true,
            },
          };
        }

        const targetUrl =
          (toolArgs.targetUrl as string) ||
          (toolArgs.query as string) ||
          (toolArgs.searchQuery as string) ||
          "";

        const task: ActorTask = {
          taskId: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          actorType: manifest.actorType as ActorType,
          targetUrl,
          selectors: toolArgs.selectors as Record<string, string> | undefined,
          options: {
            ...toolArgs,
            arxivOptions:
              manifest.actorType === "arxiv"
                ? (toolArgs as unknown as ArxivActorTaskOptions)
                : undefined,
            serpOptions:
              manifest.actorType === "serp-search"
                ? (toolArgs as unknown as SerpSearchTaskOptions)
                : undefined,
            apiOptions:
              manifest.actorType === "api-extractor"
                ? (toolArgs as unknown as ApiExtractorTaskOptions)
                : undefined,
            pdfOptions:
              manifest.actorType === "pdf-document"
                ? (toolArgs as unknown as PdfDocumentTaskOptions)
                : undefined,
            wikimediaOptions:
              manifest.actorType === "wikimedia"
                ? (toolArgs as unknown as WikimediaActorTaskOptions)
                : undefined,
            openalexOptions:
              manifest.actorType === "openalex"
                ? (toolArgs as unknown as OpenAlexActorTaskOptions)
                : undefined,
            stackExchangeOptions:
              manifest.actorType === "stack-exchange"
                ? (toolArgs as unknown as StackExchangeActorTaskOptions)
                : undefined,
            gutenbergOptions:
              manifest.actorType === "gutenberg"
                ? (toolArgs as unknown as GutenbergActorTaskOptions)
                : undefined,
            europePmcOptions:
              manifest.actorType === "europe-pmc"
                ? (toolArgs as unknown as EuropePmcActorTaskOptions)
                : undefined,
            ietfRfcOptions:
              manifest.actorType === "ietf-rfc"
                ? (toolArgs as unknown as IetfRfcActorTaskOptions)
                : undefined,
            saglikEkutuphaneOptions:
              manifest.actorType === "saglik-ekutuphane"
                ? (toolArgs as unknown as SaglikEkutuphaneTaskOptions)
                : undefined,
            ktbEkitapOptions:
              manifest.actorType === "ktb-ekitap"
                ? (toolArgs as unknown as KtbEkitapTaskOptions)
                : undefined,
            networkInterceptorOptions:
              manifest.actorType === "network-interceptor"
                ? (toolArgs as unknown as NetworkInterceptorTaskOptions)
                : undefined,
          },
        };

        try {
          const runResult = await actor.run(task, { task, startTime: Date.now() });
          if (runResult.status !== "completed") {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `[ERROR] Actor execution failed: ${runResult.errorMessage || "Unknown execution error"}`,
                  },
                ],
                isError: true,
              },
            };
          }

          const outputText =
            typeof runResult.data === "string"
              ? runResult.data
              : JSON.stringify(runResult.data, null, 2);

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: outputText,
                },
              ],
              isError: false,
            },
          };
        } catch (execErr) {
          const errorMsg = execErr instanceof Error ? execErr.message : String(execErr);
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: `[ERROR] Unexpected error during actor execution: ${errorMsg}`,
                },
              ],
              isError: true,
            },
          };
        }
      }

      default: {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
      }
    }
  }

  start(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout
  ) {
    this.rl = readline.createInterface({
      input,
      output,
      terminal: false,
    });

    this.rl.on("line", async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parsed: JsonRpcRequest;
      try {
        parsed = JSON.parse(trimmed);
      } catch (_parseErr) {
        output.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32700,
              message: "Parse error: Invalid JSON payload",
            },
          })}\n`
        );
        return;
      }

      const response = await this.processRequest(parsed);
      if (response !== null) {
        output.write(`${JSON.stringify(response)}\n`);
      }
    });

    return this;
  }

  close() {
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
  }
}

// Direct execution entrypoint
const isMainModule =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith("/protokol-mcp-server.ts") ||
    process.argv[1].endsWith("/protokol-mcp-server.js"));

if (isMainModule) {
  const server = new ProtokolMcpServer();
  server.start();
}
