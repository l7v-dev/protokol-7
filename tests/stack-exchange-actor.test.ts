import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { StackExchangeActor } from "../src/actors/stack-exchange-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_QUESTIONS_JSON = {
  has_more: false,
  items: [
    {
      question_id: 12345,
      title: "How to implement binary search in TypeScript?",
      body: "<p>What is the most concise way to implement binary search?</p>",
      score: 42,
      tags: ["typescript", "algorithm", "binary-search"],
      link: "https://stackoverflow.com/questions/12345",
      is_answered: true,
      accepted_answer_id: 67890,
      answer_count: 1,
    },
  ],
};

const MOCK_ANSWERS_JSON = {
  items: [
    {
      answer_id: 67890,
      question_id: 12345,
      score: 85,
      is_accepted: true,
      body: "<p>Here is an iterative implementation:</p><pre><code>function binarySearch(arr: number[], target: number): number {\n  let low = 0, high = arr.length - 1;\n  while (low &lt;= high) {\n    const mid = (low + high) &gt;&gt; 1;\n    if (arr[mid] === target) return mid;\n    if (arr[mid] &lt; target) low = mid + 1;\n    else high = mid - 1;\n  }\n  return -1;\n}</code></pre>",
      owner: { display_name: "AlgorithmExpert" },
      creation_date: 1672531199,
    },
  ],
};

test("StackExchangeActor parses questions, fetches answers, and formats instruction pairs", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (req.url?.includes("/answers")) {
      res.end(JSON.stringify(MOCK_ANSWERS_JSON));
    } else {
      res.end(JSON.stringify(MOCK_QUESTIONS_JSON));
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/2.3/search/advanced?site=stackoverflow`;

  try {
    const actor = new StackExchangeActor();
    const result = await actor.run(
      {
        taskId: "test-stack-1",
        actorType: "stack-exchange",
        targetUrl,
        options: {
          stackExchangeOptions: {
            query: "binary search",
            site: "stackoverflow",
            minScore: 10,
            acceptedOnly: true,
          },
        },
      },
      {
        task: { taskId: "test-stack-1", actorType: "stack-exchange", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.totalItems, 1);
    assert.equal(result.data.site, "stackoverflow");

    const q = result.data.questions[0];
    assert.equal(q.questionId, 12345);
    assert.equal(q.title, "How to implement binary search in TypeScript?");
    assert.ok(q.bodyMarkdown.includes("What is the most concise way"));
    assert.equal(q.score, 42);
    assert.deepEqual(q.tags, ["typescript", "algorithm", "binary-search"]);
    assert.equal(q.answers.length, 1);

    const a = q.answers[0];
    assert.equal(a.answerId, 67890);
    assert.equal(a.isAccepted, true);
    assert.equal(a.authorName, "AlgorithmExpert");
    assert.ok(a.bodyMarkdown.includes("function binarySearch"));

    // Verify instructionPair formatted for LLM training / reasoning
    assert.ok(q.instructionPair);
    assert.ok(q.instructionPair.prompt.includes("### Problem:"));
    assert.ok(q.instructionPair.prompt.includes("How to implement binary search"));
    assert.ok(q.instructionPair.completion.includes("### Solution:"));
    assert.ok(q.instructionPair.completion.includes("function binarySearch"));
  } finally {
    server.close();
  }
});

test("StackExchangeActor handles empty search results gracefully", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ items: [], has_more: false }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/2.3/search/advanced?site=stackoverflow`;

  try {
    const actor = new StackExchangeActor();
    const result = await actor.run(
      {
        taskId: "test-stack-2",
        actorType: "stack-exchange",
        targetUrl,
      },
      {
        task: { taskId: "test-stack-2", actorType: "stack-exchange", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.data?.totalItems, 0);
    assert.deepEqual(result.data?.questions, []);
  } finally {
    server.close();
  }
});

test("StackExchangeActor blocks SSRF requests to cloud metadata", async () => {
  const actor = new StackExchangeActor();
  const result = await actor.run(
    {
      taskId: "test-stack-ssrf",
      actorType: "stack-exchange",
      targetUrl: "http://169.254.169.254/latest/meta-data",
    },
    {
      task: {
        taskId: "test-stack-ssrf",
        actorType: "stack-exchange",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 403);
  assert.ok(result.errorMessage?.includes("SSRF"));
});

test("POST /api/v1/stack-exchange executes correctly via server router", async () => {
  const mockServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    if (req.url?.includes("/answers")) {
      res.end(JSON.stringify(MOCK_ANSWERS_JSON));
    } else {
      res.end(JSON.stringify(MOCK_QUESTIONS_JSON));
    }
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockServer.address() as { port: number }).port;

  const app = createServer();
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = (app.address() as { port: number }).port;

  try {
    const res = await fetch(`http://127.0.0.1:${appPort}/api/v1/stack-exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: `http://127.0.0.1:${mockPort}/2.3/search/advanced?site=stackoverflow`,
        query: "binary search",
        site: "stackoverflow",
        minScore: 5,
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      success: boolean;
      data: { questions: Array<{ title: string; score: number }> };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.questions[0].title, "How to implement binary search in TypeScript?");
    assert.equal(body.data.questions[0].score, 42);
  } finally {
    app.close();
    mockServer.close();
  }
});
