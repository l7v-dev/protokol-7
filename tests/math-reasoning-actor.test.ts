/**
 * Unit tests for MathReasoningActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { MathReasoningActor } from "../src/actors/corpus/math-reasoning-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_GSM8K_RESPONSE = {
  rows: [
    {
      row_idx: 0,
      row: {
        question:
          "Natalia sold clips to 48 of her friends in April, and then she sold half as many clips in May. How many clips did Natalia sell altogether in April and May?",
        answer:
          "Natalia sold 48/2 = 24 clips in May.\nNatalia sold 48+24 = 72 clips altogether in April and May.\n#### 72",
      },
    },
    {
      row_idx: 1,
      row: {
        question:
          "Weng earns $12 an hour for babysitting. Yesterday, she just did 50 minutes of babysitting. How much did she earn?",
        answer:
          "Weng earns 12/60 = $0.2 per minute.\nWorking 50 minutes, she earned 0.2 x 50 = $10.\n#### 10",
      },
    },
  ],
  num_rows_total: 7473,
};

const MOCK_MATH_RESPONSE = {
  rows: [
    {
      row_idx: 0,
      row: {
        problem: "Find all real numbers $x$ such that $(2x-3)^2 = 25$.",
        solution:
          "Taking the square root of both sides, we get $2x-3 = 5$ or $2x-3 = -5$.\nFor $2x-3=5$, $2x=8 \\implies x=4$.\nFor $2x-3=-5$, $2x=-2 \\implies x=-1$.\nThus, the solutions are $\\boxed{4, -1}$.",
        level: "Level 2",
        type: "Algebra",
      },
    },
  ],
  num_rows_total: 1200,
};

const MOCK_SVAMP_RESPONSE = {
  rows: [
    {
      row_idx: 0,
      row: {
        Body: "Mary had 5 apples. She went to the store and bought 3 more apples.",
        Question: "How many apples does Mary have now?",
        Equation: "( 5.0 + 3.0 )",
        Answer: 8.0,
        Type: "Addition",
      },
    },
  ],
  num_rows_total: 1000,
};

describe("MathReasoningActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new MathReasoningActor();
    assert.equal(actor.actorType, "math-reasoning");
    assert.ok(actor.description.includes("Mathematical problem solving"));
  });

  it("resolves parameters correctly for GSM8K, MATH, SVAMP, and OlympiadBench", () => {
    const actor = new MathReasoningActor();

    const gsm8k = actor.resolveParameters("", { benchmark: "gsm8k", limit: 25 });
    assert.equal(gsm8k.benchmark, "gsm8k");
    assert.equal(gsm8k.dataset, "openai/gsm8k");
    assert.equal(gsm8k.config, "main");
    assert.equal(gsm8k.split, "train");
    assert.equal(gsm8k.limit, 25);

    const math = actor.resolveParameters("", {
      benchmark: "math",
      subject: "geometry",
      split: "test",
      offset: 10,
    });
    assert.equal(math.benchmark, "math");
    assert.equal(math.dataset, "EleutherAI/hendrycks_math");
    assert.equal(math.config, "geometry");
    assert.equal(math.split, "test");
    assert.equal(math.offset, 10);

    const svamp = actor.resolveParameters("", { benchmark: "svamp" });
    assert.equal(svamp.benchmark, "svamp");
    assert.equal(svamp.dataset, "ChilleD/SVAMP");

    const olympiad = actor.resolveParameters("", { benchmark: "olympiadbench" });
    assert.equal(olympiad.benchmark, "olympiadbench");
    assert.equal(olympiad.dataset, "HuggingFaceH4/OlympiadBench");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new MathReasoningActor();
    const task: ActorTask = {
      taskId: "test-ssrf",
      actorType: "math-reasoning",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
      options: {
        mathReasoningOptions: {
          benchmark: "gsm8k",
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("parses GSM8K questions, reasoning steps, and #### answer correctly", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_GSM8K_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=openai%2Fgsm8k`;

    try {
      const actor = new MathReasoningActor();
      const task: ActorTask = {
        taskId: "test-gsm8k",
        actorType: "math-reasoning",
        targetUrl: mockUrl,
        options: {
          mathReasoningOptions: {
            benchmark: "gsm8k",
            split: "train",
            limit: 2,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.benchmark, "gsm8k");
      assert.equal(result.data.totalProblems, 2);

      const p1 = result.data.problems[0];
      assert.ok(p1.problem.includes("Natalia sold clips"));
      assert.ok(p1.reasoning.includes("Natalia sold 48/2 = 24 clips in May."));
      assert.equal(p1.answer, "72");

      const p2 = result.data.problems[1];
      assert.ok(p2.problem.includes("Weng earns $12 an hour"));
      assert.equal(p2.answer, "10");

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("# Mathematical Reasoning Corpus: GSM8K"));
      assert.ok(result.data.markdown.includes("### Chain-of-Thought (Reasoning Steps)"));
      assert.ok(result.data.markdown.includes("### Final Answer"));
      assert.ok(result.data.markdown.includes("`72`"));
    } finally {
      server.close();
    }
  });

  it("parses Hendrycks MATH problems and extracts \\boxed{...} answer", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_MATH_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=EleutherAI%2Fhendrycks_math`;

    try {
      const actor = new MathReasoningActor();
      const task: ActorTask = {
        taskId: "test-math-boxed",
        actorType: "math-reasoning",
        targetUrl: mockUrl,
        options: {
          mathReasoningOptions: {
            benchmark: "math",
            subject: "algebra",
            limit: 1,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.benchmark, "math");
      assert.equal(result.data.totalProblems, 1);

      const p = result.data.problems[0];
      assert.ok(p.problem.includes("(2x-3)^2 = 25"));
      assert.equal(p.boxedAnswer, "4, -1");
      assert.equal(p.answer, "4, -1");
      assert.equal(p.level, "Level 2");
      assert.equal(p.subject, "Algebra");

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("$\\boxed{4, -1}$"));
    } finally {
      server.close();
    }
  });

  it("parses SVAMP Body, Question, Equation, and Answer", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_SVAMP_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=ChilleD%2FSVAMP`;

    try {
      const actor = new MathReasoningActor();
      const task: ActorTask = {
        taskId: "test-svamp",
        actorType: "math-reasoning",
        targetUrl: mockUrl,
        options: {
          mathReasoningOptions: {
            benchmark: "svamp",
            limit: 1,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.benchmark, "svamp");

      const p = result.data.problems[0];
      assert.equal(
        p.problem,
        "Mary had 5 apples. She went to the store and bought 3 more apples. How many apples does Mary have now?"
      );
      assert.equal(p.reasoning, "( 5.0 + 3.0 )");
      assert.equal(p.answer, "8");
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "The dataset does not exist." }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=not_found`;

    try {
      const actor = new MathReasoningActor();
      const task: ActorTask = {
        taskId: "test-404",
        actorType: "math-reasoning",
        targetUrl: mockUrl,
        options: {
          mathReasoningOptions: {
            benchmark: "gsm8k",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 404);
      assert.ok(result.errorMessage?.includes("Datasets API returned HTTP 404"));
    } finally {
      server.close();
    }
  });
});
