import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import { OpenReviewActor } from "../src/actors/corpus/openreview-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_SUBMISSIONS = {
  notes: [
    {
      id: "paper-101",
      forum: "paper-101",
      content: {
        title: { value: "Attention Is All You Need for Reasoning" },
        authors: { value: ["Jane Doe", "John Smith"] },
        abstract: {
          value:
            "We demonstrate that attention-based architectures excel at mathematical reasoning.",
        },
        venue: { value: "ICLR 2024" },
        year: { value: 2024 },
        pdf: { value: "/pdf/paper-101.pdf" },
      },
      cdate: 1700000000000,
    },
    {
      id: "paper-102",
      forum: "paper-102",
      content: {
        title: "Self-Correction in Automated Coding Agents",
        authors: ["Alan Turing", "Ada Lovelace"],
        abstract: "Analyzing recursive verification loops in LLM code generation.",
        venue: "ICLR 2024",
        year: 2024,
      },
      cdate: 1700001000000,
    },
  ],
};

const MOCK_FORUM_THREAD = {
  notes: [
    {
      id: "paper-root-1",
      forum: "paper-root-1",
      content: {
        title: { value: "Dialectic Reasoning via Multi-Agent Peer Review" },
        authors: { value: ["Grace Hopper"] },
        abstract: { value: "We model scientific consensus via automated peer review tournaments." },
        venue: { value: "ICLR 2024" },
        year: { value: 2024 },
        pdf: { value: "https://openreview.net/pdf?id=paper-root-1" },
      },
    },
    {
      id: "decision-1",
      forum: "paper-root-1",
      replyto: "paper-root-1",
      invitation: "ICLR.cc/2024/Conference/-/Decision",
      content: {
        decision: { value: "Accept (Oral)" },
        comment: { value: "Consensus accept. Novel approach to multi-agent reasoning." },
      },
    },
    {
      id: "review-1",
      forum: "paper-root-1",
      replyto: "paper-root-1",
      invitation: "ICLR.cc/2024/Conference/-/Official_Review",
      content: {
        rating: { value: "8: Accept, good paper" },
        confidence: { value: "4: High confidence" },
        review: {
          value: "The paper proposes a sound formalization. Empirical results are compelling.",
        },
      },
    },
    {
      id: "rebuttal-1",
      forum: "paper-root-1",
      replyto: "review-1",
      invitation: "ICLR.cc/2024/Conference/-/Official_Comment",
      content: {
        comment: {
          value: "We thank the reviewer for the constructive feedback and additional ablations.",
        },
      },
    },
  ],
};

describe("OpenReviewActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new OpenReviewActor();
    assert.equal(actor.actorType, "openreview");
    assert.ok(actor.description.length > 0);
  });

  it("resolves parameters and actions from targetUrl and options", () => {
    const actor = new OpenReviewActor();

    const fromForumUrl = actor.resolveParameters("https://openreview.net/forum?id=ABC123xyz");
    assert.equal(fromForumUrl.action, "forum");
    assert.equal(fromForumUrl.forumId, "ABC123xyz");

    const fromVenueUrl = actor.resolveParameters(
      "https://openreview.net/group?id=ICLR.cc/2024/Conference"
    );
    assert.equal(fromVenueUrl.action, "submissions");
    assert.equal(fromVenueUrl.venue, "ICLR.cc/2024/Conference");

    const fromOptions = actor.resolveParameters(undefined, {
      action: "forum",
      forumId: "sample_forum_id",
    });
    assert.equal(fromOptions.action, "forum");
    assert.equal(fromOptions.forumId, "sample_forum_id");
  });

  it("builds correct endpoint URLs for forum, submissions, query, and note actions", () => {
    const actor = new OpenReviewActor();

    const forumUrl = actor.buildEndpointUrl(undefined, "forum", undefined, "XYZ999");
    assert.equal(forumUrl, "https://api2.openreview.net/notes?forum=XYZ999&limit=100");

    const noteUrl = actor.buildEndpointUrl(undefined, "note", undefined, undefined, "note-42");
    assert.equal(noteUrl, "https://api2.openreview.net/notes?id=note-42");

    const queryUrl = actor.buildEndpointUrl(
      undefined,
      "submissions",
      undefined,
      undefined,
      undefined,
      "attention reasoning",
      15
    );
    assert.ok(queryUrl.includes("/notes/search?term=attention%20reasoning&limit=15"));

    const venueUrl = actor.buildEndpointUrl(
      undefined,
      "submissions",
      "ICLR.cc/2024/Conference",
      undefined,
      undefined,
      undefined,
      30
    );
    assert.ok(venueUrl.includes("content.venueid=ICLR.cc%2F2024%2FConference&limit=30"));
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new OpenReviewActor();
    const task: ActorTask = {
      taskId: "test-ssrf-openreview",
      actorType: "openreview",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  });

  it("extracts and parses OpenReview paper submissions with v1 and v2 content wrappers", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_SUBMISSIONS));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/notes`;

    try {
      const actor = new OpenReviewActor();
      const task: ActorTask = {
        taskId: "test-openreview-submissions",
        actorType: "openreview",
        targetUrl: mockUrl,
        options: {
          openreviewOptions: {
            action: "submissions",
            venue: "ICLR.cc/2024/Conference",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.totalCount, 2);

      const n1 = result.data.notes[0];
      assert.equal(n1.id, "paper-101");
      assert.equal(n1.title, "Attention Is All You Need for Reasoning");
      assert.deepEqual(n1.authors, ["Jane Doe", "John Smith"]);
      assert.ok(n1.abstract?.includes("mathematical reasoning"));
      assert.equal(n1.year, 2024);

      const n2 = result.data.notes[1];
      assert.equal(n2.id, "paper-102");
      assert.equal(n2.title, "Self-Correction in Automated Coding Agents");
      assert.deepEqual(n2.authors, ["Alan Turing", "Ada Lovelace"]);

      assert.ok(result.data.markdown?.includes("# OpenReview Academic Submissions & Reviews"));
      assert.ok(result.data.markdown?.includes("Attention Is All You Need"));
    } finally {
      server.close();
    }
  });

  it("extracts full forum thread with root paper, decision, reviews, and rebuttals", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_FORUM_THREAD));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/notes?forum=paper-root-1`;

    try {
      const actor = new OpenReviewActor();
      const task: ActorTask = {
        taskId: "test-openreview-forum",
        actorType: "openreview",
        targetUrl: mockUrl,
        options: {
          openreviewOptions: {
            action: "forum",
            forumId: "paper-root-1",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.totalCount, 4);

      const md = result.data.markdown || "";
      assert.ok(md.includes("## Makale: Dialectic Reasoning via Multi-Agent Peer Review"));
      assert.ok(md.includes("Grace Hopper"));
      assert.ok(md.includes("Nihai Karar: Accept (Oral)"));
      assert.ok(md.includes("**Puan (Rating):** 8: Accept, good paper"));
      assert.ok(md.includes("Empirical results are compelling"));
      assert.ok(md.includes("Yazar Yanıtı / Rebuttal"));
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/notes/error`;

    try {
      const actor = new OpenReviewActor();
      const task: ActorTask = {
        taskId: "test-openreview-500",
        actorType: "openreview",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 500);
      assert.ok(result.errorMessage?.includes("500"));
    } finally {
      server.close();
    }
  });
});
