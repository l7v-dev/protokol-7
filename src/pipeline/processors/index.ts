/**
 * Output Processor interfaces and contracts for pipeline data transformation.
 */

export interface ProcessedOutput {
  format: string;
  buffer: Buffer;
  rowCount: number;
  byteLength: number;
  fileName: string;
}

export interface OutputProcessor {
  readonly format: string;
  process(items: unknown[], baseName: string): Promise<ProcessedOutput>;
}

export * from "./csv-writer";
export * from "./dedup-filter";
export * from "./jsonl-writer";
export * from "./parquet-packer";
export * from "./passthrough-writer";
export * from "./quality-filter";
export * from "./text-normalizer";
