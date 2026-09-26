import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { ConnectorRegistry } from "../src/pipeline/connectors/connector-registry";
import { resolveConnectorConfig, resolveEnvString } from "../src/pipeline/connectors/env-resolver";
import { LocalExecutor } from "../src/pipeline/execution/local-executor";
import { PipelineRunner } from "../src/pipeline/pipeline-runner";
import { PipelineError } from "../src/pipeline/schema";
import { B2Storage } from "../src/pipeline/storage/b2-storage";
import { R2Storage } from "../src/pipeline/storage/r2-storage";
import { detectMimeType, S3Storage } from "../src/pipeline/storage/s3-storage";

describe("Storage Routing & Connectors (Phase 2)", () => {
  describe("Environment Variable Resolver", () => {
    const mockEnv: NodeJS.ProcessEnv = {
      R2_BUCKET: "my-production-bucket",
      R2_ACCOUNT_ID: "acc_1234567890",
      R2_ACCESS_KEY: "AKIA_MOCK_ACCESS",
      R2_SECRET_KEY: "SECRET_MOCK_KEY",
    };

    const ref = (v: string) => ["$", "{", v, "}"].join("");

    it("resolves exact environment variable references", () => {
      assert.equal(resolveEnvString(ref("R2_BUCKET"), mockEnv), "my-production-bucket");
      assert.equal(resolveEnvString(ref("R2_ACCOUNT_ID"), mockEnv), "acc_1234567890");
    });

    it("passes through non-token strings untouched", () => {
      assert.equal(resolveEnvString("literal-value", mockEnv), "literal-value");
      assert.equal(resolveEnvString("prefix/path/", mockEnv), "prefix/path/");
    });

    it("throws PipelineError on missing or empty environment variable", () => {
      assert.throws(
        () => resolveEnvString(ref("NON_EXISTENT_VAR"), mockEnv),
        (err: unknown) => {
          assert.ok(err instanceof PipelineError);
          assert.equal(err.code, "MISSING_ENV_VAR");
          return true;
        }
      );
    });

    it("resolves nested connector config structures", () => {
      const raw = {
        type: "r2" as const,
        bucket: ref("R2_BUCKET"),
        account_id: ref("R2_ACCOUNT_ID"),
        access_key_id: ref("R2_ACCESS_KEY"),
        secret_access_key: ref("R2_SECRET_KEY"),
      };

      const resolved = resolveConnectorConfig(raw, mockEnv);
      assert.equal(resolved.bucket, "my-production-bucket");
      assert.equal(resolved.account_id, "acc_1234567890");
      assert.equal(resolved.access_key_id, "AKIA_MOCK_ACCESS");
      assert.equal(resolved.secret_access_key, "SECRET_MOCK_KEY");
    });
  });

  describe("Connector Registry", () => {
    it("registers and resolves connectors by name", () => {
      const registry = new ConnectorRegistry();
      registry.register("main-r2", {
        type: "r2",
        bucket: "test-bucket",
      });

      assert.equal(registry.has("main-r2"), true);
      assert.equal(registry.has("missing"), false);

      const resolved = registry.resolve("main-r2");
      assert.equal(resolved.bucket, "test-bucket");
      assert.equal(resolved.type, "r2");
    });

    it("throws PipelineError when resolving unregistered connector", () => {
      const registry = new ConnectorRegistry();
      assert.throws(
        () => registry.resolve("unregistered-connector"),
        (err: unknown) => {
          assert.ok(err instanceof PipelineError);
          assert.equal(err.code, "CONNECTOR_NOT_FOUND");
          return true;
        }
      );
    });
  });

  describe("S3, R2, and B2 Storage Drivers", () => {
    it("detects MIME types correctly", () => {
      assert.equal(detectMimeType("data.jsonl"), "application/x-ndjson");
      assert.equal(detectMimeType("data.json"), "application/json");
      assert.equal(detectMimeType("data.csv"), "text/csv");
      assert.equal(detectMimeType("data.parquet"), "application/vnd.apache.parquet");
      assert.equal(detectMimeType("data.bin"), "application/octet-stream");
    });

    it("S3Storage uploads artifact via PutObjectCommand and returns valid receipt", async () => {
      const sentCommands: PutObjectCommand[] = [];
      const mockClient = {
        send: async (command: unknown) => {
          sentCommands.push(command as PutObjectCommand);
          return { ETag: '"mock-etag"' };
        },
      };

      const storage = new S3Storage({
        bucket: "prod-corpus",
        region: "eu-central-1",
        client: mockClient,
      });

      const payload = Buffer.from("test article content\nsecond line", "utf8");
      const expectedSha256 = createHash("sha256").update(payload).digest("hex");

      const receipt = await storage.upload("article.jsonl", payload, "corpus/wiki");

      assert.equal(receipt.backend, "s3");
      assert.equal(receipt.uri, "s3://prod-corpus/corpus/wiki/article.jsonl");
      assert.equal(receipt.bytesWritten, payload.length);
      assert.equal(receipt.checksumSha256, expectedSha256);
      assert.equal(sentCommands.length, 1);

      const cmdInput = (sentCommands[0] as unknown as { input: Record<string, unknown> }).input;
      assert.equal(cmdInput.Bucket, "prod-corpus");
      assert.equal(cmdInput.Key, "corpus/wiki/article.jsonl");
      assert.equal(cmdInput.ContentType, "application/x-ndjson");
    });

    it("R2Storage formats Cloudflare endpoint and uri", async () => {
      const sentCommands: unknown[] = [];
      const mockClient = {
        send: async (command: unknown) => {
          sentCommands.push(command);
          return {};
        },
      };

      const storage = new R2Storage({
        bucket: "r2-data-bucket",
        accountId: "test-account-id",
        client: mockClient,
      });

      assert.equal(storage.backend, "r2");

      const payload = Buffer.from("r2 sample", "utf8");
      const receipt = await storage.upload("test.json", payload, "exports");

      assert.equal(receipt.backend, "r2");
      assert.equal(receipt.uri, "r2://r2-data-bucket/exports/test.json");
      assert.equal(sentCommands.length, 1);
    });

    it("B2Storage formats Backblaze uri and bucket", async () => {
      const mockClient = {
        send: async () => ({}),
      };

      const storage = new B2Storage({
        bucket: "b2-cold-vault",
        region: "us-west-004",
        client: mockClient,
      });

      assert.equal(storage.backend, "b2");

      const payload = Buffer.from("b2 payload", "utf8");
      const receipt = await storage.upload("shard.parquet", payload);

      assert.equal(receipt.backend, "b2");
      assert.equal(receipt.uri, "b2://b2-cold-vault/shard.parquet");
    });
  });

  describe("PipelineRunner Cloud Storage Integration", () => {
    it("runs pipeline with R2 storage using mock client and connector", async () => {
      const mockItems = [{ id: "item-1", text: "Cloud extraction" }];
      const executor = new LocalExecutor({
        customRunner: async () => mockItems,
      });

      const mockClient = {
        send: async () => ({}),
      };

      const r2Storage = new R2Storage({
        bucket: "cloud-lake",
        accountId: "acc-id",
        client: mockClient,
      });

      const runner = new PipelineRunner({
        executor,
        storageBackends: { r2: r2Storage },
      });

      const yaml = `
name: cloud-pipeline-test
actor:
  id: wikimedia
  config:
    title: "Cloud Computing"
storage:
  backend: r2
  connector: my-cloud-connector
  prefix: "lake/2026"
`;

      const result = await runner.runYaml(yaml);

      assert.equal(result.status, "succeeded");
      assert.equal(result.actorId, "wikimedia");
      assert.ok(result.receipt);
      assert.equal(result.receipt.backend, "r2");
      assert.ok(result.receipt.uri.startsWith("r2://cloud-lake/lake/2026/"));
      assert.ok(result.receipt.checksumSha256);
    });

    it("fails gracefully without crashing when connector is missing", async () => {
      const executor = new LocalExecutor({
        customRunner: async () => [{ title: "Doc" }],
      });

      const runner = new PipelineRunner({ executor });

      const yaml = `
name: missing-connector-pipeline
actor:
  id: wikimedia
  config:
    title: "Test"
storage:
  backend: s3
  connector: nonexistent-connector
`;

      const result = await runner.runYaml(yaml);

      assert.equal(result.status, "failed");
      assert.match(result.error || "", /Connector 'nonexistent-connector' is not registered/);
      assert.equal(runner.getFailedRuns().length, 1);
    });

    it("registers and resolves connector defined directly within YAML", async () => {
      process.env.TEST_PIPELINE_BUCKET = "my-env-bucket";
      process.env.TEST_PIPELINE_KEY = "AKIA_TEST_KEY";
      process.env.TEST_PIPELINE_SECRET = "SECRET_TEST_KEY";

      const executor = new LocalExecutor({
        customRunner: async () => [{ text: "sample data" }],
      });

      const mockClient = {
        send: async () => ({}),
      };

      const runner = new PipelineRunner({ executor });

      const yaml = `
name: yaml-connector-test
actor:
  id: wikimedia
  config:
    title: "Technology"
connectors:
  primary-s3:
    type: s3
    bucket: "\${TEST_PIPELINE_BUCKET}"
    access_key_id: "\${TEST_PIPELINE_KEY}"
    secret_access_key: "\${TEST_PIPELINE_SECRET}"
    region: "eu-west-1"
storage:
  backend: s3
  connector: primary-s3
`;

      // Mock S3Storage backend instantiation by registering our mock client for s3
      const s3Storage = new S3Storage({
        bucket: "my-env-bucket",
        region: "eu-west-1",
        client: mockClient,
      });
      runner.registerStorage(s3Storage);

      const result = await runner.runYaml(yaml);

      assert.equal(result.status, "succeeded");
      assert.ok(result.receipt);
      assert.equal(result.receipt.backend, "s3");
      assert.ok(result.receipt.uri.startsWith("s3://my-env-bucket/"));

      delete process.env.TEST_PIPELINE_BUCKET;
      delete process.env.TEST_PIPELINE_KEY;
      delete process.env.TEST_PIPELINE_SECRET;
    });
  });
});
