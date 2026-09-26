import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TabularExtractor } from "../src/extractors/tabular-extractor";

describe("TabularExtractor - RFC 4180 CSV/TSV and Markdown Extraction", () => {
  it("parses standard comma-separated values correctly", () => {
    const csv = `id,name,role\n1,Alice,Engineer\n2,Bob,Architect`;
    const result = TabularExtractor.parse(csv);

    assert.equal(result.rowCount, 2);
    assert.equal(result.columnCount, 3);
    assert.deepEqual(result.headers, ["id", "name", "role"]);
    assert.equal(result.records[0].name, "Alice");
    assert.equal(result.records[1].role, "Architect");
    assert.ok(result.markdownTable.includes("| Alice |"));
  });

  it("handles quoted fields with embedded commas, quotes, and newlines", () => {
    const csv = `"id","description","price"\n"101","High-grade, durable item with ""special"" warranty","19.99"\n"102","Line 1\nLine 2","29.50"`;
    const result = TabularExtractor.parse(csv);

    assert.equal(result.rowCount, 2);
    assert.equal(result.records[0].description, 'High-grade, durable item with "special" warranty');
    assert.equal(result.records[1].description, "Line 1\nLine 2");
    assert.ok(result.markdownTable.includes("Line 1<br>Line 2"));
  });

  it("auto-detects tab delimiter in TSV data", () => {
    const tsv = `server\thostname\tstatus\nprimary\tsrv-01.internal\tonline\nsecondary\tsrv-02.internal\tstandby`;
    const result = TabularExtractor.parse(tsv);

    assert.equal(result.detectedDelimiter, "\t");
    assert.equal(result.rowCount, 2);
    assert.equal(result.records[0].hostname, "srv-01.internal");
  });

  it("auto-detects semicolon delimiter", () => {
    const scv = `code;title;active\nTR;Turkey;true\nDE;Germany;true`;
    const result = TabularExtractor.parse(scv);

    assert.equal(result.detectedDelimiter, ";");
    assert.equal(result.records[0].title, "Turkey");
  });

  it("respects maxRows parameter", () => {
    const csv = `val\n1\n2\n3\n4\n5`;
    const result = TabularExtractor.parse(csv, { maxRows: 3 });

    assert.equal(result.rowCount, 3);
    assert.equal(result.records.length, 3);
    assert.equal(result.records[2].val, "3");
  });

  it("handles empty or whitespace-only content gracefully", () => {
    const result = TabularExtractor.parse("   \n\n  ");
    assert.equal(result.rowCount, 0);
    assert.equal(result.records.length, 0);
    assert.equal(result.markdownTable, "");
  });
});
