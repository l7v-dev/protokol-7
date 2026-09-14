import assert from "node:assert/strict";
import * as http from "node:http";
import test from "node:test";
import { MarkdownReaderActor } from "@/markdown-reader-actor";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";

test("MarkdownReaderActor distills article into GFM, YAML frontmatter, and TOC", async () => {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Deep Dive into Distributed Systems</title>
  <meta name="author" content="Dr. Jane Doe" />
  <meta name="description" content="An extensive technical overview of consensus protocols." />
  <meta property="og:site_name" content="Tech Journal" />
  <meta property="article:published_time" content="2026-09-10T10:00:00Z" />
</head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <header><h1>Tech Journal Banner</h1></header>
  <main>
    <article>
      <h1>Deep Dive into Distributed Systems</h1>
      <p class="byline">By Dr. Jane Doe</p>
      <p>Distributed consensus is an essential foundation for resilient databases.</p>
      <h2>Raft Consensus Algorithm</h2>
      <p>Raft decomposes consensus into leader election, log replication, and safety.</p>
      <h3>Leader Election Mechanism</h3>
      <p>Heartbeat messages reset randomized election timers on follower nodes.</p>
      <h2>Performance Comparison</h2>
      <table>
        <thead>
          <tr><th>Protocol</th><th>Latency</th><th>Fault Tolerance</th></tr>
        </thead>
        <tbody>
          <tr><td>Paxos</td><td>Medium</td><td>f nodes out of 2f+1</td></tr>
          <tr><td>Raft</td><td>Low</td><td>f nodes out of 2f+1</td></tr>
        </tbody>
      </table>
    </article>
  </main>
  <footer><p>Copyright 2026</p></footer>
</body>
</html>`;

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(htmlContent);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const targetUrl = `http://127.0.0.1:${port}/article`;

  const actor = new MarkdownReaderActor();
  const result = await actor.run(
    {
      taskId: "test-reader-1",
      actorType: "markdown-reader",
      targetUrl,
      options: {
        markdownOptions: {
          includeFrontmatter: true,
          includeTableOfContents: true,
        },
      },
    },
    {
      task: { taskId: "test-reader-1", actorType: "markdown-reader", targetUrl },
      startTime: Date.now(),
    }
  );

  server.close();

  assert.equal(result.status, "completed");
  assert.equal(result.statusCode, 200);
  assert.ok(result.data);

  // Title and metadata verification
  assert.equal(result.data.title, "Deep Dive into Distributed Systems");
  assert.ok(result.data.byline?.includes("Jane Doe"));
  assert.equal(result.data.siteName, "Tech Journal");
  assert.equal(result.data.publishedTime, "2026-09-10T10:00:00Z");

  // YAML Frontmatter verification
  assert.ok(result.data.frontmatterYaml);
  assert.ok(result.data.frontmatterYaml.startsWith("---"));
  assert.ok(result.data.frontmatterYaml.includes('title: "Deep Dive into Distributed Systems"'));
  assert.ok(result.data.frontmatterYaml.includes("estimatedTokens:"));

  // Statistics verification
  assert.ok(result.data.characterCount > 100);
  assert.ok(result.data.wordCount > 20);
  assert.ok(result.data.estimatedTokenCount > 0);

  // Table of Contents verification
  assert.ok(result.data.tableOfContents.length >= 2);
  const headings = result.data.tableOfContents.map((h) => h.text);
  assert.ok(headings.includes("Raft Consensus Algorithm"));
  assert.ok(headings.includes("Leader Election Mechanism"));
  assert.ok(headings.includes("Performance Comparison"));

  // Full document markdown contains TOC and GFM table
  assert.ok(result.data.fullDocumentMarkdown.includes("## Table of Contents"));
  assert.ok(result.data.fullDocumentMarkdown.includes("| Protocol | Latency |"));
  assert.ok(result.data.fullDocumentMarkdown.includes("Raft decomposes consensus"));
});

test("MarkdownReaderActor blocks SSRF private addresses", async () => {
  const actor = new MarkdownReaderActor();
  const targetUrl = "http://169.254.169.254/latest/meta-data/";
  const result = await actor.run(
    {
      taskId: "test-reader-ssrf",
      actorType: "markdown-reader",
      targetUrl,
    },
    {
      task: { taskId: "test-reader-ssrf", actorType: "markdown-reader", targetUrl },
      startTime: Date.now(),
    }
  );

  assert.equal(result.status, "failed");
  assert.ok(result.errorMessage?.includes("SSRF"));
});
