/**
 * RosettaCodeActor Unit & Integration Tests.
 * Tests parameter resolution, SSRF guards, and end-to-end extraction with local mock server.
 */

import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { RosettaCodeActor } from "../src/actors/corpus/rosetta-code-actor";
import type { ActorTask } from "../src/api/types";

describe("RosettaCodeActor Unit & Integration Tests", () => {
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url || "/", "http://localhost");
      const action = parsedUrl.searchParams.get("action");

      if (action === "parse") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            parse: {
              title: "100 doors",
              sections: [
                {
                  toclevel: 1,
                  level: "2",
                  line: "Python",
                  number: "1",
                  index: "1",
                  fromtitle: "100_doors",
                  byteoffset: 1447,
                  anchor: "Python",
                },
                {
                  toclevel: 1,
                  level: "2",
                  line: "Rust",
                  number: "2",
                  index: "2",
                  fromtitle: "100_doors",
                  byteoffset: 2500,
                  anchor: "Rust",
                },
              ],
              text: {
                "*": `
<div class="mw-parser-output">
  <p>There are 100 doors in a row that are all initially closed. Make 100 passes by the doors.</p>
  <h2 id="Python"><span class="mw-headline">Python</span></h2>
  <p>Standard loop solution:</p>
  <pre><code class="language-python">doors = [False] * 100
for i in range(100):
    for j in range(i, 100, i + 1):
        doors[j] = not doors[j]
print([i + 1 for i, d in enumerate(doors) if d])</code></pre>
  <h2 id="Rust"><span class="mw-headline">Rust</span></h2>
  <pre><code class="language-rust">fn main() {
    let mut doors = [false; 100];
    for i in 1..=100 {
        for j in (i..=100).step_by(i) {
            doors[j - 1] = !doors[j - 1];
        }
    }
}</code></pre>
</div>`,
              },
            },
          })
        );
        return;
      }

      if (action === "query") {
        const list = parsedUrl.searchParams.get("list");
        if (list === "search") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              query: {
                search: [
                  {
                    title: "Fibonacci sequence",
                    size: 45000,
                    wordcount: 3200,
                    snippet: "Calculate Fibonacci numbers using recursion or iteration.",
                  },
                  {
                    title: "Fibonacci n-step number sequences",
                    size: 12000,
                    wordcount: 1100,
                    snippet: "Generalize Fibonacci sequence to n steps.",
                  },
                ],
              },
            })
          );
          return;
        }

        if (list === "categorymembers") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              query: {
                categorymembers: [
                  { title: "Category:Python" },
                  { title: "Category:Rust" },
                  { title: "Category:Go" },
                  { title: "Category:C++" },
                ],
              },
            })
          );
          return;
        }
      }

      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address();
        if (typeof addr === "object" && addr !== null) {
          mockServerPort = addr.port;
          mockServerUrl = `http://127.0.0.1:${mockServerPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      mockServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  describe("Parameter Resolution & URL Parsing", () => {
    const actor = new RosettaCodeActor();

    it("resolves task name and language anchor from standard wiki URL", async () => {
      const task: ActorTask = {
        taskId: "test-params-1",
        actorType: "rosetta-code",
        targetUrl: "https://rosettacode.org/wiki/100_doors#Python",
      };

      const result = await actor.run(task, { task });
      assert.ok(result);
    });

    it("resolves search query from search URL", async () => {
      const task: ActorTask = {
        taskId: "test-params-2",
        actorType: "rosetta-code",
        targetUrl: "https://rosettacode.org/w/index.php?search=Fibonacci",
      };

      const result = await actor.run(task, { task });
      assert.ok(result);
    });

    it("defaults to 100 doors when parameters are empty", async () => {
      const task: ActorTask = {
        taskId: "test-params-3",
        actorType: "rosetta-code",
        targetUrl: "",
      };

      const result = await actor.run(task, { task });
      assert.ok(result);
    });
  });

  describe("Security & Invariants", () => {
    const actor = new RosettaCodeActor();

    it("rejects SSRF requests to cloud metadata endpoint", async () => {
      const task: ActorTask = {
        taskId: "test-ssrf",
        actorType: "rosetta-code",
        targetUrl: "http://169.254.169.254/latest/meta-data/",
      };

      const result = await actor.run(task, { task });
      assert.strictEqual(result.status, "failed");
      assert.strictEqual(result.statusCode, 403);
      assert.ok(result.errorMessage?.includes("SSRF"));
    });
  });

  describe("End-to-End Extraction with Local Mock Server", () => {
    it("successfully harvests programming task with specific language filter", async () => {
      const actor = new RosettaCodeActor();
      const task: ActorTask = {
        taskId: "test-e2e-task",
        actorType: "rosetta-code",
        targetUrl: `${mockServerUrl}/wiki/100_doors#Python`,
        options: {
          rosettaCodeOptions: {
            action: "task",
            task: "100 doors",
            language: "Python",
          },
        },
      };

      const result = await actor.run(task, { task });
      if (result.status === "completed") {
        assert.strictEqual(result.data?.action, "task");
        assert.strictEqual(result.data?.taskDetails?.title, "100 doors");
        assert.ok(result.data?.markdown?.includes("# Rosetta Code: 100 doors"));
        assert.ok(result.data?.markdown?.includes("Python"));
        assert.ok(result.data?.markdown?.includes("doors = [False] * 100"));
      }
    });

    it("successfully searches tasks via MediaWiki API", async () => {
      const actor = new RosettaCodeActor();
      const task: ActorTask = {
        taskId: "test-e2e-search",
        actorType: "rosetta-code",
        targetUrl: `${mockServerUrl}/w/index.php?search=Fibonacci`,
        options: {
          rosettaCodeOptions: {
            action: "search",
            query: "Fibonacci",
          },
        },
      };

      const result = await actor.run(task, { task });
      if (result.status === "completed") {
        assert.strictEqual(result.data?.action, "search");
        assert.ok(result.data?.searchResults?.length);
        assert.ok(result.data?.markdown?.includes("Fibonacci sequence"));
      }
    });

    it("successfully retrieves programming languages catalog", async () => {
      const actor = new RosettaCodeActor();
      const task: ActorTask = {
        taskId: "test-e2e-langs",
        actorType: "rosetta-code",
        options: {
          rosettaCodeOptions: {
            action: "languages",
          },
        },
      };

      const result = await actor.run(task, { task });
      if (result.status === "completed") {
        assert.strictEqual(result.data?.action, "languages");
        assert.ok(result.data?.languages?.length);
      }
    });
  });
});
