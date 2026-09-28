import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { safeRedirectFetch } from "../src/network/safe-redirect-fetcher";

describe("safeRedirectFetch - SSRF Guarded HTTP Fetcher", () => {
  let server: http.Server;
  let serverUrl: string;

  before(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const pathname = url.pathname;

      if (pathname === "/final") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("final response payload");
        return;
      }

      if (pathname === "/redirect-1") {
        res.writeHead(302, { Location: "/final" });
        res.end();
        return;
      }

      if (pathname === "/redirect-chain") {
        res.writeHead(301, { Location: "/redirect-1" });
        res.end();
        return;
      }

      if (pathname === "/loop-a") {
        res.writeHead(302, { Location: "/loop-b" });
        res.end();
        return;
      }

      if (pathname === "/loop-b") {
        res.writeHead(302, { Location: "/loop-a" });
        res.end();
        return;
      }

      if (pathname === "/redirect-to-metadata") {
        res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" });
        res.end();
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("fetches normal endpoint directly without redirects", async () => {
    const res = await safeRedirectFetch(`${serverUrl}/final`, {
      allowLocalNetwork: true,
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, "final response payload");
  });

  it("follows single 302 redirect to final destination", async () => {
    const res = await safeRedirectFetch(`${serverUrl}/redirect-1`, {
      allowLocalNetwork: true,
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, "final response payload");
  });

  it("traverses multiple consecutive redirects", async () => {
    const res = await safeRedirectFetch(`${serverUrl}/redirect-chain`, {
      allowLocalNetwork: true,
      maxRedirects: 3,
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(text, "final response payload");
  });

  it("detects and terminates redirect loops", async () => {
    await assert.rejects(
      async () => {
        await safeRedirectFetch(`${serverUrl}/loop-a`, {
          allowLocalNetwork: true,
        });
      },
      {
        message: /Redirect loop detected/,
      }
    );
  });

  it("blocks redirect hop targeting private or cloud metadata IPs", async () => {
    await assert.rejects(
      async () => {
        await safeRedirectFetch(`${serverUrl}/redirect-to-metadata`, {
          allowLocalNetwork: true,
        });
      },
      {
        message: /SSRF validation failed/,
      }
    );
  });

  it("retries on transient HTTP 503 status code when retryOptions is provided", async () => {
    let callCount = 0;
    const retryServer = http.createServer((_req, res) => {
      callCount++;
      if (callCount === 1) {
        res.writeHead(503, { "Retry-After": "0" });
        res.end("Service Unavailable");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Recovered After Retry");
    });

    await new Promise<void>((resolve) => retryServer.listen(0, "127.0.0.1", () => resolve()));
    const port = (retryServer.address() as { port: number }).port;

    try {
      const res = await safeRedirectFetch(`http://127.0.0.1:${port}/flaky`, {
        allowLocalNetwork: true,
        retryOptions: {
          maxRetries: 2,
          initialDelayMs: 10,
        },
      });

      assert.equal(res.status, 200);
      const body = await res.text();
      assert.equal(body, "Recovered After Retry");
      assert.equal(callCount, 2);
    } finally {
      retryServer.close();
    }
  });

  it("strips authorization and cookie headers on cross-origin redirects", async () => {
    let secondServerReceivedHeaders: http.IncomingHttpHeaders = {};
    const secondServer = http.createServer((req, res) => {
      secondServerReceivedHeaders = req.headers;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => secondServer.listen(0, "127.0.0.1", () => resolve()));
    const secondPort = (secondServer.address() as { port: number }).port;

    let firstServerReceivedHeaders: http.IncomingHttpHeaders = {};
    const firstServer = http.createServer((req, res) => {
      firstServerReceivedHeaders = req.headers;
      res.writeHead(302, { Location: `http://127.0.0.1:${secondPort}/landing` });
      res.end();
    });
    await new Promise<void>((resolve) => firstServer.listen(0, "127.0.0.1", () => resolve()));
    const firstPort = (firstServer.address() as { port: number }).port;

    try {
      const res = await safeRedirectFetch(`http://127.0.0.1:${firstPort}/start`, {
        allowLocalNetwork: true,
        headers: {
          Authorization: "Bearer secret-token-123",
          Cookie: "session=xyz789",
          "X-Custom-Header": "preserved-value",
        },
      });

      assert.equal(res.status, 200);
      // First server got credentials
      assert.equal(firstServerReceivedHeaders.authorization, "Bearer secret-token-123");
      assert.equal(firstServerReceivedHeaders.cookie, "session=xyz789");

      // Cross-origin second server must NOT get credentials
      assert.equal(secondServerReceivedHeaders.authorization, undefined);
      assert.equal(secondServerReceivedHeaders.cookie, undefined);
      // Non-sensitive header preserved
      assert.equal(secondServerReceivedHeaders["x-custom-header"], "preserved-value");
    } finally {
      firstServer.close();
      secondServer.close();
    }
  });
});
