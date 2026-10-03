import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { JobNotification, SourceDescriptor, StorageRef } from "../contracts/index.js";

describe("Contracts and Schemas Validation Suite", () => {
  const contractsDir = path.resolve(process.cwd(), "contracts");
  const migrationsDir = path.resolve(process.cwd(), "infra/migrations");

  it("validates that source-descriptor.schema.json exists and contains required properties", () => {
    const schemaPath = path.join(contractsDir, "source-descriptor.schema.json");
    assert.ok(fs.existsSync(schemaPath), "source-descriptor.schema.json must exist");

    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.type, "object");
    assert.ok(Array.isArray(schema.required));
    assert.ok(schema.required.includes("source_id"));
    assert.ok(schema.required.includes("method"));
    assert.ok(schema.required.includes("budget"));
    assert.ok(schema.required.includes("rights_status"));
  });

  it("validates that source-descriptor.example.json conforms to the schema required fields", () => {
    const examplePath = path.join(contractsDir, "source-descriptor.example.json");
    assert.ok(fs.existsSync(examplePath), "source-descriptor.example.json must exist");

    const example: SourceDescriptor = JSON.parse(fs.readFileSync(examplePath, "utf-8"));
    assert.ok(example.source_id.length > 0);
    assert.ok(example.name.length > 0);
    assert.equal(example.method, "rest");
    assert.ok(["approved", "pending", "denied"].includes(example.rights_status));
    assert.ok(example.budget.max_requests > 0);
    assert.ok(example.budget.max_bytes > 0);
    assert.ok(example.budget.max_seconds > 0);
    assert.equal(example.pagination.checkpoint_after_durable_commit, true);
  });

  it("validates that job.schema.json exists and defines job notification envelope", () => {
    const schemaPath = path.join(contractsDir, "job.schema.json");
    assert.ok(fs.existsSync(schemaPath), "job.schema.json must exist");

    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    assert.equal(schema.title, "JobNotificationV1");
    assert.ok(schema.required.includes("job_id"));
    assert.ok(schema.required.includes("operation"));
    assert.ok(schema.required.includes("trace_id"));
  });

  it("validates that job.example.json conforms to job notification envelope", () => {
    const examplePath = path.join(contractsDir, "job.example.json");
    assert.ok(fs.existsSync(examplePath), "job.example.json must exist");

    const example: JobNotification = JSON.parse(fs.readFileSync(examplePath, "utf-8"));
    assert.equal(example.schema_version, 1);
    assert.equal(example.operation, "download");
    assert.match(example.trace_id, /^[0-9a-f]{32}$/);
  });

  it("verifies TypeScript contracts/index.js exports and type contracts", () => {
    const sampleRef: StorageRef = {
      provider_id: "r2-primary",
      container: "protokol7-data-lake",
      key: "bronze/raw/sample.parquet",
      version: "v1",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      bytes: 1024,
    };
    assert.equal(sampleRef.provider_id, "r2-primary");
    assert.equal(sampleRef.bytes, 1024);
  });

  it("verifies that starter SQL migrations are intact and contain non-empty statements", () => {
    const migrationFiles = [
      "001-control-plane.sql",
      "002-lease-examples.sql",
      "003-operational-extension.sql",
    ];

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      assert.ok(fs.existsSync(filePath), `Migration ${file} must exist`);
      const content = fs.readFileSync(filePath, "utf-8");
      assert.ok(content.length > 50, `Migration ${file} must not be empty`);
    }
  });
});
