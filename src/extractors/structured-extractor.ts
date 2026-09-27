/**
 * Structured data extractor for HTML tables, Schema.org JSON-LD scripts,
 * and OpenGraph / Twitter metadata tags.
 */

import * as cheerio from "cheerio";
import type { ExtractedTable } from "../api/types";

export class StructuredExtractor {
  /**
   * Extracts all HTML tables from markup into normalized data structures
   * containing headers, raw rows, object records, and GFM markdown representations.
   */
  static extractTables(html: string): ExtractedTable[] {
    if (!html || typeof html !== "string") {
      return [];
    }

    const $ = cheerio.load(html);
    const tables: ExtractedTable[] = [];

    $("table").each((tableIndex, tableElement) => {
      const $table = $(tableElement);
      const tableId = $table.attr("id") || `table-${tableIndex + 1}`;

      const headerCells: string[] = [];
      const rows: string[][] = [];

      const isDirectChild = (_: number, el: unknown) =>
        $(el as Parameters<typeof $>[0]).closest("table")[0] === tableElement;

      // 1. Identify headers: Check <thead> first, otherwise inspect first <tr>
      const $thead = $table.children("thead");
      let $headerRow = $thead.children("tr").first();

      if ($headerRow.length === 0) {
        $headerRow = $table.find("tr").filter(isDirectChild).first();
      }

      $headerRow
        .find("th, td")
        .filter(isDirectChild)
        .each((colIndex, cell) => {
          const text = $(cell).text().trim().replace(/\s+/g, " ") || `Column ${colIndex + 1}`;
          const colspan = parseInt($(cell).attr("colspan") || "1", 10);
          const span = !Number.isNaN(colspan) && colspan > 1 ? colspan : 1;
          for (let s = 0; s < span; s++) {
            headerCells.push(text);
          }
        });

      // 2. Identify data rows
      const $dataRows =
        $thead.length > 0
          ? $table
              .find("tr")
              .filter(isDirectChild)
              .filter((_, el) => !$(el).parent().is("thead"))
          : $table.find("tr").filter(isDirectChild).slice(1);

      $dataRows.each((_, rowEl) => {
        const rowCells: string[] = [];
        $(rowEl)
          .find("td, th")
          .filter(isDirectChild)
          .each((_, cell) => {
            const text = $(cell).text().trim().replace(/\s+/g, " ");
            const colspan = parseInt($(cell).attr("colspan") || "1", 10);
            const span = !Number.isNaN(colspan) && colspan > 1 ? colspan : 1;
            for (let s = 0; s < span; s++) {
              rowCells.push(text);
            }
          });

        // Only add non-empty rows
        if (rowCells.length > 0 && rowCells.some((c) => c.length > 0)) {
          rows.push(rowCells);
        }
      });

      // Skip table if no headers or rows exist
      if (headerCells.length === 0 && rows.length === 0) {
        return;
      }

      // If headers were missing, synthesize them from column count of first row
      if (headerCells.length === 0 && rows.length > 0) {
        const colCount = rows[0].length;
        for (let i = 0; i < colCount; i++) {
          headerCells.push(`Column ${i + 1}`);
        }
      }

      // 3. Construct records (Array of objects keyed by header name)
      const records: Array<Record<string, string>> = rows.map((row) => {
        const record: Record<string, string> = {};
        headerCells.forEach((header, i) => {
          record[header] = row[i] ?? "";
        });
        return record;
      });

      // 4. Construct GitHub Flavored Markdown table string
      const escapedHeaders = headerCells.map((h) => h.replace(/\|/g, "\\|"));
      const markdownHeader = `| ${escapedHeaders.join(" | ")} |`;
      const markdownSeparator = `| ${headerCells.map(() => "---").join(" | ")} |`;
      const markdownRows = rows.map((row) => {
        const paddedRow = headerCells.map((_, i) => (row[i] ?? "").replace(/\|/g, "\\|"));
        return `| ${paddedRow.join(" | ")} |`;
      });

      const markdown = [markdownHeader, markdownSeparator, ...markdownRows].join("\n");

      tables.push({
        id: tableId,
        headers: headerCells,
        rows,
        records,
        markdown,
      });
    });

    return tables;
  }

  /**
   * Extracts Schema.org JSON-LD scripts from HTML markup.
   */
  static extractJsonLd(html: string): unknown[] {
    if (!html || typeof html !== "string") {
      return [];
    }

    const $ = cheerio.load(html);
    const jsonLdEntries: unknown[] = [];

    $('script[type="application/ld+json"]').each((_, scriptEl) => {
      const rawText = $(scriptEl).html() || $(scriptEl).text() || "";
      const trimmed = rawText.trim();
      if (!trimmed) {
        return;
      }

      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          jsonLdEntries.push(...parsed);
        } else if (parsed && typeof parsed === "object") {
          jsonLdEntries.push(parsed);
        }
      } catch {
        // Silently skip malformed JSON-LD scripts
      }
    });

    return jsonLdEntries;
  }

  /**
   * Extracts OpenGraph (og:*) and Twitter (twitter:*) meta tags.
   */
  static extractMetaTags(html: string): Record<string, string> {
    if (!html || typeof html !== "string") {
      return {};
    }

    const $ = cheerio.load(html);
    const meta: Record<string, string> = {};

    $("meta[property], meta[name]").each((_, el) => {
      const key = $(el).attr("property") || $(el).attr("name");
      const value = $(el).attr("content");
      if (key && value) {
        meta[key.trim()] = value.trim();
      }
    });

    return meta;
  }
}
