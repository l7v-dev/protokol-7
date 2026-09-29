/**
 * SemanticScholarActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { SemanticScholarActor } from "../src/actors/corpus/semantic-scholar-actor";
import type { ActorTask } from "../src/api/types";

describe("SemanticScholarActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path.includes("/paper/search")) {
        const _query = parsedUrl.searchParams.get("query") || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            total: 1500,
            offset: 0,
            next: 10,
            data: [
              {
                paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
                title: "Attention Is All You Need",
                url: "https://www.semanticscholar.org/paper/649def34f8be52c8b66281af98ae884c09aef38b",
                year: 2017,
                venue: "NeurIPS",
                citationCount: 120000,
                authors: [{ authorId: "1741101", name: "Ashish Vaswani" }],
                tldr: {
                  text: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks.",
                },
              },
            ],
          })
        );
        return;
      }

      if (path.includes("/paper/649def34f8be52c8b66281af98ae884c09aef38b/citations")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: [
              {
                citingPaper: {
                  paperId: "abc1234567890",
                  title: "BERT: Pre-training of Deep Bidirectional Transformers",
                  year: 2018,
                  citationCount: 85000,
                  authors: [{ name: "Jacob Devlin" }],
                },
              },
            ],
          })
        );
        return;
      }

      if (
        path.includes("/paper/649def34f8be52c8b66281af98ae884c09aef38b") ||
        path.includes("/paper/ARXIV:1706.03762")
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
            corpusId: 215416114,
            title: "Attention Is All You Need",
            url: "https://www.semanticscholar.org/paper/649def34f8be52c8b66281af98ae884c09aef38b",
            year: 2017,
            venue: "NeurIPS",
            abstract:
              "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks in an encoder-decoder configuration.",
            tldr: {
              text: "The Transformer is the first transduction model relying entirely on self-attention.",
            },
            citationCount: 120000,
            referenceCount: 38,
            isOpenAccess: true,
            openAccessPdf: { url: "https://arxiv.org/pdf/1706.03762.pdf" },
            authors: [
              { authorId: "1741101", name: "Ashish Vaswani" },
              { authorId: "1782800", name: "Noam Shazeer" },
            ],
            externalIds: { ArXiv: "1706.03762", CorpusId: "215416114" },
          })
        );
        return;
      }

      if (path.includes("/author/1741101")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            authorId: "1741101",
            name: "Ashish Vaswani",
            affiliations: ["Google Brain", "Essential AI"],
            homepage: "https://ashishvaswani.com",
            paperCount: 45,
            citationCount: 135000,
            hIndex: 32,
            papers: [
              {
                paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
                title: "Attention Is All You Need",
                year: 2017,
              },
            ],
          })
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (addr && typeof addr === "object") {
          mockServerPort = addr.port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}/graph/v1`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const actor = new SemanticScholarActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "semantic-scholar",
        targetUrl: "http://169.254.169.254/latest/meta-data",
        options: {
          semanticScholarOptions: {
            action: "paper",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF validation failed/i);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("retrieves paper metadata, abstract, TLDR, and citations", async () => {
      const actor = new SemanticScholarActor();
      const task: ActorTask = {
        taskId: "test-paper",
        actorType: "semantic-scholar",
        targetUrl: `${mockServerUrl}/paper/649def34f8be52c8b66281af98ae884c09aef38b`,
        options: {
          semanticScholarOptions: {
            action: "paper",
            paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "paper");
      assert.ok(result.data.paper);
      assert.strictEqual(result.data.paper.title, "Attention Is All You Need");
      assert.strictEqual(result.data.paper.year, 2017);
      assert.strictEqual(result.data.paper.citationCount, 120000);
      assert.strictEqual(result.data.paper.isOpenAccess, true);
      assert.strictEqual(
        result.data.paper.openAccessPdfUrl,
        "https://arxiv.org/pdf/1706.03762.pdf"
      );
      assert.match(result.data.paper.tldr || "", /first transduction model/i);
      assert.match(result.data.markdown || "", /# Attention Is All You Need/);
    });

    it("searches literature graph by query", async () => {
      const actor = new SemanticScholarActor();
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "semantic-scholar",
        targetUrl: `${mockServerUrl}/paper/search?query=transformer`,
        options: {
          semanticScholarOptions: {
            action: "search",
            query: "transformer",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "search");
      assert.strictEqual(result.data.totalResults, 1500);
      assert.ok(result.data.papers && result.data.papers.length === 1);
      assert.strictEqual(result.data.papers[0].title, "Attention Is All You Need");
      assert.match(result.data.markdown || "", /# Semantic Scholar Literature Search/);
    });

    it("retrieves author profile, affiliations, and metrics", async () => {
      const actor = new SemanticScholarActor();
      const task: ActorTask = {
        taskId: "test-author",
        actorType: "semantic-scholar",
        targetUrl: `${mockServerUrl}/author/1741101`,
        options: {
          semanticScholarOptions: {
            action: "author",
            authorId: "1741101",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "author");
      assert.ok(result.data.author);
      assert.strictEqual(result.data.author.name, "Ashish Vaswani");
      assert.strictEqual(result.data.author.hIndex, 32);
      assert.strictEqual(result.data.author.paperCount, 45);
      assert.ok(result.data.author.affiliations?.includes("Google Brain"));
      assert.match(result.data.markdown || "", /# Ashish Vaswani/);
    });

    it("retrieves paper citations list", async () => {
      const actor = new SemanticScholarActor();
      const task: ActorTask = {
        taskId: "test-citations",
        actorType: "semantic-scholar",
        targetUrl: `${mockServerUrl}/paper/649def34f8be52c8b66281af98ae884c09aef38b/citations`,
        options: {
          semanticScholarOptions: {
            action: "citations",
            paperId: "649def34f8be52c8b66281af98ae884c09aef38b",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data);
      assert.strictEqual(result.data.action, "citations");
      assert.ok(result.data.papers && result.data.papers.length === 1);
      assert.strictEqual(
        result.data.papers[0].title,
        "BERT: Pre-training of Deep Bidirectional Transformers"
      );
      assert.match(result.data.markdown || "", /# Semantic Scholar Paper Citations/);
    });
  });
});
