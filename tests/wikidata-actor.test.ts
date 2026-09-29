/**
 * Unit and integration tests for WikidataActor.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { describe, it } from "node:test";
import { WikidataActor } from "../src/actors/corpus/wikidata-actor";
import type { ActorTask } from "../src/api/types";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const MOCK_ENTITY_JSON = {
  entities: {
    Q42: {
      id: "Q42",
      labels: {
        en: { language: "en", value: "Douglas Adams" },
        tr: { language: "tr", value: "Douglas Adams" },
      },
      descriptions: {
        en: { language: "en", value: "English author and humorist" },
      },
      claims: {
        P31: [
          {
            mainsnak: {
              property: "P31",
              datatype: "wikibase-item",
              datavalue: { value: { id: "Q5" } },
            },
          },
        ],
      },
    },
  },
};

const MOCK_SEARCH_JSON = {
  search: [
    {
      id: "Q42",
      title: "Q42",
      label: "Douglas Adams",
      description: "English author and humorist",
      concepturi: "http://www.wikidata.org/entity/Q42",
    },
  ],
};

const MOCK_SPARQL_JSON = {
  head: { vars: ["item", "itemLabel"] },
  results: {
    bindings: [
      {
        item: { type: "uri", value: "http://www.wikidata.org/entity/Q42" },
        itemLabel: { type: "literal", value: "Douglas Adams" },
      },
    ],
  },
};

describe("WikidataActor Unit & Integration Tests", () => {
  const actor = new WikidataActor();

  describe("Parameter Resolution & URL Parsing", () => {
    it("resolves entity ID from Wikidata URL", () => {
      const res = actor.resolveParameters("https://www.wikidata.org/wiki/Q42", {});
      assert.strictEqual(res.entityId, "Q42");
      assert.strictEqual(res.action, "entity");
    });

    it("resolves SPARQL query from URL", () => {
      const res = actor.resolveParameters(
        "https://query.wikidata.org/sparql?query=SELECT%20*%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D",
        {}
      );
      assert.strictEqual(res.action, "sparql");
      assert.ok(res.sparql?.includes("SELECT"));
    });
  });

  describe("Security & Invariants", () => {
    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf-metadata",
        actorType: "wikidata",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    let server: http.Server;
    let serverPort: number;

    it("starts local mock Wikidata HTTP server", async () => {
      server = http.createServer((req, res) => {
        const url = req.url || "";
        if (url.includes("action=wbgetentities")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(MOCK_ENTITY_JSON));
        } else if (url.includes("action=wbsearchentities")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(MOCK_SEARCH_JSON));
        } else if (url.includes("sparql?query=")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(MOCK_SPARQL_JSON));
        } else {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not Found");
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          if (addr && typeof addr === "object") {
            serverPort = addr.port;
          }
          resolve();
        });
      });
      assert.ok(serverPort > 0);
    });

    it("successfully harvests entity records and claims", async () => {
      const task: ActorTask = {
        taskId: "test-entity",
        actorType: "wikidata",
        targetUrl: `http://127.0.0.1:${serverPort}/w/api.php?action=wbgetentities&ids=Q42&format=json`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items);
      assert.strictEqual(result.data.items[0].id, "Q42");
      assert.strictEqual(result.data.items[0].label, "Douglas Adams");
      assert.ok(result.data.items[0].claims?.P31);
    });

    it("successfully executes entity search", async () => {
      const task: ActorTask = {
        taskId: "test-search",
        actorType: "wikidata",
        targetUrl: `http://127.0.0.1:${serverPort}/w/api.php?action=wbsearchentities&search=adams&format=json`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.items);
      assert.strictEqual(result.data.items[0].label, "Douglas Adams");
    });

    it("successfully executes SPARQL queries", async () => {
      const task: ActorTask = {
        taskId: "test-sparql",
        actorType: "wikidata",
        targetUrl: `http://127.0.0.1:${serverPort}/sparql?query=SELECT%20*%20WHERE%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D&format=json`,
      };

      const result = await actor.run(task);
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.sparqlResults);
      assert.strictEqual(result.data.sparqlResults.results.bindings.length, 1);
      assert.ok(result.data.markdown?.includes("Douglas Adams"));
    });

    it("stops local mock HTTP server", async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  });
});
