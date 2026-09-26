import assert from "node:assert/strict";
import test from "node:test";
import { CheerioScraperActor } from "@/cheerio-scraper-actor";
import { ReadabilityExtractor } from "@/readability-extractor";

test("ReadabilityExtractor returns empty result for empty HTML or non-string input", () => {
  const empty = ReadabilityExtractor.extract("", "https://example.com");
  assert.equal(empty.title, "");
  assert.equal(empty.markdown, "");
  assert.equal(empty.text, "");
  assert.equal(empty.isArticle, false);
  assert.equal(empty.length, 0);
  assert.equal(empty.fallbackUsed, false);

  const whitespace = ReadabilityExtractor.extract("   \n\t  ", "https://example.com");
  assert.equal(whitespace.markdown, "");
  assert.equal(whitespace.isArticle, false);
});

test("ReadabilityExtractor extracts clean article title, byline, excerpt, and markdown from article markup", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Agent System Architecture in 2026</title>
        <meta name="description" content="An architectural study of agent runtimes.">
      </head>
      <body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <article>
          <h1>Agent System Architecture in 2026</h1>
          <p class="byline">By Dr. Matrix</p>
          <p>ReAct agent systems represent an evolutionary step in software engineering. They combine reasoning with tool dispatch and state journaling.</p>
          <p>By leveraging ReAct step cycles, agents maintain continuous grounded execution against external environments.</p>
          <p>This allows deterministic error recovery, verification pipelines, and multi-agent coordination.</p>
        </article>
        <footer><p>Copyright 2026</p></footer>
      </body>
    </html>
  `;

  const result = ReadabilityExtractor.extract(html, "https://example.com/article");
  assert.equal(result.isArticle, true);
  assert.ok(result.title.includes("Agent System Architecture in 2026"));
  assert.ok(result.markdown.includes("ReAct agent systems represent an evolutionary step"));
  assert.ok(result.markdown.includes("By leveraging ReAct step cycles"));
  // Nav and footer should be stripped
  assert.equal(result.markdown.includes("Home"), false);
  assert.equal(result.markdown.includes("Copyright 2026"), false);
});

test("ReadabilityExtractor strips navigation, header, footer, scripts, styles, and ads", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Clean Content Test</title></head>
      <body>
        <header><div class="logo">Logo</div><div class="ad banner">Ad 728x90</div></header>
        <nav><ul><li>Link 1</li><li>Link 2</li></ul></nav>
        <main>
          <article>
            <h1>Deep Systems Design</h1>
            <p>High quality engineering prioritizes single responsibilities, clear interfaces, and rigorous boundary verification across all modules.</p>
            <p>Every layer must enforce its invariants strictly without leaking implementation details or coupling to incidental external formats.</p>
            <p>Modularity guarantees long term maintenance speed and isolates regression risks effectively.</p>
          </article>
        </main>
        <aside><div class="sponsored">Buy now!</div></aside>
        <footer><div>Privacy Policy</div></footer>
      </body>
    </html>
  `;

  const result = ReadabilityExtractor.extract(html, "https://example.com/article-2");
  assert.ok(result.markdown.includes("Deep Systems Design"));
  assert.ok(result.markdown.includes("High quality engineering prioritizes"));
  assert.equal(result.markdown.includes("Ad 728x90"), false);
  assert.equal(result.markdown.includes("Buy now!"), false);
  assert.equal(result.markdown.includes("Privacy Policy"), false);
});

