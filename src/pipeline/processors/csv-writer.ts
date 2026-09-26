/**
 * CSV Output Processor implementing RFC 4180 formatting.
 */

import type { OutputProcessor, ProcessedOutput } from "./index";

export class CsvWriter implements OutputProcessor {
  readonly format = "csv";

  async process(items: unknown[], baseName: string): Promise<ProcessedOutput> {
    if (items.length === 0) {
      const buffer = Buffer.from("", "utf8");
      return {
        format: "csv",
        buffer,
        rowCount: 0,
        byteLength: 0,
        fileName: `${baseName}.csv`,
      };
    }

    // Determine distinct headers across all object rows
    const headersSet = new Set<string>();
    for (const item of items) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        for (const key of Object.keys(item as Record<string, unknown>)) {
          headersSet.add(key);
        }
      }
    }

    const headers = Array.from(headersSet);
    if (headers.length === 0) {
      headers.push("value");
    }

    const rows: string[] = [];
    rows.push(headers.map((h) => this.escapeCsvValue(h)).join(","));

    for (const item of items) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>;
        const row = headers.map((header) => {
          const val = obj[header];
          return this.escapeCsvValue(val);
        });
        rows.push(row.join(","));
      } else {
        rows.push(this.escapeCsvValue(item));
      }
    }

    const buffer = Buffer.from(`${rows.join("\r\n")}\r\n`, "utf8");

    return {
      format: "csv",
      buffer,
      rowCount: items.length,
      byteLength: buffer.length,
      fileName: `${baseName}.csv`,
    };
  }

  private escapeCsvValue(val: unknown): string {
    if (val === null || val === undefined) {
      return "";
    }
    let str = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      str = `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }
}
