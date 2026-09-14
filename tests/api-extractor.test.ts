import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import { ApiExtractorActor } from "@/api-extractor-actor";

describe("ApiExtractorActor - REST API Extraction Engine", () => {
  it("executes basic GET request and parses JSON data", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", version: "1.0.0" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const testUrl = `http://127.0.0.1:${address.port}/api/status`;

    try {
      const actor = new ApiExtractorActor();
      const result = await actor.run(
        {
          taskId: "api-test-1",
          actorType: "api-extractor",
          targetUrl: testUrl,
        },
        {
          task: { taskId: "api-test-1", actorType: "api-extractor", targetUrl: testUrl },
          startTime: Date.now(),
        }
      );

      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.deepEqual(result.data?.data, { status: "ok", version: "1.0.0" });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("injects Bearer token and custom query parameters", async () => {
    let receivedAuth: string | undefined;
    let receivedQueryParam: string | null = null;

    const server = http.createServer((req, res) => {
      receivedAuth = req.headers.authorization;
      const url = new URL(req.url!, "http://localhost");
      receivedQueryParam = url.searchParams.get("filter");

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const testUrl = `http://127.0.0.1:${address.port}/api/data`;

    try {
      const actor = new ApiExtractorActor();
      const result = await actor.run(
        {
          taskId: "api-test-2",
          actorType: "api-extractor",
          targetUrl: testUrl,
          options: {
            apiOptions: {
              bearerToken: "secret-token-xyz",
              queryParams: { filter: "active" },
            },
          },
        },
        {
          task: { taskId: "api-test-2", actorType: "api-extractor", targetUrl: testUrl },
          startTime: Date.now(),
        }
      );

      assert.equal(result.status, "completed");
      assert.equal(receivedAuth, "Bearer secret-token-xyz");
      assert.equal(receivedQueryParam, "active");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("handles multi-page pagination and accumulates array items", async () => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, "http://localhost");
      const page = parseInt(url.searchParams.get("page") || "1", 10);

      const pageData: Record<number, Array<{ id: number; name: string }>> = {
        1: [
          { id: 1, name: "Item 1" },
          { id: 2, name: "Item 2" },
        ],
        2: [
          { id: 3, name: "Item 3" },
          { id: 4, name: "Item 4" },
        ],
        3: [],
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ items: pageData[page] || [] }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const testUrl = `http://127.0.0.1:${address.port}/api/items`;

    try {
      const actor = new ApiExtractorActor();
      const result = await actor.run(
        {
          taskId: "api-test-3",
          actorType: "api-extractor",
          targetUrl: testUrl,
          options: {
            apiOptions: {
              pagination: {
                type: "page",
                pageParam: "page",
                limitParam: "limit",
                pageSize: 2,
                maxPages: 3,
              },
            },
          },
        },
        {
          task: { taskId: "api-test-3", actorType: "api-extractor", targetUrl: testUrl },
          startTime: Date.now(),
        }
      );

      assert.equal(result.status, "completed");
      assert.equal(result.data?.itemCount, 4);
      assert.deepEqual(result.data?.data, [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
        { id: 4, name: "Item 4" },
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("applies projection keys to filter object properties", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify([
          { id: 101, name: "Alpha", secretKey: "hidden", metadata: { score: 99 } },
          { id: 102, name: "Beta", secretKey: "hidden", metadata: { score: 88 } },
        ])
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const testUrl = `http://127.0.0.1:${address.port}/api/users`;

    try {
      const actor = new ApiExtractorActor();
      const result = await actor.run(
        {
          taskId: "api-test-4",
          actorType: "api-extractor",
          targetUrl: testUrl,
          options: {
            apiOptions: {
              projectionKeys: ["id", "name"],
            },
          },
        },
        {
          task: { taskId: "api-test-4", actorType: "api-extractor", targetUrl: testUrl },
          startTime: Date.now(),
        }
      );

      assert.equal(result.status, "completed");
      assert.deepEqual(result.data?.data, [
        { id: 101, name: "Alpha" },
        { id: 102, name: "Beta" },
      ]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