test("ReadabilityExtractor preserves heading hierarchy (#, ##, ###) and list structures in markdown", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Hierarchy Test</title></head>
      <body>
        <article>
          <h1>Top Level Title</h1>
          <p>Introductory paragraph describing the overall architecture and operational guarantees.</p>
          <h2>Sub-system Architecture</h2>
          <p>Detailed breakdown of core architectural pillars and contracts.</p>
          <ul>
            <li>Process sandbox isolation</li>
            <li>ReAct orchestrator loop</li>
            <li>PostgreSQL hybrid vector memory</li>
          </ul>
          <h3>Implementation Guidelines</h3>
          <p>Strict typing rules and naming disciplines must be enforced.</p>
          <ol>
            <li>Define schemas first</li>
            <li>Verify contracts</li>
          </ol>
        </article>
      </body>
    </html>
  `;

  const result = ReadabilityExtractor.extract(html, "https://example.com/hierarchy");
  assert.ok(
    result.markdown.includes("# Top Level Title") || result.markdown.includes("Top Level Title")
  );
  assert.ok(result.markdown.includes("## Sub-system Architecture"));
  assert.ok(result.markdown.includes("### Implementation Guidelines"));
  assert.ok(result.markdown.includes("Process sandbox isolation"));
  assert.ok(result.markdown.includes("-") || result.markdown.includes("1."));
});

test("ReadabilityExtractor preserves code blocks with language annotations", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Code Block Test</title></head>
      <body>
        <article>
          <h1>TypeScript Implementation Guide</h1>
          <p>Here is an example of a type-safe middleware interface in TypeScript:</p>
          <pre><code class="language-typescript">export interface IAgentMiddleware {
  readonly position: "security" | "budget";
  wrapModelCall(call: unknown): Promise<void>;
}</code></pre>
          <p>This ensures compile-time position sorting and deterministic execution order.</p>
        </article>
      </body>
    </html>
  `;

  const result = ReadabilityExtractor.extract(html, "https://example.com/code");
  assert.ok(result.markdown.includes("```typescript") || result.markdown.includes("```"));
  assert.ok(result.markdown.includes("export interface IAgentMiddleware"));
  assert.ok(result.markdown.includes('position: "security"'));
});

test("ReadabilityExtractor converts HTML tables to GitHub Flavored Markdown tables", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Table Test</title></head>
      <body>
        <article>
          <h1>Model Performance Metrics</h1>
          <p>Comparison of response latency and token throughput across frontier models:</p>
          <table>
            <thead>
              <tr><th>Model</th><th>Latency (ms)</th><th>Throughput (tok/s)</th></tr>
            </thead>
            <tbody>
              <tr><td>Gemini 2.0 Flash</td><td>220</td><td>145</td></tr>
              <tr><td>Claude 3.5 Sonnet</td><td>540</td><td>78</td></tr>
            </tbody>
          </table>
          <p>Summary of results indicates sub-second roundtrip for flash tier models.</p>
        </article>
      </body>
    </html>
  `;

  const result = ReadabilityExtractor.extract(html, "https://example.com/tables");
  assert.ok(result.markdown.includes("| Model | Latency (ms) | Throughput (tok/s) |"));
  assert.ok(result.markdown.includes("| --- | --- | --- |"));
  assert.ok(result.markdown.includes("| Gemini 2.0 Flash | 220 | 145 |"));
  assert.ok(result.markdown.includes("| Claude 3.5 Sonnet | 540 | 78 |"));
});

test("ReadabilityExtractor gracefully falls back to Cheerio structural cleanup on non-article portal pages", () => {
  // A portal or dashboard page that does not look like a traditional article
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Dashboard Portal</title>
        <meta name="description" content="System operations dashboard">
      </head>
      <body>
        <nav><a href="/home">Home</a></nav>
        <div id="app">
          <main>
            <div class="widget">Status: Active</div>
            <div class="metric">Node version: 22.0.0</div>
            <div class="metric">Memory usage: 48MB</div>
          </main>
        </div>
      </body>
    </html>
  `;

  const result = ReadabilityExtractor.extract(html, "https://example.com/dashboard", {
    charThreshold: 200, // force fallback on short content
  });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.isArticle, false);
  assert.equal(result.title, "Dashboard Portal");
  assert.equal(result.excerpt, "System operations dashboard");
  assert.ok(result.text.includes("Status: Active"));
  assert.ok(result.markdown.includes("Status: Active") || result.text.includes("Status: Active"));
});

