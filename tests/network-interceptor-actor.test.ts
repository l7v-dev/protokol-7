import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { BrowserPool } from "@/browser-pool";
import { NetworkInterceptorActor } from "@/network-interceptor-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

test("NetworkInterceptorActor captures background fetch JSON responses", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/users") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          users: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
          ],
        })
      );
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>SPA Intercept Test</title></head>
        <body>
          <h1>App Loading</h1>
          <div id="content">Waiting...</div>
          <script>
            fetch('/api/users')
              .then(r => r.json())
              .then(data => {
                document.getElementById('content').innerText = 'Loaded ' + data.users.length;
              });
          </script>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/`;

  try {
    const actor = new NetworkInterceptorActor();
    const result = await actor.run(
      {
        taskId: "test-intercept-1",
        actorType: "network-interceptor",
        targetUrl,
        options: {
          networkInterceptorOptions: {
            waitForNetworkIdleMs: 500,
            captureHeaders: true,
          },
        },
      },
      {
        task: { taskId: "test-intercept-1", actorType: "network-interceptor", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.ok(result.data.totalCaptured >= 1);

    const userApi = result.data.responses.find((r) => r.url.includes("/api/users"));
    assert.ok(userApi, "Expected /api/users response to be intercepted");
    assert.equal(userApi.statusCode, 200);
    assert.equal(userApi.method, "GET");

    const payload = userApi.responseJson as { users: Array<{ id: number; name: string }> };
    assert.equal(payload.users.length, 2);
    assert.equal(payload.users[0].name, "Alice");
  } finally {
    await BrowserPool.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("NetworkInterceptorActor applies urlPatterns filter", async () => {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/v1/metrics") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ metric: "v1" }));
      return;
    }
    if (req.url === "/api/v2/metrics") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ metric: "v2" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <!DOCTYPE html>
      <html>
        <body>
          <script>
            fetch('/api/v1/metrics');
            fetch('/api/v2/metrics');
          </script>
        </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/`;

  try {
    const actor = new NetworkInterceptorActor();
    const result = await actor.run(
      {
        taskId: "test-intercept-filter",
        actorType: "network-interceptor",
        targetUrl,
        options: {
          networkInterceptorOptions: {
            urlPatterns: ["*api/v2*"],
            waitForNetworkIdleMs: 500,
          },
        },
      },
      {
        task: { taskId: "test-intercept-filter", actorType: "network-interceptor", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);

    const v1 = result.data.responses.find((r) => r.url.includes("/api/v1/metrics"));
    const v2 = result.data.responses.find((r) => r.url.includes("/api/v2/metrics"));

    assert.equal(v1, undefined, "v1 should have been filtered out");
    assert.ok(v2, "v2 should have matched pattern");
  } finally {
    await BrowserPool.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("NetworkInterceptorActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new NetworkInterceptorActor();
  const result = await actor.run(
    {
      taskId: "test-intercept-ssrf",
      actorType: "network-interceptor",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
    },
    {
      task: {
        taskId: "test-intercept-ssrf",
        actorType: "network-interceptor",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("SSRF validation failed"));
});
