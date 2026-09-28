/**
 * Unit tests for HuggingFaceDatasetsActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { HuggingFaceDatasetsActor } from "../src/actors/corpus/huggingface-datasets-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_ROWS_RESPONSE = {
  rows: [
    {
      row_idx: 0,
      row: {
        question:
          "Natalia sold clips to 48 of her friends in April, and then she sold half as many clips in May. How many clips did Natalia sell altogether in April and May?",
        answer:
          "Natalia sold 48/2 = 24 clips in May.\nNatalia sold 48+24 = 72 clips altogether in April and May.\n#### 72",
      },
      truncated_cells: [],
    },
    {
      row_idx: 1,
      row: {
        question:
          "Weng earns $12 an hour for babysitting. Yesterday, she just did 50 minutes of babysitting. How much did she earn?",
        answer:
          "Weng earns 12/60 = $0.2 per minute.\nWorking 50 minutes, she earned 0.2 x 50 = $10.\n#### 10",
      },
      truncated_cells: [],
    },
  ],
  features: [
    {
      feature_idx: 0,
      name: "question",
      type: { dtype: "string", _type: "Value" },
    },
    {
      feature_idx: 1,
      name: "answer",
      type: { dtype: "string", _type: "Value" },
    },
  ],
  num_rows_per_page: 100,
  num_rows_total: 7473,
};

const MOCK_SPLITS_RESPONSE = {
  splits: [
    { dataset: "openai/gsm8k", config: "main", split: "train", num_rows: 7473 },
    { dataset: "openai/gsm8k", config: "main", split: "test", num_rows: 1319 },
    { dataset: "openai/gsm8k", config: "socratic", split: "train", num_rows: 7473 },
    { dataset: "openai/gsm8k", config: "socratic", split: "test", num_rows: 1319 },
  ],
};

const MOCK_INFO_RESPONSE = {
  dataset_info: {
    main: {
      description:
        "GSM8K (Grade School Math 8K) is a dataset of 8,500 high quality linguistically diverse grade school math word problems.",
      homepage: "https://github.com/openai/grade-school-math",
      license: "mit",
      citation:
        "@article{cobbe2021gsm8k,\n  title={Training Verifiers to Solve Math Word Problems},\n  author={Cobbe, Karl and Kosaraju, Vineet and Bavarian, Mohammad and Chen, Mark and Jun, Heewoo and Kaiser, Lukasz and Plappert, Matthias and Tworek, Jerry and Hilton, Jacob and Nakano, Reiichiro and Hesse, Christopher and Schulman, John},\n  journal={arXiv preprint arXiv:2110.14168},\n  year={2021}\n}",
    },
  },
};

describe("HuggingFaceDatasetsActor", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new HuggingFaceDatasetsActor();
    assert.equal(actor.actorType, "huggingface-datasets");
    assert.ok(actor.description.includes("Hugging Face Datasets Server API"));
  });

  it("resolves parameters and action from targetUrl and options", () => {
    const actor = new HuggingFaceDatasetsActor();

    // From options
    const p1 = actor.resolveParameters("", {
      dataset: "openai/gsm8k",
      config: "main",
      split: "train",
      action: "rows",
      offset: 10,
      limit: 30,
    });
    assert.equal(p1.dataset, "openai/gsm8k");
    assert.equal(p1.config, "main");
    assert.equal(p1.split, "train");
    assert.equal(p1.action, "rows");
    assert.equal(p1.offset, 10);
    assert.equal(p1.limit, 30);

    // From web URL
    const p2 = actor.resolveParameters("https://huggingface.co/datasets/tatsu-lab/alpaca", {
      dataset: "",
    });
    assert.equal(p2.dataset, "tatsu-lab/alpaca");
    assert.equal(p2.action, "rows");

    // From datasets-server URL with params
    const p3 = actor.resolveParameters(
      "https://datasets-server.huggingface.co/splits?dataset=HuggingFaceH4%2Fno_robots",
      { dataset: "" }
    );
    assert.equal(p3.dataset, "HuggingFaceH4/no_robots");
    assert.equal(p3.action, "splits");
  });

  it("builds correct endpoint URLs for rows, splits, and info", () => {
    const actor = new HuggingFaceDatasetsActor();

    const rowsUrl = actor.buildEndpointUrl("", {
      action: "rows",
      dataset: "openai/gsm8k",
      config: "main",
      split: "train",
      offset: 0,
      limit: 25,
    });
    assert.ok(rowsUrl.includes("/rows?dataset=openai%2Fgsm8k"));
    assert.ok(rowsUrl.includes("config=main"));
    assert.ok(rowsUrl.includes("split=train"));
    assert.ok(rowsUrl.includes("offset=0"));
    assert.ok(rowsUrl.includes("length=25"));

    const splitsUrl = actor.buildEndpointUrl("", {
      action: "splits",
      dataset: "openai/gsm8k",
      config: "default",
      split: "train",
      offset: 0,
      limit: 20,
    });
    assert.ok(splitsUrl.includes("/splits?dataset=openai%2Fgsm8k"));

    const infoUrl = actor.buildEndpointUrl("", {
      action: "info",
      dataset: "openai/gsm8k",
      config: "default",
      split: "train",
      offset: 0,
      limit: 20,
    });
    assert.ok(infoUrl.includes("/info?dataset=openai%2Fgsm8k"));
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new HuggingFaceDatasetsActor();
    const task: ActorTask = {
      taskId: "test-ssrf",
      actorType: "huggingface-datasets",
      targetUrl: "http://169.254.169.254/latest/meta-data/",
      options: {
        huggingfaceDatasetsOptions: {
          dataset: "test/dataset",
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  });

  it("fails gracefully when dataset parameter is missing", async () => {
    const actor = new HuggingFaceDatasetsActor();
    const task: ActorTask = {
      taskId: "test-missing-dataset",
      actorType: "huggingface-datasets",
      targetUrl: "",
      options: {
        huggingfaceDatasetsOptions: {
          dataset: "",
        },
      },
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 400);
    assert.ok(result.errorMessage?.includes("Dataset identifier is required"));
  });

  it("streams dataset rows and parses features and GFM Markdown preview table", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_ROWS_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=openai%2Fgsm8k`;

    try {
      const actor = new HuggingFaceDatasetsActor();
      const task: ActorTask = {
        taskId: "test-hf-rows",
        actorType: "huggingface-datasets",
        targetUrl: mockUrl,
        options: {
          huggingfaceDatasetsOptions: {
            dataset: "openai/gsm8k",
            config: "main",
            split: "train",
            action: "rows",
            limit: 2,
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.dataset, "openai/gsm8k");
      assert.equal(result.data.totalRows, 7473);
      assert.equal(result.data.rows?.length, 2);

      const r1 = result.data.rows?.[0];
      assert.ok(typeof r1?.question === "string" && r1.question.includes("Natalia sold clips"));
      assert.ok(typeof r1?.answer === "string" && r1.answer.includes("#### 72"));

      assert.equal(result.data.features?.length, 2);
      assert.equal(result.data.features?.[0].name, "question");
      assert.equal(result.data.features?.[0].type, "string");

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("# Hugging Face Dataset: openai/gsm8k"));
      assert.ok(result.data.markdown.includes("Schema Features"));
      assert.ok(result.data.markdown.includes("Natalia sold clips"));
    } finally {
      server.close();
    }
  });

  it("parses dataset splits and returns formatted markdown", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_SPLITS_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/splits?dataset=openai%2Fgsm8k`;

    try {
      const actor = new HuggingFaceDatasetsActor();
      const task: ActorTask = {
        taskId: "test-hf-splits",
        actorType: "huggingface-datasets",
        targetUrl: mockUrl,
        options: {
          huggingfaceDatasetsOptions: {
            dataset: "openai/gsm8k",
            action: "splits",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.splits?.length, 4);

      const s1 = result.data.splits?.[0];
      assert.equal(s1?.config, "main");
      assert.equal(s1?.split, "train");
      assert.equal(s1?.numRows, 7473);

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("# Hugging Face Dataset Splits: openai/gsm8k"));
      assert.ok(result.data.markdown.includes("| `main` | `train` | 7,473 |"));
    } finally {
      server.close();
    }
  });

  it("parses dataset info metadata and renders documentation card", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(MOCK_INFO_RESPONSE));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/info?dataset=openai%2Fgsm8k`;

    try {
      const actor = new HuggingFaceDatasetsActor();
      const task: ActorTask = {
        taskId: "test-hf-info",
        actorType: "huggingface-datasets",
        targetUrl: mockUrl,
        options: {
          huggingfaceDatasetsOptions: {
            dataset: "openai/gsm8k",
            action: "info",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "completed");
      assert.ok(result.data);
      assert.equal(result.data.info?.license, "mit");
      assert.ok(result.data.info?.description?.includes("8,500 high quality"));
      assert.ok(result.data.info?.citation?.includes("cobbe2021gsm8k"));

      assert.ok(result.data.markdown);
      assert.ok(result.data.markdown.includes("# Hugging Face Dataset Info: openai/gsm8k"));
      assert.ok(result.data.markdown.includes("License:** mit"));
    } finally {
      server.close();
    }
  });

  it("handles upstream HTTP error responses gracefully", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Dataset not found" }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const port = (server.address() as { port: number }).port;
    const mockUrl = `http://127.0.0.1:${port}/rows?dataset=nonexistent%2Fdataset`;

    try {
      const actor = new HuggingFaceDatasetsActor();
      const task: ActorTask = {
        taskId: "test-hf-404",
        actorType: "huggingface-datasets",
        targetUrl: mockUrl,
        options: {
          huggingfaceDatasetsOptions: {
            dataset: "nonexistent/dataset",
          },
        },
      };

      const result = await actor.run(task, { task, startTime: Date.now() });
      assert.equal(result.status, "failed");
      assert.equal(result.statusCode, 404);
      assert.ok(result.errorMessage?.includes("HTTP 404"));
    } finally {
      server.close();
    }
  });
});
