import assert from "node:assert/strict";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadPipelineConfigFile, PipelineError, parsePipelineYaml } from "../src/pipeline/schema";

describe("Pipeline Schema & YAML Validation", () => {
  it("parses valid minimal pipeline configuration", () => {
    const yaml = `
name: test-pipeline
version: 1
actor:
  id: wikimedia
  config:
    title: "Node.js"
`;
    const config = parsePipelineYaml(yaml);
    assert.equal(config.name, "test-pipeline");
    assert.equal(config.version, 1);
    assert.equal(config.actor.id, "wikimedia");
    assert.equal(config.schedule.type, "one-time");
    assert.equal(config.execution.target, "local");
    assert.equal(config.output.format, "jsonl");
    assert.equal(config.storage.backend, "local");
  });

  it("parses full pipeline configuration with schedule and storage", () => {
    const yaml = `
name: wikimedia-daily
version: 1
actor:
  id: wikimedia
  config:
    query: "Deep learning"
    action: search
schedule:
  type: cron
  expression: "0 2 * * *"
execution:
  target: local
output:
  format: jsonl
  compression: none
  max_rows_per_file: 50000
storage:
  backend: local
  prefix: "wikimedia/daily/"
`;
    const config = parsePipelineYaml(yaml);
    assert.equal(config.name, "wikimedia-daily");
    assert.equal(config.schedule.type, "cron");
    assert.equal(config.schedule.expression, "0 2 * * *");
    assert.equal(config.storage.prefix, "wikimedia/daily/");
    assert.equal(config.output.max_rows_per_file, 50000);
  });

  it("accepts connector credentials referencing environment variables", () => {
    const yaml = `
name: r2-export-pipeline
actor:
  id: wikimedia
  config:
    title: "TypeScript"
connectors:
  primary-r2:
    type: r2
    bucket: "\${R2_BUCKET_NAME}"
    account_id: "\${R2_ACCOUNT_ID}"
    access_key_id: "\${R2_ACCESS_KEY_ID}"
    secret_access_key: "\${R2_SECRET_ACCESS_KEY}"
`;
    const config = parsePipelineYaml(yaml);
    const expectedEnvRef = ["$", "{R2_ACCOUNT_ID}"].join("");
    assert.ok(config.connectors);
    assert.equal(config.connectors["primary-r2"]?.account_id, expectedEnvRef);
  });

  it("strictly rejects raw plain-text secret credentials in connectors", () => {
    const yaml = `
name: insecure-pipeline
actor:
  id: wikimedia
  config:
    title: "Security"
connectors:
  primary-r2:
    type: r2
    bucket: "my-bucket"
    secret_access_key: "plain_text_secret_key_123"
`;
    assert.throws(
      () => parsePipelineYaml(yaml),
      (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.code, "SCHEMA_VALIDATION_ERROR");
        assert.match(err.message, /must be an environment variable reference/);
        return true;
      }
    );
  });

  it("throws PipelineError on invalid YAML syntax", () => {
    const malformedYaml = `
name: test
  invalid: indentation
 actor: [broken
`;
    assert.throws(
      () => parsePipelineYaml(malformedYaml),
      (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.code, "YAML_PARSE_ERROR");
        return true;
      }
    );
  });

  it("throws PipelineError when root is not an object", () => {
    const stringYaml = `"just a string"`;
    assert.throws(
      () => parsePipelineYaml(stringYaml),
      (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.code, "INVALID_ROOT_OBJECT");
        return true;
      }
    );
  });

  it("throws PipelineError on missing required fields or invalid naming format", () => {
    const invalidNameYaml = `
name: "Invalid Pipeline Name with Spaces!"
actor:
  id: wikimedia
`;
    assert.throws(
      () => parsePipelineYaml(invalidNameYaml),
      (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.code, "SCHEMA_VALIDATION_ERROR");
        return true;
      }
    );
  });

  it("loads and parses pipeline config from file", () => {
    const tempFile = join(tmpdir(), `test-pipeline-${Date.now()}.yaml`);
    const yaml = `
name: file-pipeline-test
actor:
  id: wikimedia
  config:
    title: "Architecture"
`;
    writeFileSync(tempFile, yaml, "utf8");

    try {
      const config = loadPipelineConfigFile(tempFile);
      assert.equal(config.name, "file-pipeline-test");
    } finally {
      unlinkSync(tempFile);
    }
  });

  it("throws PipelineError when file does not exist", () => {
    assert.throws(
      () => loadPipelineConfigFile("/tmp/non_existent_pipeline_file.yaml"),
      (err: unknown) => {
        assert.ok(err instanceof PipelineError);
        assert.equal(err.code, "FILE_NOT_FOUND");
        return true;
      }
    );
  });
});
