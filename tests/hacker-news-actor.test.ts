import assert from "node:assert/strict";
import * as http from "node:http";
import { describe, it } from "node:test";
import { HackerNewsActor } from "../src/actors/corpus/hacker-news-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_FRONT_PAGE = {
  hits: [
    {
      objectID: "38870001",
      title: "SQLite in the Browser with WebAssembly",
      url: "https://sqlite.org/wasm/doc/trunk/index.md",
      author: "drh",
      points: 450,
      num_comments: 120,
      created_at_i: 1700000000,
      story_text: null,
    },
    {
      objectID: "38870002",
      title: "Ask HN: What is your production post-mortem process?",
      url: null,
      author: "sysadmin_lead",
      points: 210,
      num_comments: 85,
      created_at_i: 1700003600,
      story_text: "<p>We are refining our blameless post-mortem framework.</p>",
    },
  ],
};

const MOCK_STORY_WITH_COMMENTS = {
  id: 38870197,
  title: "Architecture Post-Mortem: Distributed Cache Failure",
  url: "https://engineering.example.com/post-mortem-cache",
  author: "lead_infra",
  points: 620,
  created_at_i: 1700010000,
  text: "<p>A thundering herd condition occurred after a Redis failover.</p><pre><code>client.reconnect(backoff=exponential)</code></pre>",
  children: [
    {
      id: 38870201,
      author: "db_architect",
      text: "<p>Did you consider using <i>probabilistic early expiration</i> (&amp; jitter)?</p>",
      created_at_i: 1700010500,
      parent_id: 38870197,
      children: [
        {
          id: 38870205,
          author: "lead_infra",
          text: '<p>Yes, we added XFetch jitter as recommended in <a href="https://vldb.org/pvldb/vol8/p886-vattani.pdf">VLDB paper</a>.</p>',
          created_at_i: 1700011000,
          parent_id: 38870201,
          children: [],
        },
      ],
    },
    {
      id: 38870202,
      author: "sre_wizard",
      text: "<p>Circuit breakers should have tripped at 80% capacity.</p>",
      created_at_i: 1700010600,
      parent_id: 38870197,
      children: [],
    },
  ],
};

