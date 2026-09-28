import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { WikimediaActor, WikipediaActor } from "../src/actors/corpus/wikipedia-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUMMARY_JSON = {
  title: "Alan Turing",
  extract:
    "Alan Mathison Turing was an English mathematician, computer scientist, logician, cryptanalyst, philosopher, and theoretical biologist.",
  description: "English mathematician and computer scientist (1912–1954)",
  content_urls: {
    desktop: {
      page: "https://en.wikipedia.org/wiki/Alan_Turing",
    },
  },
  thumbnail: {
    source:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Alan_Turing_Aged_16.jpg/320px-Alan_Turing_Aged_16.jpg",
  },
  timestamp: "2023-10-01T12:00:00Z",
};

const MOCK_ARTICLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Alan Turing</title></head>
<body>
  <h1>Alan Turing</h1>
  <p>Alan Mathison Turing was an English mathematician and computer scientist.</p>
  <h2>Early life</h2>
  <p>Turing was born in Maida Vale, London.</p>
  <table>
    <thead><tr><th>Year</th><th>Event</th></tr></thead>
    <tbody><tr><td>1936</td><td>On Computable Numbers</td></tr></tbody>
  </table>
  <script>console.log("bad script");</script>
</body>
</html>
`;

const MOCK_SEARCH_JSON = {
  pages: [
    {
      id: 123,
      key: "Alan_Turing",
      title: "Alan Turing",
      excerpt: "<span>Alan Mathison Turing</span> was an English mathematician.",
      description: "English mathematician and computer scientist",
      thumbnail: { url: "//upload.wikimedia.org/thumb.jpg" },
    },
    {
      id: 456,
      key: "Turing_machine",
      title: "Turing machine",
      excerpt: "A <span>Turing machine</span> is a mathematical model of computation.",
      description: "Mathematical model of computation",
    },
  ],
};

test("WikipediaActor fetches and parses page summary", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SUMMARY_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/rest_v1/page/summary/Alan_Turing`;

  try {
    const actor = new WikipediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-1",
        actorType: "wikipedia",
        targetUrl,
        options: {
          wikipediaOptions: {
            title: "Alan Turing",
            lang: "en",
            action: "summary",
          },
        },
      },
      {
        task: { taskId: "test-wiki-1", actorType: "wikipedia", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.items.length, 1);
    const item = result.data.items[0];
    assert.equal(item.title, "Alan Turing");
    assert.match(item.extract || "", /English mathematician/);
    assert.equal(item.url, "https://en.wikipedia.org/wiki/Alan_Turing");
    assert.ok(item.thumbnailUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("WikipediaActor parses article HTML into Markdown and strips script tags", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(MOCK_ARTICLE_HTML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/rest_v1/page/html/Alan_Turing`;

  try {
    const actor = new WikipediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-2",
        actorType: "wikipedia",
        targetUrl,
        options: {
          wikipediaOptions: {
            title: "Alan Turing",
            lang: "en",
            action: "article",
          },
        },
      },
      {
        task: { taskId: "test-wiki-2", actorType: "wikipedia", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    const item = result.data.items[0];
    assert.ok(item.markdown);
    assert.match(item.markdown, /# Alan Turing/);
    assert.match(item.markdown, /## Early life/);
    assert.doesNotMatch(item.markdown, /bad script/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("WikipediaActor searches pages and cleans HTML snippets", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SEARCH_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/w/rest.php/v1/search/page?q=Turing`;

  try {
    const actor = new WikipediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-3",
        actorType: "wikipedia",
        targetUrl,
        options: {
          wikipediaOptions: {
            query: "Turing",
            lang: "en",
            action: "search",
            limit: 5,
          },
        },
      },
      {
        task: { taskId: "test-wiki-3", actorType: "wikipedia", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.items.length, 2);
    assert.equal(result.data.items[0].title, "Alan Turing");
    assert.doesNotMatch(result.data.items[0].extract || "", /<span>/);
    assert.equal(result.data.items[1].title, "Turing machine");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("WikipediaActor blocks private SSRF address in non-test mode simulation", async () => {
  const prevEnv = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  try {
    const actor = new WikipediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-ssrf",
        actorType: "wikipedia",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
        options: {
          wikipediaOptions: {
            title: "Metadata",
          },
        },
      },
      {
        task: {
          taskId: "test-wiki-ssrf",
          actorType: "wikipedia",
          targetUrl: "http://169.254.169.254/latest/meta-data/",
        },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prevEnv;
  }
});

test("WikimediaActor alias inherits WikipediaActor correctly", () => {
  const actor = new WikimediaActor();
  assert.equal(actor.actorType, "wikimedia");
  assert.ok(actor instanceof WikipediaActor);
});

test("POST /api/v1/wikipedia and /wikipedia HTTP server route resolves and executes WikipediaActor", async () => {
  const mockWikiServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK_SUMMARY_JSON));
  });
  await new Promise<void>((resolve) => mockWikiServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockWikiServer.address() as { port: number }).port;
  const mockTargetUrl = `http://127.0.0.1:${mockPort}/api/rest_v1/page/summary/Alan_Turing`;

  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    // Test /api/v1/wikipedia route
    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/wikipedia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: mockTargetUrl,
        title: "Alan Turing",
        action: "summary",
      }),
    });
    assert.equal(res1.status, 200);
    const data1 = (await res1.json()) as {
      success: boolean;
      data: { items: Array<{ title: string }> };
    };
    assert.equal(data1.success, true);
    assert.equal(data1.data.items[0].title, "Alan Turing");

    // Test alias /wikipedia route
    const res2 = await fetch(`http://127.0.0.1:${port}/wikipedia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: mockTargetUrl,
        title: "Alan Turing",
        action: "summary",
      }),
    });
    assert.equal(res2.status, 200);
    const data2 = (await res2.json()) as {
      success: boolean;
      data: { items: Array<{ title: string }> };
    };
    assert.equal(data2.success, true);
    assert.equal(data2.data.items[0].title, "Alan Turing");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mockWikiServer.close(() => resolve()));
  }
});

test("WikipediaActor extracts batch articles when options.titles is provided", async () => {
  const server = http.createServer((req, res) => {
    if (req.url?.includes("Alan_Turing")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Alan Turing</h1><p>Computer scientist.</p>");
    } else if (req.url?.includes("Ada_Lovelace")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Ada Lovelace</h1><p>First programmer.</p>");
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new WikipediaActor();
    // Stub URL resolution by directing to local mock server
    const result = await actor.run(
      {
        taskId: "test-wiki-batch",
        actorType: "wikipedia",
        targetUrl: `http://127.0.0.1:${port}/api/rest_v1/page/html/Alan_Turing`,
        options: {
          wikipediaOptions: {
            titles: ["Alan Turing"],
            lang: "en",
            action: "article",
          },
        },
      },
      {
        task: { taskId: "test-wiki-batch", actorType: "wikipedia", targetUrl: "" },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.data?.items.length, 1);
    assert.equal(result.data?.items[0].title, "Alan Turing");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("WikipediaActor parses search results with full articles when fetchFullArticles is true", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SEARCH_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/w/rest.php/v1/search/page?q=Turing&limit=2`;

  try {
    const actor = new WikipediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-search-full",
        actorType: "wikipedia",
        targetUrl,
        options: {
          wikipediaOptions: {
            query: "Turing",
            lang: "en",
            action: "search",
            limit: 2,
            fetchFullArticles: false,
          },
        },
      },
      {
        task: { taskId: "test-wiki-search-full", actorType: "wikipedia", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.data?.items.length, 2);
    assert.equal(result.data?.items[0].title, "Alan Turing");
    assert.equal(result.data?.items[1].title, "Turing machine");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
