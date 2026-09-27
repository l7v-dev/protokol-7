import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { OpenFdaActor } from "../src/actors/open-fda-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_OPEN_FDA_LABEL_JSON = {
  meta: {
    disclaimer: "Do not rely on openFDA to make decisions regarding medical care.",
    terms: "https://open.fda.gov/terms/",
    license: "https://open.fda.gov/license/",
    last_updated: "2024-05-01",
    results: {
      skip: 0,
      limit: 1,
      total: 1,
    },
  },
  results: [
    {
      openfda: {
        brand_name: ["Advil"],
        generic_name: ["Ibuprofen"],
        manufacturer_name: ["GlaxoSmithKline Consumer Healthcare Holdings (US) LLC"],
        product_type: ["HUMAN OTC DRUG"],
      },
      indications_and_usage: [
        "Temporarily relieves minor aches and pains due to headache, toothache, backache.",
      ],
      warnings: ["Allergy alert: Ibuprofen may cause a severe allergic reaction."],
      dosage_and_administration: ["Take 1 tablet every 4 to 6 hours while symptoms persist."],
    },
  ],
};

const MOCK_OPEN_FDA_DEVICE_JSON = {
  meta: {
    results: {
      skip: 0,
      limit: 1,
      total: 1,
    },
  },
  results: [
    {
      k_number: "K192837",
      device_name: "Automated External Defibrillator",
      applicant: "Cardiac Science Corp",
      decision_date: "2020-04-15",
      statement_or_summary: "Summary",
    },
  ],
};

test("OpenFdaActor queries drug label dataset and normalizes results", async () => {
  let interceptedSearch: string | null = null;
  let interceptedLimit: string | null = null;

  const server = http.createServer((req, res) => {
    const parsed = new URL(req.url || "", "http://127.0.0.1");
    interceptedSearch = parsed.searchParams.get("search");
    interceptedLimit = parsed.searchParams.get("limit");

    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_OPEN_FDA_LABEL_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/drug/label.json`;

  try {
    const actor = new OpenFdaActor();
    const result = await actor.run(
      {
        taskId: "test-fda-1",
        actorType: "open-fda",
        targetUrl,
        options: {
          openFdaOptions: {
            endpoint: "drug/label",
            search: "ibuprofen",
            limit: 5,
          },
        },
      },
      {
        task: { taskId: "test-fda-1", actorType: "open-fda", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.total, 1);
    assert.equal(result.data.endpoint, "drug/label");
    assert.equal(result.data.results.length, 1);

    assert.ok(result.data.markdown?.includes("# openFDA Dataset Results (drug/label)"));
    assert.ok(result.data.markdown?.includes("Brand Name**: Advil"));
    assert.ok(result.data.markdown?.includes("Generic Name**: Ibuprofen"));
    assert.ok(String(interceptedSearch).includes("ibuprofen"));
    assert.equal(interceptedLimit, "5");
  } finally {
    server.close();
  }
});

test("OpenFdaActor queries device 510(k) clearances", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(MOCK_OPEN_FDA_DEVICE_JSON));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/device/510k.json`;

  try {
    const actor = new OpenFdaActor();
    const result = await actor.run(
      {
        taskId: "test-fda-2",
        actorType: "open-fda",
        targetUrl,
        options: {
          openFdaOptions: {
            endpoint: "device/510k",
            search: "defibrillator",
          },
        },
      },
      {
        task: { taskId: "test-fda-2", actorType: "open-fda", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.results.length, 1);
    assert.ok(result.data.markdown?.includes("510(k) Number**: K192837"));
    assert.ok(result.data.markdown?.includes("Cardiac Science Corp"));
  } finally {
    server.close();
  }
});

test("OpenFdaActor handles 404 gracefully when query returns no matches", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "No matches found!" } }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/drug/label.json`;

  try {
    const actor = new OpenFdaActor();
    const result = await actor.run(
      {
        taskId: "test-fda-404",
        actorType: "open-fda",
        targetUrl,
        options: {
          openFdaOptions: {
            search: "nonexistent_drug_123456",
          },
        },
      },
      {
        task: { taskId: "test-fda-404", actorType: "open-fda", targetUrl },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.equal(result.statusCode, 200);
    assert.ok(result.data);
    assert.equal(result.data.total, 0);
    assert.equal(result.data.results.length, 0);
  } finally {
    server.close();
  }
});

test("OpenFdaActor blocks SSRF private addresses", async () => {
  const actor = new OpenFdaActor();
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const result = await actor.run(
      {
        taskId: "test-fda-ssrf",
        actorType: "open-fda",
        targetUrl: "http://10.0.0.1/drug/label.json",
      },
      {
        task: {
          taskId: "test-fda-ssrf",
          actorType: "open-fda",
          targetUrl: "http://10.0.0.1/drug/label.json",
        },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF validation failed"));
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});
