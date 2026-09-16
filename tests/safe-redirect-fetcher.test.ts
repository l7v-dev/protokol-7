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
});
