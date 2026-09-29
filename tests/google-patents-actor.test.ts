/**
 * GooglePatentsActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { GooglePatentsActor } from "../src/actors/corpus/google-patents-actor";
import type { ActorTask } from "../src/api/types";

describe("GooglePatentsActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const path = parsedUrl.pathname;

      if (path.includes("/patent/US10123456B2/en")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            patentId: "US10123456B2",
            title: "Cryptographic Distributed Consensus Engine",
            abstract:
              "A high-performance cryptographic consensus protocol for distributed ledgers.",
            filingDate: "2018-05-12",
            publicationDate: "2020-03-24",
            inventors: ["Satoshi Nakamoto", "Hal Finney"],
            assignees: ["Open Technology Labs LLC"],
            cpcClassifications: ["H04L9/32", "G06F21/64"],
            claims: [
              {
                number: 1,
                claimId: "claim-1",
                text: "A system for distributed consensus comprising a network interface and a hardware processor.",
                isIndependent: true,
              },
              {
                number: 2,
                claimId: "claim-2",
                text: "The system of claim 1, further comprising a zero-knowledge proof validator.",
                isIndependent: false,
                dependentOn: 1,
              },
            ],
            description:
              "Detailed description of the cryptographic mechanisms and protocol pipelines.",
          })
        );
        return;
      }

      if (path === "/" && parsedUrl.searchParams.has("q")) {
        const _query = parsedUrl.searchParams.get("q") || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            results: [
              {
                patentId: "US10123456B2",
                title: "Cryptographic Distributed Consensus Engine",
                abstract: "A high-performance cryptographic consensus protocol.",
                filingDate: "2018-05-12",
                publicationDate: "2020-03-24",
                jurisdiction: "US",
              },
              {
                patentId: "EP3123456A1",
                title: "Scalable Blockchain Sharding Architecture",
                abstract: "Cross-shard messaging with atomic commit guarantees.",
                filingDate: "2019-01-15",
                publicationDate: "2021-07-20",
                jurisdiction: "EP",
              },
            ],
          })
        );
        return;
      }

      if (path.includes("/html-patent")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta name="DC.title" content="Quantum Error Correction Apparatus" />
              <meta name="DC.contributor" content="John Preskill" />
              <meta name="DC.date" scheme="issue" content="2022-08-16" />
            </head>
            <body>
              <section itemprop="abstract">
                <div class="abstract">Fault-tolerant surface code layout for superconducting qubits.</div>
              </section>
              <section itemprop="claims">
                <div class="claim">1. An apparatus for quantum error suppression comprising ancilla resonators.</div>
                <div class="claim">2. The apparatus of claim 1, wherein each ancilla resonator operates at microwave frequencies.</div>
              </section>
              <section itemprop="description">
                <div class="description">Surface codes protect quantum information against local phase flips.</div>
              </section>
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (addr && typeof addr === "object") {
          mockServerPort = addr.port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });

  describe("Parameter Resolution & Security", () => {
    it("resolves patentId and action correctly", () => {
      const actor = new GooglePatentsActor();
      assert.strictEqual(
        actor.resolvePatentId("https://patents.google.com/patent/US9876543B1/en"),
        "US9876543B1"
      );
      assert.strictEqual(actor.resolvePatentId(undefined, "ep1234567a1"), "EP1234567A1");

      assert.strictEqual(
        actor.resolveAction("https://patents.google.com/patent/US9876543B1/claims"),
        "claims"
      );
      assert.strictEqual(
        actor.resolveAction("https://patents.google.com/patent/US9876543B1/en"),
        "patent"
      );
      assert.strictEqual(actor.resolveAction(undefined, "search"), "search");
    });

    it("builds correct search query endpoint URL", () => {
      const actor = new GooglePatentsActor();
      const url = actor.buildEndpointUrl(undefined, "search", {
        query: "quantum computing",
        inventor: "preskill",
        country: "US",
        status: "grant",
      });

      assert.ok(url.includes("quantum+computing"));
      assert.ok(url.includes("inventor%3A%28preskill%29"));
      assert.ok(url.includes("country%3AUS"));
      assert.ok(url.includes("status%3AGRANT"));
    });

    it("blocks SSRF attempts on metadata IP", async () => {
      const actor = new GooglePatentsActor();
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "google-patents",
        targetUrl: "http://169.254.169.254/latest/meta-data",
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.match(result.errorMessage || "", /SSRF/);
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("extracts full patent dossier with claims and classifications", async () => {
      const actor = new GooglePatentsActor();
      const task: ActorTask = {
        taskId: "test-patents-dossier",
        actorType: "google-patents",
        targetUrl: `${mockServerUrl}/patent/US10123456B2/en`,
        options: {
          googlePatentsOptions: {
            action: "patent",
            patentId: "US10123456B2",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.patent);
      assert.strictEqual(result.data.patent.patentId, "US10123456B2");
      assert.strictEqual(result.data.patent.title, "Cryptographic Distributed Consensus Engine");
      assert.strictEqual(result.data.patent.claimsCount, 2);
      assert.strictEqual(result.data.patent.claims?.[0].isIndependent, true);
      assert.strictEqual(result.data.patent.claims?.[1].isIndependent, false);
      assert.strictEqual(result.data.patent.claims?.[1].dependentOn, 1);
      assert.match(result.data.markdown || "", /# US10123456B2/);
    });

    it("extracts claims-only mode with hierarchy badges", async () => {
      const actor = new GooglePatentsActor();
      const task: ActorTask = {
        taskId: "test-patents-claims",
        actorType: "google-patents",
        targetUrl: `${mockServerUrl}/patent/US10123456B2/en`,
        options: {
          googlePatentsOptions: {
            action: "claims",
            patentId: "US10123456B2",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.claims);
      assert.strictEqual(result.data.claims.length, 2);
      assert.match(result.data.markdown || "", /INDEPENDENT CLAIM/);
      assert.match(result.data.markdown || "", /DEPENDENT ON CLAIM 1/);
    });

    it("extracts search results list", async () => {
      const actor = new GooglePatentsActor();
      const task: ActorTask = {
        taskId: "test-patents-search",
        actorType: "google-patents",
        targetUrl: `${mockServerUrl}/?q=blockchain`,
        options: {
          googlePatentsOptions: {
            action: "search",
            query: "blockchain",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.patents);
      assert.strictEqual(result.data.patents.length, 2);
      assert.strictEqual(result.data.patents[0].patentId, "US10123456B2");
      assert.strictEqual(result.data.patents[1].patentId, "EP3123456A1");
      assert.match(result.data.markdown || "", /Google Patents Search Results/);
    });

    it("parses HTML patent specification fallback", async () => {
      const actor = new GooglePatentsActor();
      const task: ActorTask = {
        taskId: "test-patents-html",
        actorType: "google-patents",
        targetUrl: `${mockServerUrl}/html-patent`,
        options: {
          googlePatentsOptions: {
            action: "patent",
            patentId: "US9999999B2",
          },
        },
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "completed");
      assert.strictEqual(result.statusCode, 200);
      assert.ok(result.data?.patent);
      assert.strictEqual(result.data.patent.title, "Quantum Error Correction Apparatus");
      assert.strictEqual(result.data.patent.inventors?.[0], "John Preskill");
      assert.strictEqual(result.data.patent.claimsCount, 2);
      assert.strictEqual(result.data.patent.claims?.[0].isIndependent, true);
      assert.strictEqual(result.data.patent.claims?.[1].isIndependent, false);
      assert.strictEqual(result.data.patent.claims?.[1].dependentOn, 1);
    });

    it("handles upstream HTTP error responses gracefully", async () => {
      const actor = new GooglePatentsActor();
      const task: ActorTask = {
        taskId: "test-patents-404",
        actorType: "google-patents",
        targetUrl: `${mockServerUrl}/not-found-patent`,
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 404);
      assert.match(result.errorMessage || "", /Upstream Google Patents request failed/);
    });
  });
});
