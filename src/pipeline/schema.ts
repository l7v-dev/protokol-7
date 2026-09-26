/**
 * Pipeline Configuration Schema and YAML Parser.
 */

import { existsSync, readFileSync } from "node:fs";
import yaml from "js-yaml";
import { z } from "zod";

export class PipelineError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code = "PIPELINE_ERROR", details?: unknown) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.details = details;
  }
}

// Regex to enforce environment variable references for sensitive credentials: ${ENV_VAR_NAME}
const ENV_VAR_PATTERN = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

export const ConnectorCredentialString = z
  .string()
  .min(1)
  .refine(
    (val) => ENV_VAR_PATTERN.test(val),
    (val) => ({
      message: `Connector credential must be an environment variable reference matching \${ENV_VAR}, received: ${val}`,
    })
  );

export const ConnectorConfigSchema = z
  .object({
    type: z.enum(["r2", "s3", "b2", "drive", "pipedream", "http"]),
    bucket: z.union([ConnectorCredentialString, z.string()]).optional(),
    account_id: ConnectorCredentialString.optional(),
    access_key_id: ConnectorCredentialString.optional(),
    secret_access_key: ConnectorCredentialString.optional(),
    token: ConnectorCredentialString.optional(),
    endpoint: z.string().url().optional(),
    region: z.string().optional(),
    folder_id: z.string().optional(),
  })
  .passthrough();

export const PipelineActorConfigSchema = z.object({
  id: z.string().min(1, "Actor identifier cannot be empty"),
  config: z.record(z.unknown()).default({}),
});

export const PipelineScheduleConfigSchema = z.object({
  type: z.enum(["one-time", "cron"]),
  expression: z.string().optional(),
});

export const PipelineExecutionConfigSchema = z.object({
  target: z.enum(["local", "remote-http", "pipedream"]).default("local"),
  endpoint: z.string().url().optional(),
  token: z.union([ConnectorCredentialString, z.string()]).optional(),
});

export const PipelineOutputConfigSchema = z.object({
  format: z.enum(["jsonl", "parquet", "csv", "passthrough"]).default("jsonl"),
  compression: z.enum(["zstd", "gzip", "none"]).default("none"),
  max_rows_per_file: z.number().int().positive().optional(),
});

export const PipelineStorageConfigSchema = z.object({
  backend: z.enum(["local", "drive", "s3", "r2", "b2"]).default("local"),
  connector: z.string().optional(),
  prefix: z.string().optional(),
  folder_id: z.string().optional(),
  destination_path: z.string().optional(),
});

export const PipelineConfigSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9-_]+$/,
      "Pipeline name must contain only lowercase alphanumeric, dash or underscore characters"
    ),
  version: z.number().int().positive().default(1),
  actor: PipelineActorConfigSchema,
  schedule: PipelineScheduleConfigSchema.default({ type: "one-time" }),
  execution: PipelineExecutionConfigSchema.default({ target: "local" }),
  output: PipelineOutputConfigSchema.default({ format: "jsonl", compression: "none" }),
  storage: PipelineStorageConfigSchema.default({ backend: "local" }),
  connectors: z.record(ConnectorConfigSchema).optional(),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

/**
 * Parses and validates YAML string into a strict PipelineConfig object.
 */
export function parsePipelineYaml(yamlString: string): PipelineConfig {
  let raw: unknown;
  try {
    raw = yaml.load(yamlString);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new PipelineError(`Failed to parse pipeline YAML: ${message}`, "YAML_PARSE_ERROR", err);
  }

  if (!raw || typeof raw !== "object") {
    throw new PipelineError(
      "Pipeline YAML must define a root configuration object",
      "INVALID_ROOT_OBJECT"
    );
  }

  const result = PipelineConfigSchema.safeParse(raw);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("; ");
    throw new PipelineError(
      `Pipeline configuration validation failed: ${errorDetails}`,
      "SCHEMA_VALIDATION_ERROR",
      result.error.errors
    );
  }

  return result.data;
}

/**
 * Reads and parses a pipeline configuration file from the filesystem.
 */
export function loadPipelineConfigFile(filePath: string): PipelineConfig {
  if (!existsSync(filePath)) {
    throw new PipelineError(
      `Pipeline configuration file not found at path: ${filePath}`,
      "FILE_NOT_FOUND"
    );
  }

  const content = readFileSync(filePath, "utf8");
  return parsePipelineYaml(content);
}
