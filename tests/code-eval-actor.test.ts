/**
 * Unit tests for CodeEvalActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { CodeEvalActor } from "../src/actors/corpus/code-eval-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_HUMANEVAL_RESPONSE = {
  rows: [
    {
      row_idx: 0,
      row: {
        task_id: "HumanEval/0",
        prompt:
          'from typing import List\n\n\ndef has_close_elements(numbers: List[float], threshold: float) -> bool:\n    """ Check if in given list of numbers, are any two numbers closer to each other than\n    given threshold.\n    >>> has_close_elements([1.0, 2.0, 3.0], 0.5)\n    False\n    >>> has_close_elements([1.0, 2.8, 3.0, 4.0, 5.0, 2.0], 0.3)\n    True\n    """\n',
        entry_point: "has_close_elements",
        canonical_solution:
          "    for idx, elem in enumerate(numbers):\n        for idx2, elem2 in enumerate(numbers):\n            if idx != idx2:\n                distance = abs(elem - elem2)\n                if distance < threshold:\n                    return True\n\n    return False\n",
        test: "\n\nMETADATA = {\n    'author': 'jt',\n    'dataset': 'test'\n}\n\n\ndef check(candidate):\n    assert candidate([1.0, 2.0, 3.9, 4.0, 5.0, 2.2], 0.3) == True\n    assert candidate([1.0, 2.0, 3.9, 4.0, 5.0, 2.2], 0.05) == False\n",
      },
    },
  ],
  num_rows_total: 164,
};

const MOCK_MBPP_RESPONSE = {
  rows: [
    {
      row_idx: 0,
      row: {
        task_id: 1,
        text: "Write a function to find the minimum cost path to reach (m, n) from (0, 0) for the given cost matrix cost[][] and a position (m, n) in cost[][].",
        code: "R = 3\nC = 3\ndef min_cost(cost, m, n): \n\ttc = [[0 for x in range(C)] for x in range(R)] \n\ttc[0][0] = cost[0][0] \n\tfor i in range(1, m+1): \n\t\ttc[i][0] = tc[i-1][0] + cost[i][0] \n\tfor j in range(1, n+1): \n\t\ttc[0][j] = tc[0][j-1] + cost[0][j] \n\tfor i in range(1, m+1): \n\t\tfor j in range(1, n+1): \n\t\t\ttc[i][j] = min(tc[i-1][j-1], tc[i-1][j], tc[i][j-1]) + cost[i][j] \n\treturn tc[m][n]",
        test_list: [
          "assert min_cost([[1, 2, 3], [4, 8, 2], [1, 5, 3]], 2, 2) == 8",
          "assert min_cost([[2, 3, 4], [5, 9, 3], [2, 6, 4]], 2, 2) == 12",
        ],
      },
    },
  ],
  num_rows_total: 974,
};

const MOCK_SWEBENCH_RESPONSE = {
  rows: [
    {
      row_idx: 0,
      row: {
        instance_id: "pytest-dev__pytest-5221",
        repo: "pytest-dev/pytest",
        problem_statement: "Display fixture scope with --fixtures",
        patch:
          "diff --git a/src/_pytest/python.py b/src/_pytest/python.py\n--- a/src/_pytest/python.py\n+++ b/src/_pytest/python.py\n@@ -1240,6 +1240,8 @@ def showfixtures(config):\n",
        test_patch:
          "diff --git a/testing/test_fixtures.py b/testing/test_fixtures.py\n--- a/testing/test_fixtures.py\n+++ b/testing/test_fixtures.py\n",
      },
    },
  ],
  num_rows_total: 300,
};

describe("CodeEvalActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new CodeEvalActor();
    assert.equal(actor.actorType, "code-eval");
    assert.ok(actor.description.includes("code generation and evaluation"));
  });

  it("resolves parameters correctly for HumanEval, MBPP, and SWE-bench", () => {
    const actor = new CodeEvalActor();

    const humaneval = actor.resolveParameters("", { benchmark: "humaneval", limit: 30 });
    assert.equal(humaneval.benchmark, "humaneval");
    assert.equal(humaneval.dataset, "openai/openai_humaneval");
    assert.equal(humaneval.split, "test");
    assert.equal(humaneval.limit, 30);

    const mbpp = actor.resolveParameters("", { benchmark: "mbpp", split: "train" });
    assert.equal(mbpp.benchmark, "mbpp");
    assert.equal(mbpp.dataset, "google-research-datasets/mbpp");
    assert.equal(mbpp.split, "train");

    const swe = actor.resolveParameters("", { benchmark: "swe-bench" });
    assert.equal(swe.benchmark, "swe-bench");
    assert.equal(swe.dataset, "princeton-nlp/SWE-bench_Lite");
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new CodeEvalActor();
    const task: ActorTask = {
      taskId: "test-ssrf",
      actorType: "code-eval",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
      options: {
        codeEvalOptions: {
          benchmark: "humaneval",
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("parses HumanEval tasks, entry_point, canonical_solution, and test correctly", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_HUMANEVAL_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=openai%2Fopenai_humaneval`;

    try {
      const actor = new CodeEvalActor();
      const task: ActorTask = {
        taskId: "test-humaneval",
        actorType: "code-eval",
        targetUrl: mockUrl,
        options: {
          codeEvalOptions: {
            benchmark: "humaneval",
            limit: 1,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.benchmark, "humaneval");
      assert.equal(result.data.totalTasks, 1);

      const t1 = result.data.tasks[0];
      assert.equal(t1.taskId, "HumanEval/0");
      assert.equal(t1.entryPoint, "has_close_elements");
      assert.ok(t1.prompt.includes("has_close_elements"));
      assert.ok(t1.canonicalSolution?.includes("distance < threshold"));
      assert.ok(t1.test?.includes("assert candidate"));

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("# Coding Evaluation Benchmark: HUMANEVAL"));
      assert.ok(result.data.markdown.includes("### Prompt / Problem Specification"));
      assert.ok(result.data.markdown.includes("### Canonical Solution"));
      assert.ok(result.data.markdown.includes("### Verification / Unit Tests"));
    } finally {
      server.close();
    }
  });

  it("parses MBPP text, code, and test_list correctly", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_MBPP_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=google-research-datasets%2Fmbpp`;

    try {
      const actor = new CodeEvalActor();
      const task: ActorTask = {
        taskId: "test-mbpp",
        actorType: "code-eval",
        targetUrl: mockUrl,
        options: {
          codeEvalOptions: {
            benchmark: "mbpp",
            limit: 1,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.benchmark, "mbpp");

      const t = result.data.tasks[0];
      assert.equal(t.taskId, "1");
      assert.ok(t.prompt.includes("minimum cost path"));
      assert.ok(t.canonicalSolution?.includes("min_cost"));
      assert.ok(t.test?.includes("assert min_cost"));
    } finally {
      server.close();
    }
  });

  it("parses SWE-bench instance_id, problem_statement, patch, and test_patch correctly", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_SWEBENCH_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=princeton-nlp%2FSWE-bench_Lite`;

    try {
      const actor = new CodeEvalActor();
      const task: ActorTask = {
        taskId: "test-swebench",
        actorType: "code-eval",
        targetUrl: mockUrl,
        options: {
          codeEvalOptions: {
            benchmark: "swe-bench",
            limit: 1,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.benchmark, "swe-bench");

      const t = result.data.tasks[0];
      assert.equal(t.taskId, "pytest-dev__pytest-5221");
      assert.equal(t.entryPoint, "pytest-dev/pytest");
      assert.equal(t.prompt, "Display fixture scope with --fixtures");
      assert.ok(t.canonicalSolution?.includes("diff --git a/src/_pytest/python.py"));
      assert.ok(t.test?.includes("diff --git a/testing/test_fixtures.py"));
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Dataset not found." }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=not_found`;

    try {
      const actor = new CodeEvalActor();
      const task: ActorTask = {
        taskId: "test-404",
        actorType: "code-eval",
        targetUrl: mockUrl,
        options: {
          codeEvalOptions: {
            benchmark: "humaneval",
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
