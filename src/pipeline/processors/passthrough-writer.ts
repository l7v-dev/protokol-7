/**
 * Passthrough Output Processor.
 * Preserves structured JSON payload without row-by-row reformatting.
 */

import type { OutputProcessor, ProcessedOutput } from "./index";

export class PassthroughWriter implements OutputProcessor {
  readonly format = "passthrough";

  async process(items: unknown[], baseName: string): Promise<ProcessedOutput> {
    const payload = JSON.stringify(items, null, 2);
    const buffer = Buffer.from(payload, "utf8");

    return {
      format: "passthrough",
      buffer,
      rowCount: items.length,
      byteLength: buffer.length,
      fileName: `${baseName}.json`,
    };
  }
}
