import assert from "node:assert/strict";
import { describe, it } from "node:test";
import zlib from "node:zlib";
import { InternetArchiveActor } from "../src/actors/internet-archive-actor";
import type { ActorRunContext, ActorTask } from "../src/core/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_METADATA_JSON = {
  metadata: {
    identifier: "test-book-123",
    title: "Test Book Title",
    creator: "Jane Doe",
    description: "A comprehensive test book for archive actor.",
    subject: ["testing", "literature"],
    publisher: "Test Publishing Co.",
    date: "1920",
    language: "eng",
    mediatype: "texts",
  },
  files: [
    {
      name: "test-book-123.pdf",
      format: "PDF",
      size: 1048576,
    },
    {
      name: "test-book-123_djvu.txt",
      format: "DjVuTXT",
      size: 51200,
    },
  ],
};

const MOCK_METADATA_WITH_GZ = {
  metadata: {
    identifier: "test-abbyy-456",
    title: "Test Abbyy Book",
    mediatype: "texts",
  },
  files: [
    {
      name: "test-abbyy-456_abbyy.gz",
      format: "Abbyy GZ",
      size: 2048,
    },
  ],
};

const MOCK_METADATA_NO_TEXT = {
  metadata: {
    identifier: "test-audio-789",
    title: "Audio Recording",
    mediatype: "audio",
  },
  files: [
    {
      name: "audio.mp3",
      format: "VBR MP3",
      size: 5242880,
    },
  ],
};

const MOCK_SEARCH_JSON = {
  response: {
    numFound: 2,
    start: 0,
    docs: [
      {
        identifier: "doc-1",
        title: "First Document",
        creator: "Author A",
        description: "Description A",
        subject: ["sample"],
        mediatype: "texts",
      },
      {
        identifier: "doc-2",
        title: "Second Document",
        creator: "Author B",
        mediatype: "texts",
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTask(
  overrides: Partial<ActorTask> = {},
  iaOpts: Record<string, unknown> = {}
): ActorTask {
  return {
    taskId: "test-task-ia",
    actorType: "internet-archive",
    targetUrl: "https://archive.org",
    options: { internetArchiveOptions: iaOpts as never },
    ...overrides,
  };
}

const ctx: ActorRunContext = { task: makeTask(), startTime: Date.now() };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const actor = new InternetArchiveActor();

describe("InternetArchiveActor", () => {
  it("actorType is 'internet-archive'", () => {
    assert.equal(actor.actorType, "internet-archive");
  });

  it("returns 400 when action='metadata' and no identifier provided", async () => {
    const task = makeTask({ targetUrl: "" }, { action: "metadata" });
    const result = await actor.run(task, ctx);
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("identifier"));
  });

  it("extracts identifier from targetUrl details path", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes("/metadata/encyclopedia123"));
      return new Response(JSON.stringify(MOCK_METADATA_JSON), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const task = makeTask({ targetUrl: "https://archive.org/details/encyclopedia123" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.equal(result.data?.items[0].identifier, "encyclopedia123");
      assert.equal(result.data?.items[0].title, "Test Book Title");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("action='metadata' correctly parses metadata and files", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(MOCK_METADATA_JSON), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    try {
      const task = makeTask({}, { action: "metadata", identifier: "test-book-123" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.equal(result.data?.action, "metadata");
      assert.equal(result.data?.totalItems, 1);
      const item = result.data?.items[0];
      assert.equal(item?.creator, "Jane Doe");
      assert.equal(item?.publisher, "Test Publishing Co.");
      assert.equal(item?.files.length, 2);
      assert.ok(item?.downloadUrl?.includes(".pdf"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("action='search' returns 400 if no searchQuery or targetUrl", async () => {
    const task = makeTask({ targetUrl: "" }, { action: "search" });
    const result = await actor.run(task, ctx);
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("searchQuery"));
  });

  it("action='search' parses search results correctly", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes("advancedsearch.php"));
      return new Response(JSON.stringify(MOCK_SEARCH_JSON), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    try {
      const task = makeTask({}, { action: "search", searchQuery: "sample search", maxResults: 10 });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.equal(result.data?.action, "search");
      assert.equal(result.data?.totalItems, 2);
      assert.equal(result.data?.items[0].identifier, "doc-1");
      assert.equal(result.data?.items[1].identifier, "doc-2");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("action='text' returns 400 without identifier", async () => {
    const task = makeTask({ targetUrl: "" }, { action: "text" });
    const result = await actor.run(task, ctx);
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
  });

  it("action='text' returns 404 when no text format file exists in item", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(MOCK_METADATA_NO_TEXT), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    try {
      const task = makeTask({}, { action: "text", identifier: "test-audio-789" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 404);
      assert.ok(result.errorMessage?.includes("No OCR/text file found"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("action='text' downloads plain text file and respects maxTextChars", async () => {
    const origFetch = globalThis.fetch;
    const longText = "Sample text content line for DjVu text. ".repeat(100);
    globalThis.fetch = async (url) => {
      const str = String(url);
      if (str.includes("/metadata/")) {
        return new Response(JSON.stringify(MOCK_METADATA_JSON), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(longText, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    };
    try {
      const task = makeTask({}, { action: "text", identifier: "test-book-123", maxTextChars: 50 });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data?.extractedText);
      assert.ok(result.data.extractedText.includes("[truncated at 50 characters]"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("action='text' decompresses Abbyy GZ format", async () => {
    const rawText = "Decompressed Abbyy OCR text stream content.";
    const gzipped = zlib.gzipSync(Buffer.from(rawText, "utf-8"));

    const origFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const str = String(url);
      if (str.includes("/metadata/")) {
        return new Response(JSON.stringify(MOCK_METADATA_WITH_GZ), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(gzipped, {
        status: 200,
        headers: { "Content-Type": "application/x-gzip" },
      });
    };
    try {
      const task = makeTask({}, { action: "text", identifier: "test-abbyy-456" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "completed");
      assert.equal(result.data?.extractedText, rawText);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("handles HTTP errors gracefully", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });
    try {
      const task = makeTask({}, { action: "metadata", identifier: "unknown-id" });
      const result = await actor.run(task, ctx);
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 404);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
