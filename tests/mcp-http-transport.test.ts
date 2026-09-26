import assert from "node:assert/strict";
import type http from "node:http";
import { describe, it } from "node:test";
import { globalRunRegistry } from "../src/core/run-registry";
import { verifyMcpToken } from "../src/mcp/auth-guard";
import { HttpMcpTransport } from "../src/mcp/http-transport";
import { ProtokolMcpServer } from "../src/mcp/protokol-mcp-server";
import { createServer } from "../src/server";

describe("MCP HTTP-SSE Transport (Phase 1)", () => {
  describe("Authentication Guard (verifyMcpToken)", () => {
    it("permits all requests when MCP_API_TOKEN is unset or empty", () => {
      const original = process.env.MCP_API_TOKEN;
      try {
        delete process.env.MCP_API_TOKEN;
        const mockReq = { headers: {} } as http.IncomingMessage;
        assert.equal(verifyMcpToken(mockReq), true);

        process.env.MCP_API_TOKEN = "";
        assert.equal(verifyMcpToken(mockReq), true);
      } finally {
        if (original !== undefined) {
          process.env.MCP_API_TOKEN = original;
        } else {
          delete process.env.MCP_API_TOKEN;
        }
      }
    });

    it("enforces Bearer token matching when MCP_API_TOKEN is set", () => {
      const original = process.env.MCP_API_TOKEN;
      try {
        process.env.MCP_API_TOKEN = "secret-token-12345";

        // Missing header
        const reqNoHeader = { headers: {} } as http.IncomingMessage;
        assert.equal(verifyMcpToken(reqNoHeader), false);

        // Invalid format
        const reqBasic = {
          headers: { authorization: "Basic dXNlcjpwYXNz" },
        } as http.IncomingMessage;
        assert.equal(verifyMcpToken(reqBasic), false);

        // Wrong token
        const reqWrongToken = {
          headers: { authorization: "Bearer wrong-token" },
        } as http.IncomingMessage;
        assert.equal(verifyMcpToken(reqWrongToken), false);

        // Correct token
        const reqValid = {
          headers: { authorization: "Bearer secret-token-12345" },
        } as http.IncomingMessage;
        assert.equal(verifyMcpToken(reqValid), true);

        // Case-insensitive Bearer prefix
        const reqValidCase = {
          headers: { authorization: "bearer secret-token-12345" },
        } as http.IncomingMessage;
        assert.equal(verifyMcpToken(reqValidCase), true);
      } finally {
        if (original !== undefined) {
          process.env.MCP_API_TOKEN = original;
        } else {
          delete process.env.MCP_API_TOKEN;
        }
      }
    });
  });

  describe("HttpMcpTransport Unit Engine", () => {
    it("rejects non-POST methods with 405 Method Not Allowed", async () => {
      const mcpServer = new ProtokolMcpServer();
      const transport = new HttpMcpTransport(mcpServer);

      let statusCode = 0;
      let responseBody = "";

      const mockReq = {
        method: "GET",
        headers: {},
      } as http.IncomingMessage;

      const mockRes = {
        writeHead(code: number) {
          statusCode = code;
        },
        end(data: string) {
          responseBody = data;
        },
      } as unknown as http.ServerResponse;

      await transport.handleRequest(mockReq, mockRes);
      assert.equal(statusCode, 405);
      const parsed = JSON.parse(responseBody);
      assert.equal(parsed.error.code, -32600);
      assert.ok(parsed.error.message.includes("Method Not Allowed"));
    });

    it("rejects payloads exceeding maxPayloadBytes with 413", async () => {
      const mcpServer = new ProtokolMcpServer();
      const transport = new HttpMcpTransport(mcpServer, { maxPayloadBytes: 20 });

      let statusCode = 0;
      let responseBody = "";

      const mockReq = {
        method: "POST",
        headers: {},
        on(event: string, handler: (chunk?: Buffer | Error) => void) {
          if (event === "data") {
            handler(Buffer.from("a".repeat(30)));
          }
          return this;
        },
        destroy() {},
      } as unknown as http.IncomingMessage;

      const mockRes = {
        writeHead(code: number) {
          statusCode = code;
        },
        end(data: string) {
          responseBody = data;
        },
      } as unknown as http.ServerResponse;

      await transport.handleRequest(mockReq, mockRes);
      assert.equal(statusCode, 413);
      const parsed = JSON.parse(responseBody);
      assert.ok(parsed.error.message.includes("Payload Too Large"));
    });

    it("rejects malformed JSON syntax with 400 and -32700 Parse error", async () => {
      const mcpServer = new ProtokolMcpServer();
      const transport = new HttpMcpTransport(mcpServer);

      let statusCode = 0;
      let responseBody = "";

      const mockReq = {
        method: "POST",
        headers: {},
        on(event: string, handler: (chunk?: Buffer) => void) {
          if (event === "data") {
            handler(Buffer.from("not-valid-json-string"));
          }
          if (event === "end") {
            handler();
          }
          return this;
        },
      } as unknown as http.IncomingMessage;

      const mockRes = {
        writeHead(code: number) {
          statusCode = code;
        },
        end(data: string) {
          responseBody = data;
        },
      } as unknown as http.ServerResponse;

      await transport.handleRequest(mockReq, mockRes);
      assert.equal(statusCode, 400);
      const parsed = JSON.parse(responseBody);
      assert.equal(parsed.error.code, -32700);
    });

    it("rejects non-conforming JSON-RPC request objects with -32600", async () => {
      const mcpServer = new ProtokolMcpServer();
      const transport = new HttpMcpTransport(mcpServer);

      let statusCode = 0;
      let responseBody = "";

      const mockReq = {
        method: "POST",
        headers: {},
        on(event: string, handler: (chunk?: Buffer) => void) {
          if (event === "data") {
            handler(Buffer.from(JSON.stringify({ notJsonRpc: true })));
          }
          if (event === "end") {
            handler();
          }
          return this;
        },
      } as unknown as http.IncomingMessage;

      const mockRes = {
        writeHead(code: number) {
          statusCode = code;
        },
        end(data: string) {
          responseBody = data;
        },
      } as unknown as http.ServerResponse;

      await transport.handleRequest(mockReq, mockRes);
      assert.equal(statusCode, 400);
      const parsed = JSON.parse(responseBody);
      assert.equal(parsed.error.code, -32600);
    });

    it("returns 204 No Content for notification requests", async () => {
      const mcpServer = new ProtokolMcpServer();
      const transport = new HttpMcpTransport(mcpServer);

      let statusCode = 0;

      const mockReq = {
        method: "POST",
        headers: {},
        on(event: string, handler: (chunk?: Buffer) => void) {
          if (event === "data") {
            handler(
              Buffer.from(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))
            );
          }
          if (event === "end") {
            handler();
          }
          return this;
        },
      } as unknown as http.IncomingMessage;

      const mockRes = {
        writeHead(code: number) {
          statusCode = code;
        },
        end() {},
      } as unknown as http.ServerResponse;

      await transport.handleRequest(mockReq, mockRes);
      assert.equal(statusCode, 204);
    });
  });

  describe("HTTP Server Integration (/mcp & /mcp/events)", () => {
    it("executes initialize handshake over POST /mcp", async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2024-11-05" },
          }),
        });

        assert.equal(res.status, 200);
        const data = (await res.json()) as {
          jsonrpc: string;
          id: number;
          result: {
            protocolVersion: string;
            serverInfo: { name: string; version: string };
            capabilities: { tools: Record<string, unknown> };
          };
        };

        assert.equal(data.jsonrpc, "2.0");
        assert.equal(data.id, 1);
        assert.equal(data.result.protocolVersion, "2024-11-05");
        assert.equal(data.result.serverInfo.name, "protokol-7-mcp");
        assert.ok(data.result.capabilities.tools);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("lists registered tools via POST /mcp tools/list", async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "list-req",
            method: "tools/list",
          }),
        });

        assert.equal(res.status, 200);
        const data = (await res.json()) as {
          result: {
            tools: Array<{ name: string; description: string }>;
          };
        };

        assert.ok(Array.isArray(data.result.tools));
        assert.ok(data.result.tools.length >= 18);
        assert.ok(data.result.tools.some((t) => t.name === "scrape_static_html"));
        assert.ok(data.result.tools.some((t) => t.name === "wikimedia_query"));
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("handles tools/call for unknown tool gracefully returning MCP tool error", async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "unknown-tool-call",
            method: "tools/call",
            params: {
              name: "non_existent_tool",
              arguments: {},
            },
          }),
        });

        assert.equal(res.status, 200);
        const data = (await res.json()) as {
          result: {
            isError: boolean;
            content: Array<{ text: string }>;
          };
        };

        assert.equal(data.result.isError, true);
        assert.ok(data.result.content[0].text.includes("Unknown tool"));
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("enforces authentication on POST /mcp when MCP_API_TOKEN is active", async () => {
      const original = process.env.MCP_API_TOKEN;
      process.env.MCP_API_TOKEN = "auth-guard-test-token";

      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      try {
        // Without Authorization header
        const resUnauthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "auth-test",
            method: "ping",
          }),
        });

        assert.equal(resUnauthorized.status, 401);
        const errJson = (await resUnauthorized.json()) as {
          error: { code: number; message: string };
        };
        assert.equal(errJson.error.code, -32000);
        assert.ok(errJson.error.message.includes("Unauthorized"));

        // With valid Authorization header
        const resAuthorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer auth-guard-test-token",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "auth-test-2",
            method: "ping",
          }),
        });

        assert.equal(resAuthorized.status, 200);
        const okJson = (await resAuthorized.json()) as {
          id: string;
          result: Record<string, unknown>;
        };
        assert.equal(okJson.id, "auth-test-2");
      } finally {
        if (original !== undefined) {
          process.env.MCP_API_TOKEN = original;
        } else {
          delete process.env.MCP_API_TOKEN;
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("returns 405 on GET /mcp", async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/mcp`);
        assert.equal(res.status, 405);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("connects to SSE stream on GET /mcp/events", async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      try {
        const controller = new AbortController();
        const res = await fetch(`http://127.0.0.1:${port}/mcp/events`, {
          signal: controller.signal,
        });

        assert.equal(res.status, 200);
        assert.ok(res.headers.get("content-type")?.includes("text/event-stream"));

        const reader = res.body?.getReader();
        assert.ok(reader);

        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        assert.ok(text.includes("event: connected"));
        assert.ok(text.includes("protocolVersion"));

        controller.abort();
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe("MCP Resources & SSE Events (Phase 2)", () => {
    it("lists available resources including quarantine and active runs", async () => {
      const server = new ProtokolMcpServer();
      const testRun = globalRunRegistry.createRun("cheerio-scraper", {
        url: "https://example.com",
      });

      const res = await server.processRequest({
        jsonrpc: "2.0",
        id: "res-list-test",
        method: "resources/list",
      });

      assert.ok(res);
      assert.equal(res.id, "res-list-test");
      const result = res.result as {
        resources: Array<{ uri: string; name: string; mimeType: string }>;
      };

      assert.ok(Array.isArray(result.resources));
      assert.ok(result.resources.some((r) => r.uri === "quarantine://items"));
      assert.ok(result.resources.some((r) => r.uri === `run://${testRun.runId}`));
    });

    it("reads run and quarantine resources via resources/read", async () => {
      const server = new ProtokolMcpServer();
      const testRun = globalRunRegistry.createRun("playwright-browser", {
        url: "https://test.local",
      });
      globalRunRegistry.appendLog(testRun.runId, "INFO", "Browser context created");

      // Read run resource
      const runRes = await server.processRequest({
        jsonrpc: "2.0",
        id: "read-run-test",
        method: "resources/read",
        params: { uri: `run://${testRun.runId}` },
      });

      assert.ok(runRes);
      assert.equal(runRes.id, "read-run-test");
      const runResult = runRes.result as {
        contents: Array<{ uri: string; mimeType: string; text: string }>;
      };
      assert.equal(runResult.contents[0].uri, `run://${testRun.runId}`);
      assert.equal(runResult.contents[0].mimeType, "application/json");
      assert.ok(runResult.contents[0].text.includes(testRun.runId));
      assert.ok(runResult.contents[0].text.includes("Browser context created"));

      // Read quarantine resource
      const quarRes = await server.processRequest({
        jsonrpc: "2.0",
        id: "read-quar-test",
        method: "resources/read",
        params: { uri: "quarantine://items" },
      });

      assert.ok(quarRes);
      const quarResult = quarRes.result as {
        contents: Array<{ uri: string; mimeType: string; text: string }>;
      };
      assert.equal(quarResult.contents[0].uri, "quarantine://items");
      assert.equal(quarResult.contents[0].mimeType, "application/json");
      assert.doesNotThrow(() => JSON.parse(quarResult.contents[0].text));
    });

    it("handles resources/read errors correctly", async () => {
      const server = new ProtokolMcpServer();

      // Missing uri
      const errMissing = await server.processRequest({
        jsonrpc: "2.0",
        id: "err-missing",
        method: "resources/read",
      });
      assert.ok(errMissing);
      assert.equal(errMissing.error?.code, -32602);

      // Unknown run
      const errNotFound = await server.processRequest({
        jsonrpc: "2.0",
        id: "err-notfound",
        method: "resources/read",
        params: { uri: "run://non_existent_run_99999" },
      });
      assert.ok(errNotFound);
      assert.equal(errNotFound.error?.code, -32002);

      // Unsupported scheme
      const errScheme = await server.processRequest({
        jsonrpc: "2.0",
        id: "err-scheme",
        method: "resources/read",
        params: { uri: "ftp://files/artifact.json" },
      });
      assert.ok(errScheme);
      assert.equal(errScheme.error?.code, -32002);
    });

    it("handles resources/subscribe and resources/unsubscribe as no-op success", async () => {
      const server = new ProtokolMcpServer();

      const subRes = await server.processRequest({
        jsonrpc: "2.0",
        id: "sub-test",
        method: "resources/subscribe",
        params: { uri: "run://run_123" },
      });
      assert.ok(subRes);
      assert.deepEqual(subRes.result, {});

      const unsubRes = await server.processRequest({
        jsonrpc: "2.0",
        id: "unsub-test",
        method: "resources/unsubscribe",
        params: { uri: "run://run_123" },
      });
      assert.ok(unsubRes);
      assert.deepEqual(unsubRes.result, {});
    });

    it("executes resources/list and resources/read through HTTP POST /mcp endpoint", async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      const httpRun = globalRunRegistry.createRun("arxiv", { id: "2401.00001" });

      try {
        // resources/list
        const listRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "http-res-list",
            method: "resources/list",
          }),
        });
        assert.equal(listRes.status, 200);
        const listData = (await listRes.json()) as {
          result: { resources: Array<{ uri: string }> };
        };
        assert.ok(listData.result.resources.some((r) => r.uri === `run://${httpRun.runId}`));

        // resources/read
        const readRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: "http-res-read",
            method: "resources/read",
            params: { uri: `run://${httpRun.runId}` },
          }),
        });
        assert.equal(readRes.status, 200);
        const readData = (await readRes.json()) as {
          result: { contents: Array<{ uri: string; text: string }> };
        };
        assert.equal(readData.result.contents[0].uri, `run://${httpRun.runId}`);
        assert.ok(readData.result.contents[0].text.includes("2401.00001"));
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("streams live run lifecycle and log events over GET /mcp/events?runId=<runId>", async () => {
      const server = createServer();
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const port = (server.address() as { port: number }).port;

      const liveRun = globalRunRegistry.createRun("wikimedia", { title: "Live Streaming" });

      try {
        const controller = new AbortController();
        const res = await fetch(`http://127.0.0.1:${port}/mcp/events?runId=${liveRun.runId}`, {
          signal: controller.signal,
        });

        assert.equal(res.status, 200);
        assert.ok(res.headers.get("content-type")?.includes("text/event-stream"));

        const reader = res.body?.getReader();
        assert.ok(reader);

        // Read initial connection & run-status
        const firstChunk = await reader.read();
        const firstText = new TextDecoder().decode(firstChunk.value);
        assert.ok(firstText.includes("event: connected"));
        assert.ok(firstText.includes("event: run-status"));

        // Trigger log and completion asynchronously
        setTimeout(() => {
          globalRunRegistry.appendLog(liveRun.runId, "INFO", "Live processing message stream");
          globalRunRegistry.completeRun(liveRun.runId, { title: "Done" }, 1);
        }, 20);

        // Read subsequent events
        let accumulated = "";
        while (!accumulated.includes("event: done")) {
          const chunk = await reader.read();
          if (chunk.done) break;
          accumulated += new TextDecoder().decode(chunk.value);
        }

        assert.ok(accumulated.includes("event: log"));
        assert.ok(accumulated.includes("Live processing message stream"));
        assert.ok(accumulated.includes("event: done"));

        controller.abort();
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