describe("HackerNewsActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new HackerNewsActor();
    assert.equal(actor.actorType, "hacker-news");
    assert.ok(actor.description.length > 0);
  });

  it("resolves parameters and actions from targetUrl and options", () => {
    const actor = new HackerNewsActor();

    const fromItemUrl = actor.resolveParameters("https://news.ycombinator.com/item?id=38870197");
    assert.equal(fromItemUrl.action, "story");
    assert.equal(fromItemUrl.storyId, 38870197);

    const fromAlgoliaUrl = actor.resolveParameters("https://hn.algolia.com/api/v1/items/998877");
    assert.equal(fromAlgoliaUrl.action, "story");
    assert.equal(fromAlgoliaUrl.storyId, 998877);

    const fromAskUrl = actor.resolveParameters("https://news.ycombinator.com/ask");
    assert.equal(fromAskUrl.action, "ask");

    const fromShowUrl = actor.resolveParameters("https://news.ycombinator.com/show");
    assert.equal(fromShowUrl.action, "show");

    const fromNewUrl = actor.resolveParameters("https://news.ycombinator.com/newest");
    assert.equal(fromNewUrl.action, "new");

    const fromOptions = actor.resolveParameters(undefined, {
      action: "search",
      query: "distributed transactions",
    });
    assert.equal(fromOptions.action, "search");
    assert.equal(fromOptions.query, "distributed transactions");
  });

  it("builds correct endpoint URLs for story, search, ask, show, and front page", () => {
    const actor = new HackerNewsActor();

    const storyUrl = actor.buildEndpointUrl(undefined, "story", 38870197);
    assert.equal(storyUrl, "https://hn.algolia.com/api/v1/items/38870197");

    const searchUrl = actor.buildEndpointUrl(
      undefined,
      "search",
      undefined,
      "consensus algorithms",
      25
    );
    assert.equal(
      searchUrl,
      "https://hn.algolia.com/api/v1/search?query=consensus%20algorithms&tags=story&hitsPerPage=25"
    );

    const askUrl = actor.buildEndpointUrl(undefined, "ask", undefined, undefined, 15);
    assert.equal(askUrl, "https://hn.algolia.com/api/v1/search?tags=ask_hn&hitsPerPage=15");

    const showUrl = actor.buildEndpointUrl(undefined, "show", undefined, undefined, 10);
    assert.equal(showUrl, "https://hn.algolia.com/api/v1/search?tags=show_hn&hitsPerPage=10");

    const topUrl = actor.buildEndpointUrl(undefined, "top", undefined, undefined, 30);
    assert.equal(topUrl, "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new HackerNewsActor();
    const task: ActorTask = {
      taskId: "test-ssrf-hacker-news",
      actorType: "hacker-news",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  });

  it("extracts and parses front page stories from Algolia hits format", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_FRONT_PAGE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/search?tags=front_page`;

    try {
      const actor = new HackerNewsActor();
      const task: ActorTask = {
        taskId: "test-hn-front-page",
        actorType: "hacker-news",
        targetUrl: mockUrl,
        options: {
          hackerNewsOptions: {
            action: "top",
            limit: 10,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.equal(result.statusCode, 200);
      assert.ok(result.data);
      assert.equal(result.data.totalStories, 2);

      const s1 = result.data.stories[0];
      assert.equal(s1.id, 38870001);
      assert.equal(s1.title, "SQLite in the Browser with WebAssembly");
      assert.equal(s1.author, "drh");
      assert.equal(s1.points, 450);
      assert.equal(s1.commentsCount, 120);

      const s2 = result.data.stories[1];
      assert.equal(s2.id, 38870002);
      assert.equal(s2.title, "Ask HN: What is your production post-mortem process?");
      assert.ok(s2.text?.includes("blameless post-mortem framework"));

      assert.ok(result.data.markdown);
      assert.ok(
        result.data.markdown.includes("# Hacker News Engineering & Architecture Discussions")
      );
      assert.ok(result.data.markdown.includes("SQLite in the Browser"));
    } finally {
      server.close();
    }
  });

  it("extracts single story with recursive nested comments and cleans HTML", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_STORY_WITH_COMMENTS));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/items/38870197`;

    try {
      const actor = new HackerNewsActor();
      const task: ActorTask = {
        taskId: "test-hn-story-comments",
        actorType: "hacker-news",
        targetUrl: mockUrl,
        options: {
          hackerNewsOptions: {
            action: "story",
            storyId: 38870197,
            maxComments: 50,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.totalStories, 1);

      const story = result.data.stories[0];
      assert.equal(story.id, 38870197);
      assert.equal(story.title, "Architecture Post-Mortem: Distributed Cache Failure");
      assert.equal(story.author, "lead_infra");
      assert.equal(story.points, 620);
      assert.ok(story.text?.includes("thundering herd condition"));
      assert.ok(story.text?.includes("```\nclient.reconnect(backoff=exponential)\n```"));

      // Verify nested comments
      assert.ok(story.comments);
      assert.equal(story.comments.length, 2);

      const c1 = story.comments[0];
      assert.equal(c1.author, "db_architect");
      assert.ok(c1.text?.includes("*probabilistic early expiration* (& jitter)"));
      assert.ok(c1.children);
      assert.equal(c1.children.length, 1);

      const reply = c1.children[0];
      assert.equal(reply.author, "lead_infra");
      assert.ok(reply.text?.includes("XFetch jitter"));
      assert.ok(reply.text?.includes("[VLDB paper](https://vldb.org/pvldb/vol8/p886-vattani.pdf)"));

      const c2 = story.comments[1];
      assert.equal(c2.author, "sre_wizard");
      assert.ok(c2.text?.includes("Circuit breakers should have tripped"));

      // Verify Markdown rendering
      const md = result.data.markdown;
      assert.ok(md);
      assert.ok(md.includes("## Architecture Post-Mortem: Distributed Cache Failure"));
      assert.ok(md.includes("**@db_architect**"));
      assert.ok(md.includes("> **@lead_infra**"));
      assert.ok(md.includes("**@sre_wizard**"));
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Item not found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/items/404`;

    try {
      const actor = new HackerNewsActor();
      const task: ActorTask = {
        taskId: "test-hn-404",
        actorType: "hacker-news",
        targetUrl: mockUrl,
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 404);
      assert.ok(result.errorMessage?.includes("404"));
    } finally {
      server.close();
    }
  });
});
