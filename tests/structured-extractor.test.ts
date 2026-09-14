import test from "node:test";
import assert from "node:assert/strict";
import { StructuredExtractor } from "@/structured-extractor";

test("StructuredExtractor.extractTables parses HTML tables into records and markdown", () => {
  const html = `
    <html>
      <body>
        <table id="pricing-matrix">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Price</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Starter</td>
              <td>$19</td>
              <td>Basic access</td>
            </tr>
            <tr>
              <td>Enterprise</td>
              <td>$99</td>
              <td>Full access | 24/7 SLA</td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  `;

  const tables = StructuredExtractor.extractTables(html);
  assert.equal(tables.length, 1);

  const table = tables[0];
  assert.equal(table.id, "pricing-matrix");
  assert.deepEqual(table.headers, ["Plan", "Price", "Features"]);
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[0], ["Starter", "$19", "Basic access"]);

  // Records verification
  assert.equal(table.records.length, 2);
  assert.equal(table.records[0].Plan, "Starter");
  assert.equal(table.records[0].Price, "$19");
  assert.equal(table.records[1].Features, "Full access | 24/7 SLA");

  // Markdown format verification
  assert.ok(table.markdown.includes("| Plan | Price | Features |"));
  assert.ok(table.markdown.includes("| --- | --- | --- |"));
  assert.ok(table.markdown.includes("| Starter | $19 | Basic access |"));
  // Ensure pipe in content is escaped
  assert.ok(table.markdown.includes("Full access \\| 24/7 SLA"));
});

test("StructuredExtractor.extractTables handles tables without thead", () => {
  const html = `
    <table>
      <tr><td>Item A</td><td>100</td></tr>
      <tr><td>Item B</td><td>250</td></tr>
    </table>
  `;

  const tables = StructuredExtractor.extractTables(html);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].headers[0], "Item A");
  assert.equal(tables[0].rows.length, 1);
  assert.equal(tables[0].rows[0][0], "Item B");
});

test("StructuredExtractor.extractJsonLd extracts valid Schema.org scripts", () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": "Acme SuperWidget",
            "offers": {
              "@type": "Offer",
              "price": "49.99"
            }
          }
        </script>
        <script type="application/ld+json">
          [
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "Acme Corp"
            }
          ]
        </script>
      </head>
      <body></body>
    </html>
  `;

  const jsonLd = StructuredExtractor.extractJsonLd(html) as Array<Record<string, unknown>>;
  assert.equal(jsonLd.length, 2);
  assert.equal(jsonLd[0]["@type"], "Product");
  assert.equal(jsonLd[0].name, "Acme SuperWidget");
  assert.equal(jsonLd[1]["@type"], "Organization");
  assert.equal(jsonLd[1].name, "Acme Corp");
});

test("StructuredExtractor.extractMetaTags extracts OpenGraph and Twitter tags", () => {
  const html = `
    <html>
      <head>
        <meta property="og:title" content="Enterprise Architecture Guide" />
        <meta property="og:description" content="Technical patterns and invariants." />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:creator" content="@agent_smith" />
      </head>
      <body></body>
    </html>
  `;

  const meta = StructuredExtractor.extractMetaTags(html);
  assert.equal(meta["og:title"], "Enterprise Architecture Guide");
  assert.equal(meta["og:description"], "Technical patterns and invariants.");
  assert.equal(meta["twitter:card"], "summary_large_image");
  assert.equal(meta["twitter:creator"], "@agent_smith");
});

test("StructuredExtractor handles empty or invalid markup gracefully", () => {
  assert.deepEqual(StructuredExtractor.extractTables(""), []);
  assert.deepEqual(StructuredExtractor.extractJsonLd(""), []);
  assert.deepEqual(StructuredExtractor.extractMetaTags(""), {});
});
