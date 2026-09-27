import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { WikimediaActor } from "../src/actors/corpus/wikimedia-actor";
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

test("WikimediaActor fetches and parses page summary", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SUMMARY_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/rest_v1/page/summary/Alan_Turing`;

  try {
    const actor = new WikimediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-1",
        actorType: "wikimedia",
        targetUrl,
        options: {
          wikimediaOptions: {
            title: "Alan Turing",
            lang: "en",
            action: "summary",
          },
        },
      },
      {
        task: { taskId: "test-wiki-1", actorType: "wikimedia", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.items.length, 1);
    const item = result.data.items[0];
    assert.equal(item.title, "Alan Turing");
    assert.ok(item.extract?.includes("computer scientist"));
    assert.equal(item.description, "English mathematician and computer scientist (1912–1954)");
    assert.equal(item.url, "https://en.wikipedia.org/wiki/Alan_Turing");
    assert.ok(item.thumbnailUrl?.includes("Alan_Turing_Aged_16.jpg"));
  } finally {
    server.close();
  }
});

test("WikimediaActor fetches full article and converts Parsoid HTML to clean Markdown", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(MOCK_ARTICLE_HTML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/api/rest_v1/page/html/Alan_Turing`;

  try {
    const actor = new WikimediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-2",
        actorType: "wikimedia",
        targetUrl,
        options: {
          wikimediaOptions: {
            title: "Alan Turing",
            lang: "en",
            action: "article",
          },
        },
      },
      {
        task: { taskId: "test-wiki-2", actorType: "wikimedia", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.action, "article");
    const item = result.data.items[0];
    assert.ok(item.markdown);
    assert.ok(item.markdown.includes("# Alan Turing"));
    assert.ok(item.markdown.includes("## Early life"));
    assert.ok(item.markdown.includes("On Computable Numbers"));
    assert.ok(!item.markdown.includes("<script>"));
  } finally {
    server.close();
  }
});

test("WikimediaActor parses search results and strips HTML highlight tags", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SEARCH_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/w/rest.php/v1/search/page?q=Turing&limit=2`;

  try {
    const actor = new WikimediaActor();
    const result = await actor.run(
      {
        taskId: "test-wiki-3",
        actorType: "wikimedia",
        targetUrl,
        options: {
          wikimediaOptions: {
            query: "Turing",
            action: "search",
            limit: 2,
          },
        },
      },
      {
        task: { taskId: "test-wiki-3", actorType: "wikimedia", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.items.length, 2);
    assert.equal(result.data.items[0].title, "Alan Turing");
    assert.equal(
      result.data.items[0].extract,
      "Alan Mathison Turing was an English mathematician."
    );
    assert.equal(result.data.items[0].thumbnailUrl, "https://upload.wikimedia.org/thumb.jpg");
    assert.equal(result.data.items[1].title, "Turing machine");
  } finally {
    server.close();
  }
});

test("WikimediaActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new WikimediaActor();
  const result = await actor.run(
    {
      taskId: "test-wiki-ssrf",
      actorType: "wikimedia",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: {
        taskId: "test-wiki-ssrf",
        actorType: "wikimedia",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF"));
});

test("POST /api/v1/wikimedia executes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_SUMMARY_JSON));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/wikimedia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/api/rest_v1/page/summary/Alan_Turing`,
        title: "Alan Turing",
        action: "summary",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      success: boolean;
      data: { items: Array<{ title: string }> };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.items[0].title, "Alan Turing");
  } finally {
    app.close();
    mockServer.close();
  }
});
