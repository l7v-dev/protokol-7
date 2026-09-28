/**
 * Unit tests for LessWrongActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { LessWrongActor } from "../src/actors/corpus/lesswrong-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_POSTS_RESPONSE = {
  data: {
    posts: {
      results: [
        {
          _id: "post123",
          title: "Twelve Virtues of Rationality",
          slug: "twelve-virtues-of-rationality",
          pageUrl: "https://www.lesswrong.com/posts/post123/twelve-virtues-of-rationality",
          postedAt: "2024-01-01T10:00:00.000Z",
          baseScore: 150,
          voteCount: 75,
          commentCount: 20,
          user: {
            username: "EliezerYudkowsky",
            displayName: "Eliezer Yudkowsky",
          },
          htmlBody:
            "<p>The first virtue is <strong>curiosity</strong>. A burning itch to know.</p>",
        },
        {
          _id: "post124",
          title: "Conservation of Expected Evidence",
          slug: "conservation-of-expected-evidence",
          pageUrl: "https://www.lesswrong.com/posts/post124/conservation-of-expected-evidence",
          postedAt: "2024-01-02T12:00:00.000Z",
          baseScore: 95,
          voteCount: 40,
          commentCount: 12,
          user: {
            username: "EliezerYudkowsky",
            displayName: "Eliezer Yudkowsky",
          },
          htmlBody: "<p>The expectation of posterior probability equals the prior probability.</p>",
        },
      ],
      totalCount: 2,
    },
  },
};

const MOCK_SINGLE_POST_RESPONSE = {
  data: {
    post: {
      result: {
        _id: "post123",
        title: "Twelve Virtues of Rationality",
        slug: "twelve-virtues-of-rationality",
        pageUrl: "https://www.lesswrong.com/posts/post123/twelve-virtues-of-rationality",
        postedAt: "2024-01-01T10:00:00.000Z",
        baseScore: 150,
        voteCount: 75,
        commentCount: 1,
        user: {
          username: "EliezerYudkowsky",
          displayName: "Eliezer Yudkowsky",
        },
        htmlBody: "<h1>Twelve Virtues</h1><p>The first virtue is curiosity.</p>",
      },
    },
  },
};

const MOCK_COMMENTS_RESPONSE = {
  data: {
    comments: {
      results: [
        {
          _id: "comment456",
          postId: "post123",
          postedAt: "2024-01-01T11:00:00.000Z",
          baseScore: 42,
          user: {
            username: "AnnaSalamon",
            displayName: "Anna Salamon",
          },
          htmlBody: "<p>Notice the relationship between curiosity and epistemic courage.</p>",
        },
      ],
      totalCount: 1,
    },
  },
};

describe("LessWrongActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new LessWrongActor();
    assert.equal(actor.actorType, "lesswrong");
    assert.ok(actor.description.includes("LessWrong"));
  });

  it("resolves parameters and actions correctly", () => {
    const actor = new LessWrongActor();

    const postsParams = actor.resolveParameters("", {
      view: "curated",
      limit: 15,
    });
    assert.equal(postsParams.action, "posts");
    assert.equal(postsParams.platform, "lesswrong");
    assert.equal(postsParams.view, "curated");
    assert.equal(postsParams.limit, 15);

    const postParams = actor.resolveParameters("", {
      postId: "post999",
      platform: "alignmentforum",
    });
    assert.equal(postParams.action, "post");
    assert.equal(postParams.platform, "alignmentforum");
    assert.equal(postParams.postId, "post999");

    const searchParams = actor.resolveParameters("", {
      query: "orthogonality thesis",
    });
    assert.equal(searchParams.action, "search");
    assert.equal(searchParams.query, "orthogonality thesis");
  });

  it("resolves platform, postId, and slug from targetUrl", () => {
    const actor = new LessWrongActor();

    const res1 = actor.resolveParameters(
      "https://www.alignmentforum.org/posts/xyz123/instrumental-convergence",
      {}
    );
    assert.equal(res1.platform, "alignmentforum");
    assert.equal(res1.action, "post");
    assert.equal(res1.postId, "xyz123");
    assert.equal(res1.slug, "instrumental-convergence");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new LessWrongActor();
    const task: ActorTask = {
      taskId: "test-ssrf",
      actorType: "lesswrong",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("fetches and parses list of curated posts via mock GraphQL server", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_POSTS_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/graphql`;

    try {
      const actor = new LessWrongActor();
      const task: ActorTask = {
        taskId: "test-posts",
        actorType: "lesswrong",
        targetUrl: mockUrl,
        options: {
          lessWrongOptions: {
            action: "posts",
            limit: 2,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.action, "posts");
      assert.equal(result.data.totalResults, 2);

      const posts = result.data.posts;
      assert.equal(posts[0].id, "post123");
      assert.equal(posts[0].title, "Twelve Virtues of Rationality");
      assert.equal(posts[0].author, "Eliezer Yudkowsky");
      assert.equal(posts[0].score, 150);
      assert.ok(posts[0].contentMarkdown?.includes("**curiosity**"));

      assert.equal(posts[1].id, "post124");
      assert.equal(posts[1].title, "Conservation of Expected Evidence");

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("# LessWrong Epistemic Rationality Corpus"));
      assert.ok(result.data.markdown.includes("Twelve Virtues of Rationality"));
    } finally {
      server.close();
    }
  });

  it("fetches single post and includes dialectic comments", async () => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        if (body.includes("GetComments")) {
          res.end(JSON.stringify(MOCK_COMMENTS_RESPONSE));
        } else {
          res.end(JSON.stringify(MOCK_SINGLE_POST_RESPONSE));
        }
      });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/graphql`;

    try {
      const actor = new LessWrongActor();
      const task: ActorTask = {
        taskId: "test-single-post",
        actorType: "lesswrong",
        targetUrl: mockUrl,
        options: {
          lessWrongOptions: {
            action: "post",
            postId: "post123",
            includeComments: true,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.action, "post");
      assert.equal(result.data.totalResults, 1);

      const post = result.data.posts[0];
      assert.equal(post.id, "post123");
      assert.equal(post.comments?.length, 1);
      assert.equal(post.comments[0].author, "Anna Salamon");
      assert.equal(post.comments[0].score, 42);
      assert.ok(post.comments[0].contentMarkdown.includes("epistemic courage"));

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("### Dialectic Comments & Argumentation"));
      assert.ok(result.data.markdown.includes("Anna Salamon"));
    } finally {
      server.close();
    }
  });

  it("handles GraphQL errors reported in response payload", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          errors: [{ message: "Document not found for id xyz" }],
        })
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/graphql`;

    try {
      const actor = new LessWrongActor();
      const task: ActorTask = {
        taskId: "test-graphql-err",
        actorType: "lesswrong",
        targetUrl: mockUrl,
        options: {
          lessWrongOptions: {
            action: "post",
            postId: "nonexistent",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 400);
      assert.ok(result.errorMessage?.includes("GraphQL Error: Document not found"));
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP 500 error gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error in VulcanJS");
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/graphql`;

    try {
      const actor = new LessWrongActor();
      const task: ActorTask = {
        taskId: "test-500",
        actorType: "lesswrong",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 500);
      assert.ok(result.errorMessage?.includes("LessWrong GraphQL API returned HTTP 500"));
    } finally {
      server.close();
    }
  });
});
