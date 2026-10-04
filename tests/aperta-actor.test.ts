import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { ApertaActor } from "../src/actors/corpus/aperta-actor";
import { createServer } from "../src/server";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_APERTA_RECORD = {
  id: "241793",
  doi: "10.48623/aperta.241793",
  created: "2022-10-18T15:00:16Z",
  metadata: {
    title: "Protein Mutation Dataset for PHACT Analysis",
    description:
      "Evolutionary conservation and structural tolerance data for protein O00476 missense mutations.",
    publication_date: "2022-10-18",
    creators: [
      { name: "Nurdan Kuru", affiliation: "Bilkent University" },
      { name: "Ogun Adebali", affiliation: "Sabanci University" },
    ],
    resource_type: { type: "dataset", title: "Dataset" },
    language: "eng",
    keywords: ["bioinformatics", "protein mutations", "phylogeny"],
    custom: {
      "aperta:science_branches": [
        { title: { tr: "Biyoinformatik ve Genetik", en: "Bioinformatics and Genetics" } },
      ],
    },
    license: "CC-BY-4.0",
  },
  files: [
    {
      id: "file-991",
      key: "O00476.tar.gz",
      size: 24230002,
      checksum: "md5:3b8ad514690620f945fecbf736bfa3b3",
      links: {
        self: "https://aperta.ulakbim.gov.tr/api/records/241793/files/O00476.tar.gz/content",
      },
    },
  ],
};

const MOCK_APERTA_SEARCH = {
  hits: {
    total: 91188,
    hits: [
      MOCK_APERTA_RECORD,
      {
        id: "242041",
        doi: "10.48623/aperta.242041",
        created: "2022-10-18T15:05:25Z",
        metadata: {
          title: "Deep Learning for Turkish NLP Sentiment Analysis",
          description:
            "Benchmark dataset comprising Turkish product reviews annotated with sentiment polarity.",
          publication_date: "2022-10-18",
          creators: [{ name: "Ahmet Yilmaz", affiliation: "ITU" }],
          resource_type: { type: "dataset", title: "Dataset" },
          language: "tur",
          keywords: ["nlp", "turkish", "sentiment"],
          custom: {
            "aperta:science_branches": [
              { title: { tr: "Bilgisayar Bilimleri", en: "Computer Sciences" } },
            ],
          },
        },
        files: [],
      },
    ],
  },
};

test("ApertaActor - search_records returns normalized records and markdown", async (t) => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK_APERTA_SEARCH));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const address = mockServer.address() as { port: number };
  const mockUrl = `http://127.0.0.1:${address.port}/api/records`;

  t.after(() => {
    mockServer.close();
  });

  const actor = new ApertaActor();
  const result = await actor.run(
    {
      taskId: "task-aperta-1",
      actorType: "aperta",
      targetUrl: mockUrl,
      options: {
        apertaOptions: {
          action: "search_records",
          query: "protein",
        },
      },
    },
    {
      task: { taskId: "task-aperta-1", actorType: "aperta", targetUrl: mockUrl },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "completed");
  assert.equal(result.actorType, "aperta");
  assert.ok(result.data);
  assert.equal(result.data.totalCount, 91188);
  assert.equal(result.data.records.length, 2);

  const first = result.data.records[0];
  assert.equal(first.id, "241793");
  assert.equal(first.title, "Protein Mutation Dataset for PHACT Analysis");
  assert.equal(first.resourceType, "dataset");
  assert.equal(first.fileCount, 1);
  assert.equal(first.totalFileSize, 24230002);
  assert.ok(first.files);
  assert.equal(first.files[0].key, "O00476.tar.gz");
  assert.ok(result.data.markdown.includes("Protein Mutation Dataset"));
});

test("ApertaActor - get_record retrieves single record with file table", async (t) => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK_APERTA_RECORD));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const address = mockServer.address() as { port: number };
  const mockUrl = `http://127.0.0.1:${address.port}/api/records/241793`;

  t.after(() => {
    mockServer.close();
  });

  const actor = new ApertaActor();
  const result = await actor.run(
    {
      taskId: "task-aperta-2",
      actorType: "aperta",
      targetUrl: mockUrl,
      options: {
        apertaOptions: {
          action: "get_record",
          recordId: "241793",
        },
      },
    },
    {
      task: { taskId: "task-aperta-2", actorType: "aperta", targetUrl: mockUrl },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "completed");
  assert.ok(result.data);
  assert.equal(result.data.records.length, 1);
  const rec = result.data.records[0];
  assert.equal(rec.id, "241793");
  assert.equal(rec.doi, "10.48623/aperta.241793");
  assert.ok(rec.creators?.includes("Nurdan Kuru"));
  assert.ok(result.data.markdown.includes("### Attached Files"));
  assert.ok(result.data.markdown.includes("O00476.tar.gz"));
});

test("ApertaActor - handles HTTP 404 / 500 error gracefully", async (t) => {
  const mockServer = http.createServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Internal server error" }));
  });

  await new Promise<void>((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
  const address = mockServer.address() as { port: number };
  const mockUrl = `http://127.0.0.1:${address.port}/api/records`;

  t.after(() => {
    mockServer.close();
  });

  const actor = new ApertaActor();
  const result = await actor.run(
    {
      taskId: "task-aperta-err",
      actorType: "aperta",
      targetUrl: mockUrl,
      options: {
        apertaOptions: {
          action: "search_records",
        },
      },
    },
    {
      task: { taskId: "task-aperta-err", actorType: "aperta", targetUrl: mockUrl },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.equal(result.statusCode, 500);
  assert.ok(result.errorMessage?.includes("HTTP 500"));
});

test("HTTP Server - POST /api/v1/aperta dispatches to ApertaActor", async (t) => {
  const mockApertaApi = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(MOCK_APERTA_SEARCH));
  });

  await new Promise<void>((resolve) => mockApertaApi.listen(0, "127.0.0.1", resolve));
  const mockPort = (mockApertaApi.address() as { port: number }).port;
  const mockUrl = `http://127.0.0.1:${mockPort}/api/records`;

  const appServer = createServer();
  await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  const appPort = (appServer.address() as { port: number }).port;

  t.after(() => {
    mockApertaApi.close();
    appServer.close();
  });

  const response = await fetch(`http://127.0.0.1:${appPort}/api/v1/aperta`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "search_records",
      query: "protein",
      targetUrl: mockUrl,
    }),
  });

  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    success: boolean;
    data: { totalCount: number; records: Array<{ id: string }> };
  };
  assert.equal(json.success, true);
  assert.equal(json.data.totalCount, 91188);
  assert.equal(json.data.records.length, 2);
  assert.equal(json.data.records[0].id, "241793");
});
