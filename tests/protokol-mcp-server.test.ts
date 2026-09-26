import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { ActorRegistry } from "../src/actors/actor-registry";
import type { IActor } from "../src/core/types";
import { ProtokolMcpServer } from "../src/mcp/protokol-mcp-server";

describe("ProtokolMcpServer - Native Stdio Model Context Protocol Engine", () => {
  it("handles initialize handshake returning MCP protocolVersion and serverInfo", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });

    assert.ok(res);
    assert.equal(res.id, 1);
    assert.equal(res.jsonrpc, "2.0");
    const result = res.result as {
      protocolVersion: string;
      capabilities: { tools: Record<string, unknown> };
      serverInfo: { name: string; version: string };
    };
    assert.equal(result.protocolVersion, "2024-11-05");
    assert.equal(result.serverInfo.name, "protokol-7-mcp");
    assert.ok(result.capabilities.tools);
  });

  it("returns null for notifications/initialized", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    assert.equal(res, null);
  });

  it("handles ping request", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: 42,
      method: "ping",
    });

    assert.ok(res);
    assert.equal(res.id, 42);
    assert.deepEqual(res.result, {});
  });

  it("returns all 18 registered extraction tools in tools/list", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "test-tools-list",
      method: "tools/list",
    });

    assert.ok(res);
    assert.equal(res.id, "test-tools-list");
    const result = res.result as {
      tools: Array<{ name: string; description: string; inputSchema: unknown }>;
    };
    assert.ok(Array.isArray(result.tools));
    assert.equal(result.tools.length, 18);

    const toolNames = result.tools.map((t) => t.name);
    assert.ok(toolNames.includes("scrape_static_html"));
    assert.ok(toolNames.includes("scrape_dynamic_browser"));
    assert.ok(toolNames.includes("distill_web_to_markdown"));
    assert.ok(toolNames.includes("arxiv_query"));
    assert.ok(toolNames.includes("extract_pdf_text"));
    assert.ok(toolNames.includes("extract_serp_results"));
    assert.ok(toolNames.includes("harvest_sitemap_urls"));
    assert.ok(toolNames.includes("crawl_website_graph"));
    assert.ok(toolNames.includes("extract_rest_api"));
    assert.ok(toolNames.includes("saglik_ekutuphane"));
    assert.ok(toolNames.includes("wikimedia_query"));
    assert.ok(toolNames.includes("openalex_query"));
    assert.ok(toolNames.includes("stack_exchange_query"));
    assert.ok(toolNames.includes("gutenberg_query"));
    assert.ok(toolNames.includes("europe_pmc_query"));
    assert.ok(toolNames.includes("ietf_rfc_query"));
    assert.ok(toolNames.includes("ktb_ekitap"));
  });

  it("returns isError for unknown tool invocation in tools/call", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "err-call",
      method: "tools/call",
      params: {
        name: "non_existent_tool",
        arguments: {},
      },
    });

    assert.ok(res);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown tool/);
  });

  it("executes registered actor through tools/call successfully", async () => {
    const mockRegistry = new ActorRegistry();
    const mockActor: IActor<{ message: string }> = {
      actorType: "cheerio-scraper",
      description: "Mock Cheerio Actor",
      run: async (task) => ({
        taskId: task.taskId,
        actorType: task.actorType,
        status: "completed",
        data: { message: "Mock scraping result" },
        executionDurationMs: 1,
      }),
    };
    mockRegistry.register(mockActor as unknown as IActor<unknown>);

    const server = new ProtokolMcpServer(mockRegistry);
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/call",
      params: {
        name: "scrape_static_html",
        arguments: { targetUrl: "https://example.com" },
      },
    });

    assert.ok(res);
    assert.equal(res.id, 99);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    assert.equal(result.isError, false);
    assert.match(result.content[0].text, /Mock scraping result/);
  });

  it("handles actor execution failure in tools/call gracefully", async () => {
    const mockRegistry = new ActorRegistry();
    const failingActor: IActor<unknown> = {
      actorType: "cheerio-scraper",
      description: "Failing Actor",
      run: async (task) => ({
        taskId: task.taskId,
        actorType: task.actorType,
        status: "failed",
        errorMessage: "Target host refused connection",
        executionDurationMs: 1,
      }),
    };
    mockRegistry.register(failingActor);

    const server = new ProtokolMcpServer(mockRegistry);
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "fail-test",
      method: "tools/call",
      params: {
        name: "scrape_static_html",
        arguments: { targetUrl: "https://invalid-host.local" },
      },
    });

    assert.ok(res);
    const result = res.result as {
      content: Array<{ type: string; text: string }>;
      isError: boolean;
    };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Target host refused connection/);
  });

  it("returns -32601 error for unknown methods", async () => {
    const server = new ProtokolMcpServer();
    const res = await server.processRequest({
      jsonrpc: "2.0",
      id: "unknown-method-test",
      method: "some/invalid/method",
    });

    assert.ok(res);
    assert.ok(res.error);
    assert.equal(res.error.code, -32601);
  });

  it("processes newline-delimited stream messages via start()", async () => {
    const server = new ProtokolMcpServer();
    const input = new PassThrough();
    const output = new PassThrough();

    server.start(input, output);

    const responsePromise = new Promise<string>((resolve) => {
      output.once("data", (chunk: Buffer) => {
        resolve(chunk.toString("utf8"));
      });
    });

    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: "stream-1", method: "ping" })}\n`);

    const raw = await responsePromise;
    const parsed = JSON.parse(raw.trim());
    assert.equal(parsed.id, "stream-1");
    assert.deepEqual(parsed.result, {});

    server.close();
  });

  it("forwards specialized actor options to task.options in tools/call", async () => {
    let capturedTask: unknown;
    const mockRegistry = new ActorRegistry();
    const mockGutenberg: IActor<unknown> = {
      actorType: "gutenberg",
      description: "Mock Gutenberg Actor",
      run: async (task) => {
        capturedTask = task;
        return {
          taskId: task.taskId,
          actorType: task.actorType,
          status: "completed",
          data: { success: true },
          executionDurationMs: 1,
        };
      },
    };
    mockRegistry.register(mockGutenberg);

    const server = new ProtokolMcpServer(mockRegistry);
    await server.processRequest({
      jsonrpc: "2.0",
      id: "options-test",
      method: "tools/call",
      params: {
        name: "gutenberg_query",
        arguments: {
          searchQuery: "Nietzsche",
          topic: "philosophy",
          downloadText: true,
        },
      },
    });

    assert.ok(capturedTask);
    const typedTask = capturedTask as {
      options?: {
        gutenbergOptions?: {
          searchQuery?: string;
          topic?: string;
          downloadText?: boolean;
        };
      };
    };
    assert.ok(typedTask.options?.gutenbergOptions);
    assert.equal(typedTask.options.gutenbergOptions.searchQuery, "Nietzsche");
    assert.equal(typedTask.options.gutenbergOptions.topic, "philosophy");
    assert.equal(typedTask.options.gutenbergOptions.downloadText, true);
  });
});