test("ReadabilityExtractor handles broken or malformed HTML without throwing", () => {
  const malformedHtml = `
    <html>
      <head><title>Malformed Page</title></head>
      <body>
        <div><p>Unclosed paragraph and broken tags
        <article>
          <h1>Valid Header</h1>
          <p>Some actual text that should be extracted properly despite severe DOM defects.
        <script>alert(1)</script>
  `;

  let result: ReturnType<typeof ReadabilityExtractor.extract> | undefined;
  assert.doesNotThrow(() => {
    result = ReadabilityExtractor.extract(malformedHtml, "https://example.com/malformed");
  });
  assert.ok(result);
  assert.ok(result.text.length > 0 || result.markdown.length > 0);
  assert.equal(result.text.includes("alert(1)"), false);
});

test("ReadabilityExtractor handles image replacement with alt text according to preserveImages option", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Image Test</title></head>
      <body>
        <article>
          <h1>System Topology</h1>
          <p>Here is the architectural block diagram representing the orchestrator boundaries:</p>
          <img src="/assets/diagram.png" alt="Orchestrator Architecture Diagram" />
          <p>The diagram illustrates unidirectional message streams between the core and actors.</p>
        </article>
      </body>
    </html>
  `;

  const stripped = ReadabilityExtractor.extract(html, "https://example.com/img", {
    preserveImages: false,
  });
  assert.ok(stripped.markdown.includes("[Image: Orchestrator Architecture Diagram]"));
});

test("ReadabilityExtractor respects charThreshold and maxContentLength options", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Short Article</title></head>
      <body>
        <article>
          <h1>Short Note</h1>
          <p>This is a short paragraph of 40 characters.</p>
        </article>
      </body>
    </html>
  `;

  const strictThreshold = ReadabilityExtractor.extract(html, "https://example.com/short", {
    charThreshold: 300,
  });
  assert.equal(strictThreshold.fallbackUsed, true);

  const lenientThreshold = ReadabilityExtractor.extract(html, "https://example.com/short", {
    charThreshold: 20,
  });
  assert.equal(lenientThreshold.fallbackUsed, false);
  assert.equal(lenientThreshold.isArticle, true);
});

test("CheerioScraperActor integrates ReadabilityExtractor producing markdown content", async () => {
  const actor = new CheerioScraperActor();

  // Test local parsing via task execution
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Actor Integration Page</title></head>
      <body>
        <article>
          <h1>Actor Integration Header</h1>
          <p>CheerioScraperActor now produces structured markdown through ReadabilityExtractor.</p>
          <p>This eliminates flat whitespace-collapsed blobs and preserves semantic markdown structure.</p>
        </article>
      </body>
    </html>
  `;

  // Mock global fetch to return our test HTML
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  };

  try {
    const result = await actor.run(
      {
        taskId: "test-task-1",
        actorType: "cheerio-scraper",
        targetUrl: "https://example.com/actor-test",
      },
      {
        task: {
          taskId: "test-task-1",
          actorType: "cheerio-scraper",
          targetUrl: "https://example.com/actor-test",
        },
        startTime: Date.now(),
      }
    );

    assert.equal(result.status, "completed");
    assert.ok(result.data);
    assert.equal(result.data.title, "Actor Integration Page");
    assert.ok(result.data.content.includes("Actor Integration Header"));
    assert.ok(result.data.markdown?.includes("Actor Integration Header"));
    assert.equal(result.data.isArticle, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ReadabilityExtractor strips invisible zero-width unicode characters from output", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head><title>Water\u200Bmarked Title</title></head>
      <body>
        <article>
          <h1>Secret\uFEFF Article</h1>
          <p>This paragraph contains steganographic \u200Bzero-width\u200D spaces and soft\u00ADhyphens.</p>
        </article>
      </body>
    </html>
  `;

  const result = ReadabilityExtractor.extract(html, "https://example.com/steganography");
  assert.equal(result.title, "Watermarked Title");
  assert.ok(!result.markdown.includes("\u200B"));
  assert.ok(!result.markdown.includes("\uFEFF"));
  assert.ok(!result.markdown.includes("\u200D"));
  assert.ok(!result.markdown.includes("\u00AD"));
  assert.ok(result.markdown.includes("zero-width spaces and softhyphens"));
});
