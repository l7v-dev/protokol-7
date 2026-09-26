import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { GutenbergActor } from "../src/actors/gutenberg-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_GUTENDEX_JSON = {
  count: 1,
  results: [
    {
      id: 1342,
      title: "Pride and Prejudice",
      authors: [
        {
          name: "Austen, Jane",
          birth_year: 1775,
          death_year: 1817,
        },
      ],
      subjects: [
        "Courtship -- Fiction",
        "Domestic fiction",
        "England -- Fiction",
        "Sisters -- Fiction",
        "Young women -- Fiction",
      ],
      languages: ["en"],
      download_count: 54321,
      formats: {
        "text/plain; charset=utf-8": "http://127.0.0.1:PLACEHOLDER_PORT/files/1342/1342-0.txt",
        "application/epub+zip": "https://www.gutenberg.org/ebooks/1342.epub3.images",
      },
    },
  ],
};

const MOCK_RAW_BOOK_TEXT = `The Project Gutenberg eBook of Pride and Prejudice, by Jane Austen

This eBook is for the use of anyone anywhere in the United States and
most other parts of the world at no cost and with almost no restrictions
whatsoever.

*** START OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***

PRIDE AND PREJUDICE

By Jane Austen

Chapter 1

It is a truth universally acknowledged, that a single man in possession
of a good fortune, must be in want of a wife.

However little known the feelings or views of such a man may be on his
first entering a neighbourhood, this truth is so well fixed in the minds
of the surrounding families, that he is considered the rightful property
of some one or other of their daughters.

*** END OF THE PROJECT GUTENBERG EBOOK PRIDE AND PREJUDICE ***

A Project Gutenberg License statement follows here with legal clauses...
`;

test("GutenbergActor queries catalog and parses book metadata", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_GUTENDEX_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/books?search=Austen`;

  try {
    const actor = new GutenbergActor();
    const result = await actor.run(
      {
        taskId: "test-gutenberg-1",
        actorType: "gutenberg",
        targetUrl,
        options: {
          gutenbergOptions: {
            searchQuery: "Austen",
            languages: ["en"],
          },
        },
      },
      {
        task: { taskId: "test-gutenberg-1", actorType: "gutenberg", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 1);
    assert.equal(result.data.books.length, 1);

    const book = result.data.books[0];
    assert.equal(book.id, 1342);
    assert.equal(book.title, "Pride and Prejudice");
    assert.deepEqual(book.authors, ["Austen, Jane"]);
    assert.equal(book.languages[0], "en");
    assert.equal(book.downloadCount, 54321);
    assert.ok(book.textUrl?.includes("/files/1342/1342-0.txt"));
  } finally {
    server.close();
  }
});

test("GutenbergActor downloads plain text and strips license headers and footers", async () => {
  let textRequested = false;

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/books")) {
      const serverPort = (server.address() as { port: number }).port;
      const jsonStr = JSON.stringify(MOCK_GUTENDEX_JSON).replace(
        "PLACEHOLDER_PORT",
        String(serverPort)
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(jsonStr);
      return;
    }

    if (req.url?.startsWith("/files/1342")) {
      textRequested = true;
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(MOCK_RAW_BOOK_TEXT);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/books?search=Austen`;

  try {
    const actor = new GutenbergActor();
    const result = await actor.run(
      {
        taskId: "test-gutenberg-2",
        actorType: "gutenberg",
        targetUrl,
        options: {
          gutenbergOptions: {
            searchQuery: "Austen",
            downloadText: true,
            maxBytes: 100_000,
          },
        },
      },
      {
        task: { taskId: "test-gutenberg-2", actorType: "gutenberg", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(textRequested, true);
    assert.ok(result.data);
    const book = result.data.books[0];
    assert.ok(book.cleanText);
    assert.ok(book.cleanText.includes("PRIDE AND PREJUDICE"));
    assert.ok(book.cleanText.includes("universally acknowledged"));
    assert.ok(!book.cleanText.includes("*** START OF"));
    assert.ok(!book.cleanText.includes("*** END OF"));
    assert.ok(!book.cleanText.includes("A Project Gutenberg License statement"));
  } finally {
    server.close();
  }
});

test("GutenbergActor.stripGutenbergHeaders strips delimiters accurately", () => {
  const actor = new GutenbergActor();
  const cleaned = actor.stripGutenbergHeaders(MOCK_RAW_BOOK_TEXT);
  assert.ok(cleaned.startsWith("PRIDE AND PREJUDICE"));
  assert.ok(cleaned.endsWith("property\nof some one or other of their daughters."));
});

test("GutenbergActor strips headers cleanly even when maxBytes is small", async () => {
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith("/books")) {
      const serverPort = (server.address() as { port: number }).port;
      const jsonStr = JSON.stringify(MOCK_GUTENDEX_JSON).replace(
        "PLACEHOLDER_PORT",
        String(serverPort)
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(jsonStr);
      return;
    }

    if (req.url?.startsWith("/files/1342")) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(MOCK_RAW_BOOK_TEXT);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/books?search=Austen`;

  try {
    const actor = new GutenbergActor();
    const result = await actor.run(
      {
        taskId: "test-gutenberg-small-bytes",
        actorType: "gutenberg",
        targetUrl,
        options: {
          gutenbergOptions: {
            searchQuery: "Austen",
            downloadText: true,
            maxBytes: 30, // Very small limit: must only contain start of clean text, not license!
          },
        },
      },
      {
        task: { taskId: "test-gutenberg-small-bytes", actorType: "gutenberg", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    const book = result.data?.books[0];
    assert.ok(book?.cleanText);
    assert.ok(book.cleanText.startsWith("PRIDE AND PREJUDICE"));
    assert.ok(!book.cleanText.includes("The Project Gutenberg eBook"));
    assert.ok(book.cleanText.length <= 30);
  } finally {
    server.close();
  }
});

test("GutenbergActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new GutenbergActor();
  const result = await actor.run(
    {
      taskId: "test-gutenberg-ssrf",
      actorType: "gutenberg",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: {
        taskId: "test-gutenberg-ssrf",
        actorType: "gutenberg",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF"));
});

test("POST /api/v1/gutenberg executes correctly via server router", async () => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_GUTENDEX_JSON));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/gutenberg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/books?search=Austen`,
        searchQuery: "Austen",
        languages: ["en"],
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      success: boolean;
      data: { books: Array<{ title: string; id: number }> };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.books[0].title, "Pride and Prejudice");
    assert.equal(body.data.books[0].id, 1342);
  } finally {
    app.close();
    mockServer.close();
  }
});
