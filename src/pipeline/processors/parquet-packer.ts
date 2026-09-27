/**
 * Parquet Output Processor using Python PyArrow subprocess bridge with graceful JSONL fallback.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OutputProcessor, ProcessedOutput } from "./index";
import { JsonlWriter } from "./jsonl-writer";

export class ParquetPacker implements OutputProcessor {
  readonly format = "parquet";
  private readonly jsonlFallbackWriter = new JsonlWriter();

  constructor(
    private readonly options?: {
      pythonPath?: string;
      disableFallback?: boolean;
    }
  ) {}

  async process(items: unknown[], baseName: string): Promise<ProcessedOutput> {
    const pythonPath = this.options?.pythonPath || process.env.PYTHON_PATH || "python3";

    // Write items to a temporary JSONL file and run duckdb/pyarrow conversion script
    const tempDir = mkdtempSync(join(tmpdir(), "protokol-parquet-"));
    const tempJsonl = join(tempDir, "input.jsonl");
    const tempParquet = join(tempDir, `${baseName}.parquet`);

    try {
      const jsonlLines = items.map((item) => JSON.stringify(item)).join("\n");
      writeFileSync(tempJsonl, jsonlLines, "utf8");

      const script = `
import json, sys
import pyarrow as pa
import pyarrow.parquet as pq

input_path = sys.argv[1]
output_path = sys.argv[2]

records = []
with open(input_path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line:
            records.append(json.loads(line))

if not records:
    # Empty table
    table = pa.Table.from_arrays([], names=[])
else:
    table = pa.Table.from_pylist(records)

pq.write_table(table, output_path, compression='zstd', compression_level=6)
`;
      const res = spawnSync(pythonPath, ["-c", script, tempJsonl, tempParquet], {
        encoding: "utf8",
        timeout: 30000,
      });

      if (res.status === 0 && existsSync(tempParquet)) {
        const parquetBuffer = readFileSync(tempParquet);
        return {
          format: "parquet",
          buffer: parquetBuffer,
          rowCount: items.length,
          byteLength: parquetBuffer.length,
          fileName: `${baseName}.parquet`,
        };
      }

      if (this.options?.disableFallback) {
        throw new Error(
          `Parquet subprocess bridge failed: ${res.stderr || "Unknown subprocess error"}`
        );
      }

      // Graceful fallback to JSONL per architectural invariant
      return await this.jsonlFallbackWriter.process(items, baseName);
    } catch (err) {
      if (this.options?.disableFallback) {
        throw err;
      }
      return await this.jsonlFallbackWriter.process(items, baseName);
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
