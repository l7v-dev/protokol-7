import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { OpenStaxActor } from "../src/actors/corpus/openstax-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_OPENSTAX_CATALOG = {
  meta: {
    total_count: 2,
  },
  items: [
    {
      id: 38,
      title: "Algebra and Trigonometry",
      slug: "algebra-and-trigonometry",
      description: "<p>Comprehensive exploration of algebraic principles.</p>",
      publish_date: "2016-03-09",
      license_name: "Creative Commons Attribution License",
      high_resolution_pdf_url: "https://assets.openstax.org/media/documents/Algebra.pdf",
      cover_url: "https://assets.openstax.org/media/covers/algebra.jpg",
      cnx_id: "13ac107a-f15f-49d2-97e8-60ab2e3b519c",
    },
    {
      id: 867,
      title: "University Physics Volume 1",
      slug: "university-physics-volume-1",
      description: "<p>Calculus-based physics covering mechanics and waves.</p>",
      publish_date: "2016-09-19",
      license_name: "Creative Commons Attribution License",
      high_resolution_pdf_url: "https://assets.openstax.org/media/documents/Physics1.pdf",
      cover_url: "https://assets.openstax.org/media/covers/physics1.jpg",
      cnx_id: "d50f6e32-0fed-46fed-b30e-1a3b1a8d05ee",
    },
  ],
};

const MOCK_OPENSTAX_DETAIL = {
  id: 38,
  title: "Algebra and Trigonometry",
  slug: "algebra-and-trigonometry",
  description: "<p>Detailed textbook on algebra and trigonometry.</p>",
  publish_date: "2016-03-09",
  license_name: "Creative Commons Attribution License",
  high_resolution_pdf_url: "https://assets.openstax.org/media/documents/Algebra.pdf",
  cnx_id: "13ac107a-f15f-49d2-97e8-60ab2e3b519c",
  webview_rex_link: "https://openstax.org/books/algebra-and-trigonometry/pages/1-introduction",
};

const MOCK_CHAPTER_HTML = `
<!DOCTYPE html>
<html>
<head><title>Chapter 1: Prerequisites</title></head>
<body>
  <main>
    <h1>1.1 Real Numbers: Algebra Essentials</h1>
    <p>In this section, we review operations with real numbers and basic algebraic expressions.</p>
  </main>
</body>
</html>
`;

test("OpenStaxActor fetches textbook catalog and normalizes markdown", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK_OPENSTAX_CATALOG));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new OpenStaxActor();
    const task = {
      taskId: "test-openstax-1",
      actorType: "openstax" as const,
      targetUrl: `http://127.0.0.1:${port}/apps/cms/api/v2/pages/?type=books.Book`,
      options: {
        openstaxOptions: {
          action: "catalog" as const,
          limit: 10,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalCount, 2);
    assert.equal(result.data.books.length, 2);
    assert.equal(result.data.books[0].title, "Algebra and Trigonometry");
    assert.equal(result.data.books[0].slug, "algebra-and-trigonometry");
    assert.equal(result.data.books[0].cnxId, "13ac107a-f15f-49d2-97e8-60ab2e3b519c");
    assert.ok(result.data.markdown.includes("OpenStax Textbooks"));
    assert.ok(result.data.markdown.includes("Algebra and Trigonometry"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("OpenStaxActor retrieves book detail by bookId", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK_OPENSTAX_DETAIL));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new OpenStaxActor();
    const task = {
      taskId: "test-openstax-2",
      actorType: "openstax" as const,
      targetUrl: `http://127.0.0.1:${port}/apps/cms/api/v2/pages/38/`,
      options: {
        openstaxOptions: {
          bookId: "38",
          action: "detail" as const,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.books[0].title, "Algebra and Trigonometry");
    assert.equal(result.data.books[0].cnxId, "13ac107a-f15f-49d2-97e8-60ab2e3b519c");
    assert.ok(result.data.markdown.includes("Online Reader"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("OpenStaxActor extracts chapter HTML content into clean markdown", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(MOCK_CHAPTER_HTML);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const actor = new OpenStaxActor();
    const task = {
      taskId: "test-openstax-3",
      actorType: "openstax" as const,
      targetUrl: `http://127.0.0.1:${port}/books/algebra-and-trigonometry/pages/1-real-numbers`,
      options: {
        openstaxOptions: {
          action: "chapter" as const,
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.ok(result.data.markdown.includes("Chapter 1: Prerequisites"));
    assert.ok(result.data.markdown.includes("Real Numbers"));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("OpenStaxActor blocks SSRF attempt in production environment", async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";

  try {
    const actor = new OpenStaxActor();
    const task = {
      taskId: "test-ssrf-openstax",
      actorType: "openstax" as const,
      targetUrl: "http://127.0.0.1:8080/admin",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });

    assert.equal(result.status, "failed");
    assert.ok(result.errorMessage?.includes("SSRF validation"));
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  }
});
