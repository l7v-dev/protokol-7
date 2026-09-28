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

  it("verifies actor wiki template exists and specifies mandatory Mermaid diagrams", () => {
    const wikiTemplatePath = join(process.cwd(), "docs", "actor-wiki-template.md");
    assert.ok(existsSync(wikiTemplatePath), "docs/actor-wiki-template.md must exist");

    const content = readFileSync(wikiTemplatePath, "utf8");
    assert.ok(content.includes("flowchart TD"), "Wiki template must include Mermaid flowchart");
    assert.ok(
      content.includes("sequenceDiagram"),
      "Wiki template must include Mermaid sequence diagram"
    );
    assert.ok(
      content.includes("stateDiagram-v2"),
      "Wiki template must include Mermaid state diagram"
    );
    assert.ok(
      content.includes("SSRFGuard.validateUrlWithDns"),
      "Wiki template must specify SSRF invariant"
    );
  });

  it("verifies Wikipedia actor structure, test suite, and wiki.md specification", () => {
    const actorFile = join(process.cwd(), "src", "actors", "corpus", "wikipedia-actor.ts");
    const testFile = join(process.cwd(), "tests", "wikipedia-actor.test.ts");
    const wikimediaTestFile = join(process.cwd(), "tests", "wikimedia-actor.test.ts");
    const wikiFile = join(process.cwd(), "docs", "actors", "wikipedia.md");

    assert.ok(existsSync(actorFile), "wikipedia-actor.ts must exist");
    assert.ok(existsSync(testFile), "wikipedia-actor.test.ts must exist");
    assert.ok(existsSync(wikimediaTestFile), "wikimedia-actor.test.ts must exist");
    assert.ok(existsSync(wikiFile), "docs/actors/wikipedia.md must exist");

    const wikiContent = readFileSync(wikiFile, "utf8");
    assert.ok(
      wikiContent.includes("flowchart TD"),
      "Wikipedia wiki must include Mermaid flowchart"
    );
    assert.ok(
      wikiContent.includes("sequenceDiagram"),
      "Wikipedia wiki must include Mermaid sequence diagram"
    );
    assert.ok(
      wikiContent.includes("stateDiagram-v2"),
      "Wikipedia wiki must include Mermaid state diagram"
    );
  });
});
