/**
 * Test Suite: Declarative Pipeline REST API and MCP Tool Endpoints.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { createServer } from "../src/core/server";
import { ProtokolMcpServer } from "../src/mcp/protokol-mcp-server";

describe("Pipeline REST API & MCP Integration", () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    server = createServer();
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("POST /api/v1/pipelines/run executes a valid YAML pipeline synchronously", async () => {
    const yaml = `
name: api-test-corpus
version: 1
actor:
  id: cheerio-scraper
  config:
    targetUrl: "https://example.com"
output:
  format: jsonl
storage:
  backend: local
`;

    const res = await fetch(`${baseUrl}/api/v1/pipelines/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      success: boolean;
      result: { status: string; pipelineName: string };
    };
    assert.equal(data.success, true);
    assert.equal(data.result.status, "succeeded");
    assert.equal(data.result.pipelineName, "api-test-corpus");
  });

  it("POST /api/v1/pipelines/run rejects empty payload with 400", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pipelines/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "INVALID_PIPELINE_PAYLOAD");
  });

  it("POST /api/v1/pipelines/run blocks path traversal attempts with 403", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pipelines/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: "../../etc/shadow" }),
    });

    assert.equal(res.status, 403);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "PATH_TRAVERSAL_DETECTED");
  });

  it("POST /api/v1/pipelines/run returns 404 for missing template file", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pipelines/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePath: "examples/pipelines/non-existent-template.yaml" }),
    });

    assert.equal(res.status, 404);
    const data = (await res.json()) as { success: boolean; code: string };
    assert.equal(data.success, false);
    assert.equal(data.code, "PIPELINE_FILE_NOT_FOUND");
  });

  it("POST /api/v1/pipelines/run accepts async=true and returns 202 Accepted", async () => {
    const yaml = `
name: async-pipeline-test
version: 1
actor:
  id: cheerio-scraper
  config:
    targetUrl: "https://example.com"
`;

    const res = await fetch(`${baseUrl}/api/v1/pipelines/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml, async: true }),
    });

    assert.equal(res.status, 202);
    const data = (await res.json()) as { success: boolean; runId: string; status: string };
    assert.equal(data.success, true);
    assert.equal(data.status, "pending");
    assert.ok(data.runId);
  });

  it("GET /api/v1/pipelines/templates returns pre-configured YAML pipeline templates", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pipelines/templates`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as {
      success: boolean;
      templates: Array<{ name: string; path: string }>;
    };
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.templates));
    assert.ok(data.templates.length > 0);
    assert.ok(data.templates.some((t) => t.path.includes("corpus-parquet-sample.yaml")));
  });

  it("GET /api/v1/pipelines/runs lists recent execution history", async () => {
    const res = await fetch(`${baseUrl}/api/v1/pipelines/runs`);
    assert.equal(res.status, 200);

    const data = (await res.json()) as { success: boolean; runs: unknown[]; total: number };
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.runs));
    assert.ok(data.total >= 1);
  });

  it("MCP ProtokolMcpServer exposes run_pipeline and list_pipelines tools", () => {
    const mcp = new ProtokolMcpServer();
    const tools = mcp.getTools();

    const runTool = tools.find((t) => t.name === "run_pipeline");
    const listTool = tools.find((t) => t.name === "list_pipelines");

    assert.ok(runTool, "run_pipeline tool must be registered in MCP server");
    assert.ok(listTool, "list_pipelines tool must be registered in MCP server");
    const schemaProps = (runTool.inputSchema as { properties: Record<string, unknown> }).properties;
    assert.ok(schemaProps.yaml);
    assert.ok(schemaProps.filePath);
  });

  it("MCP ProtokolMcpServer executes list_pipelines via tools/call", async () => {
    const mcp = new ProtokolMcpServer();
    const response = await mcp.processRequest({
      jsonrpc: "2.0",
      id: "test-list-1",
      method: "tools/call",
      params: {
        name: "list_pipelines",
        arguments: { limit: 5 },
      },
    });

    assert.ok(response);
    assert.equal(response.id, "test-list-1");
    const result = response.result as { content: Array<{ type: string; text: string }> };
    assert.ok(result.content.length > 0);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed.templates));
  });

  it("MCP ProtokolMcpServer executes run_pipeline via tools/call", async () => {
    const mcp = new ProtokolMcpServer();
    const yaml = `
name: mcp-test-pipeline
version: 1
actor:
  id: cheerio-scraper
  config:
    targetUrl: "https://example.com"
output:
  format: jsonl
storage:
  backend: local
`;

    const response = await mcp.processRequest({
      jsonrpc: "2.0",
      id: "test-run-1",
      method: "tools/call",
      params: {
        name: "run_pipeline",
        arguments: { yaml },
      },
    });

    assert.ok(response);
    assert.equal(response.id, "test-run-1");
    const result = response.result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    assert.equal(result.isError, false);
    const runResult = JSON.parse(result.content[0].text);
    assert.equal(runResult.status, "succeeded");
    assert.equal(runResult.pipelineName, "mcp-test-pipeline");
  });
});
