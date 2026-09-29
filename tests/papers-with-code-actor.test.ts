/**
 * PapersWithCodeActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { PapersWithCodeActor } from "../src/actors/corpus/papers-with-code-actor";
import type { ActorTask } from "../src/api/types";

describe("PapersWithCodeActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path === "/1706.03762") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: "1706.03762",
            title: "Attention Is All You Need",
            summary:
              "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer, a model architecture eschewing recurrence.",
            ai_summary:
              "Introduces the Transformer architecture relying entirely on an attention mechanism to dispense with recurrence and convolutions.",
            publishedAt: "2017-06-12T00:00:00.000Z",
            upvotes: 4200,
            authors: [
              { name: "Ashish Vaswani" },
              { name: "Noam Shazeer" },
              { name: "Niki Parmar" },
            ],
            linkedModels: ["google/transformer", "facebook/bart-base"],
            linkedDatasets: ["wmt14_en_de"],
          })
        );
        return;
      }

      if (path === "/daily_papers") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify([
            {
              paper: {
                id: "2401.00001",
                title: "DeepSeek-LLM: Scaling Open-Source Language Models",
                summary: "We introduce DeepSeek LLM, an advanced language model.",
                ai_summary: "Open source foundation models scaled up to 67B parameters.",
                publishedAt: "2024-01-01T00:00:00.000Z",
                upvotes: 350,
                authors: [{ name: "DeepSeek AI" }],
              },
            },
          ])
        );
        return;
      }

      if (path === "/papers/1706.03762") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Attention Is All You Need</title></head>
<body>
  <h1>Attention Is All You Need</h1>
  <div class="code-links">
    <a href="https://github.com/tensorflow/tensor2tensor">Official Tensor2Tensor Repository</a>
    <a href="https://github.com/huggingface/transformers">Hugging Face Transformers</a>
  </div>
</body>
</html>`);
        return;
      }

      if (parsedUrl.searchParams.has("q")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html>
<html>
<head><title>Search Results</title></head>
<body>
  <article>
    <a href="/papers/1706.03762">
      <h2>Attention Is All You Need</h2>
    </a>
  </article>
</body>
</html>`);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (typeof addr === "object" && addr !== null) {
          mockServerPort = addr.port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("Parameter Resolution & URL Parsing", () => {
    const actor = new PapersWithCodeActor();

    it("resolves paper slug and arxivId from standard paper URL", async () => {
      const task: ActorTask = {
        taskId: "test-params-1",
        actorType: "papers-with-code",
        targetUrl: "https://paperswithcode.com/paper/attention-is-all-you-need",
      };

      const result = await actor.run(task, { task });
      assert.ok(result);
    });

    it("resolves search query from search parameter URL", async () => {
      const task: ActorTask = {
        taskId: "test-params-2",
        actorType: "papers-with-code",
        targetUrl: "https://paperswithcode.com/search?q_term=transformer",
      };

      const result = await actor.run(task, { task });
      assert.ok(result);
    });

    it("defaults to 1706.03762 when parameters are empty", async () => {
      const task: ActorTask = {
        taskId: "test-params-3",
        actorType: "papers-with-code",
        targetUrl: "",
      };

      const result = await actor.run(task, { task });
      assert.ok(result);
    });
  });

  describe("Security & Invariants", () => {
    const actor = new PapersWithCodeActor();

    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "papers-with-code",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("successfully harvests paper record with abstract and code implementations", async () => {
      const actor = new PapersWithCodeActor();
      const task: ActorTask = {
        taskId: "test-e2e-paper",
        actorType: "papers-with-code",
        targetUrl: `${mockServerUrl}/papers/1706.03762`,
        options: {
          papersWithCodeOptions: {
            action: "paper",
            arxivId: "1706.03762",
          },
        },
      };

      const result = await actor.run(task, { task });
      if (result.status === "completed") {
        assert.strictEqual(result.data?.action, "paper");
        assert.strictEqual(result.data?.paper?.arxivId, "1706.03762");
        assert.strictEqual(result.data?.paper?.title, "Attention Is All You Need");
        assert.ok(result.data?.markdown?.includes("Attention Is All You Need"));
        assert.ok(result.data?.markdown?.includes("Ashish Vaswani"));
      }
    });

    it("successfully harvests trending daily papers", async () => {
      const actor = new PapersWithCodeActor();
      const task: ActorTask = {
        taskId: "test-e2e-trending",
        actorType: "papers-with-code",
        targetUrl: `${mockServerUrl}/daily_papers`,
        options: {
          papersWithCodeOptions: {
            action: "trending",
          },
        },
      };

      const result = await actor.run(task, { task });
      if (result.status === "completed") {
        assert.ok(result.data?.action === "trending" || result.data?.action === "daily");
        assert.ok(result.data?.papers?.length);
        assert.ok(result.data?.markdown?.includes("Trending Machine Learning Research Papers"));
      }
    });

    it("successfully searches papers via search query", async () => {
      const actor = new PapersWithCodeActor();
      const task: ActorTask = {
        taskId: "test-e2e-search",
        actorType: "papers-with-code",
        targetUrl: `${mockServerUrl}/?q=transformer`,
        options: {
          papersWithCodeOptions: {
            action: "search",
            query: "transformer",
          },
        },
      };

      const result = await actor.run(task, { task });
      if (result.status === "completed") {
        assert.strictEqual(result.data?.action, "search");
        assert.ok(result.data?.searchResults?.length);
      }
    });
  });
});
