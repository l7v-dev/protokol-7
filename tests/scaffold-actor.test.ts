import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("Actor Scaffolding Generator (scripts/scaffold-actor.mjs)", () => {
  const scriptPath = join(process.cwd(), "scripts", "scaffold-actor.mjs");

  it("fails with exit code 1 when insufficient arguments are provided", () => {
    assert.throws(
      () => {
        execSync(`node "${scriptPath}"`, { stdio: "pipe" });
      },
      (error: unknown) => {
        const err = error as { status?: number; stderr?: Buffer; stdout?: Buffer };
        assert.equal(err.status, 1);
        const stderr = err.stderr?.toString() || err.stdout?.toString() || "";
        assert.ok(stderr.includes("Usage:"));
        return true;
      }
    );
  });

  it("fails with exit code 1 when an invalid category is provided", () => {
    assert.throws(
      () => {
        execSync(`node "${scriptPath}" invalid-category test-actor`, { stdio: "pipe" });
      },
      (error: unknown) => {
        const err = error as { status?: number; stderr?: Buffer; stdout?: Buffer };
        assert.equal(err.status, 1);
        const stderr = err.stderr?.toString() || err.stdout?.toString() || "";
        assert.ok(stderr.includes("Invalid category"));
        return true;
      }
    );
  });

  it("fails with exit code 1 when an invalid actor name is provided", () => {
    assert.throws(
      () => {
        execSync(`node "${scriptPath}" web Invalid_Name`, { stdio: "pipe" });
      },
      (error: unknown) => {
        const err = error as { status?: number; stderr?: Buffer; stdout?: Buffer };
        assert.equal(err.status, 1);
        const stderr = err.stderr?.toString() || err.stdout?.toString() || "";
        assert.ok(stderr.includes("kebab-case"));
        return true;
      }
    );
  });

  it("fails with exit code 1 when target actor already exists", () => {
    assert.throws(
      () => {
        execSync(`node "${scriptPath}" web cheerio-scraper`, { stdio: "pipe" });
      },
      (error: unknown) => {
        const err = error as { status?: number; stderr?: Buffer; stdout?: Buffer };
        assert.equal(err.status, 1);
        const stderr = err.stderr?.toString() || err.stdout?.toString() || "";
        assert.ok(stderr.includes("already exists"));
        return true;
      }
    );
  });

  it("verifies actor template file exists and contains mandatory security invariants", () => {
    const templatePath = join(process.cwd(), "src", "actors", "actor.template.ts");
    assert.ok(existsSync(templatePath), "actor.template.ts must exist");

    const content = readFileSync(templatePath, "utf8");
    assert.ok(
      content.includes("SSRFGuard.validateUrlWithDns"),
      "Template must include SSRF DNS validation"
    );
    assert.ok(content.includes("allowLocalNetwork"), "Template must handle test environment flag");
    assert.ok(content.includes("safeRedirectFetch"), "Template must use safe redirect fetcher");
    assert.ok(content.includes("executionDurationMs"), "Template must capture duration telemetry");
    assert.ok(content.includes("DEFAULT_TIMEOUT_MS"), "Template must define default timeout");
  });
});
