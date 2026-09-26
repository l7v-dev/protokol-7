/**
 * JSONL (Newline Delimited JSON) Output Processor.
 */

import type { OutputProcessor, ProcessedOutput } from "./index";

export class JsonlWriter implements OutputProcessor {
  readonly format = "jsonl";

  async process(items: unknown[], baseName: string): Promise<ProcessedOutput> {
    const lines: string[] = [];
    for (const item of items) {
      lines.push(JSON.stringify(item));
    }

    const payload = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    const buffer = Buffer.from(payload, "utf8");

    return {
      format: "jsonl",
      buffer,
      rowCount: items.length,
      byteLength: buffer.length,
      fileName: `${baseName}.jsonl`,
    };
  }
}
