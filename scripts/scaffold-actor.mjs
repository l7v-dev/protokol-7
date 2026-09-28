#!/usr/bin/env node
/**
 * scripts/scaffold-actor.mjs
 *
 * Clean Actor Scaffolding CLI for protokol-7.
 * Generates an actor implementation, colocated test suite, technical wiki (with Mermaid diagrams),
 * and sample payload conforming strictly to docs/actor-contract.md and docs/actor-wiki-template.md.
 *
 * Architecture Invariant:
 * - Domain Actor: src/actors/<category>/<name>-actor.ts
 * - Test Suite: tests/<name>-actor.test.ts
 * - Technical Wiki: docs/actors/<name>.md
 * - Sample Payload: examples/actors/<name>.json
 * - MCP Server: Centralized at src/mcp/protokol-mcp-server.ts via src/actors/actor-manifests.ts
 *
 * Usage:
 *   node scripts/scaffold-actor.mjs <category> <name> [description]
 *   npm run make:actor -- <category> <name> [description]
 *
 * Example:
 *   node scripts/scaffold-actor.mjs web sample-crawler "Crawls pages from target domain"
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const VALID_CATEGORIES = ["web", "corpus", "documents"];

function toPascalCase(str) {
  return str
    .split("-")
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
}

function printUsage() {
  console.log("Usage: node scripts/scaffold-actor.mjs <category> <name> [description]");
  console.log("Categories: web | corpus | documents");
  console.log("Name must be kebab-case (e.g. academic-indexer, domain-crawler)");
}

const args = process.argv.slice(2);
if (args.length < 2) {
  printUsage();
  process.exit(1);
}

const category = args[0].toLowerCase();
const name = args[1].toLowerCase();
const description = args[2] || `Extraction actor for ${name}.`;

if (!VALID_CATEGORIES.includes(category)) {
  console.error(
    `[ERROR] Invalid category '${category}'. Must be one of: ${VALID_CATEGORIES.join(", ")}`
  );
  process.exit(1);
}

if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
  console.error(
    `[ERROR] Actor name '${name}' must be valid kebab-case (lowercase alphanumeric with hyphens).`
  );
  process.exit(1);
}

const rootDir = resolve(process.cwd());
const actorFilePath = join(rootDir, "src", "actors", category, `${name}-actor.ts`);
const testFilePath = join(rootDir, "tests", `${name}-actor.test.ts`);
const docsDir = join(rootDir, "docs", "actors");
const wikiFilePath = join(docsDir, `${name}.md`);
const exampleFilePath = join(rootDir, "examples", "actors", `${name}.json`);
const categoryBarrelPath = join(rootDir, "src", "actors", category, "index.ts");

if (existsSync(actorFilePath)) {
  console.error(`[ERROR] Target actor already exists: ${actorFilePath}`);
  process.exit(1);
}

mkdirSync(docsDir, { recursive: true });

const pascalName = toPascalCase(name);
const className = `${pascalName}Actor`;
const optionsInterface = `${pascalName}ActorTaskOptions`;
const resultInterface = `${pascalName}ActorResult`;

// 1. Generate Actor Implementation
const actorCode = `/**
 * ${className} - ${description}
 * Conforms to docs/actor-contract.md and docs/actors/${name}.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ActorType,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";

export interface ${optionsInterface} {
  timeoutMs?: number;
  query?: string;
  limit?: number;
  customHeaders?: Record<string, string>;
}

export interface ${resultInterface} {
  sourceUrl: string;
  totalItems: number;
  items: Array<{
    id: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class ${className} implements IActor<${resultInterface}> {
  readonly actorType = "${name}" as unknown as ActorType;
  readonly description = "${description}";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<${resultInterface}>> {
    const startTime = context?.startTime || Date.now();
    const options = (task.options || {}) as ${optionsInterface};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if explicitly provided as HTTP URL
      if (task.targetUrl && (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: \`SSRF validation failed: \${initialSsrfCheck.reason}\`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve endpoint URL
      const endpoint = this.buildEndpointUrl(task.targetUrl, options);

      // 3. Secondary SSRF check on resolved endpoint
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: \`SSRF validation failed on target endpoint: \${ssrfCheck.reason}\`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 4. Dispatch HTTP request with abort controller
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          signal: controller.signal,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/plain, */*",
            ...options.customHeaders,
          },
          timeoutMs,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timeoutTimer);
      }

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: \`Upstream request failed with HTTP \${response.status}: \${response.statusText}\`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Parse and normalize data
      const rawText = await response.text();
      const extractedData = this.parseResponse(rawText, endpoint);

      // 6. Return standardized success result with duration telemetry
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: extractedData,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      // 7. Structured error capture (never swallow exceptions)
      const msg = error instanceof Error ? error.message : String(error);
      const isTimeout = msg.includes("aborted") || msg.includes("timeout");
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        statusCode: isTimeout ? 408 : 500,
        errorMessage: msg,
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private buildEndpointUrl(targetUrl?: string, options?: ${optionsInterface}): string {
    if (targetUrl) {
      return targetUrl;
    }
    const query = encodeURIComponent(options?.query || "");
    return \`https://api.example.com/v1/search?q=\${query}&limit=\${options?.limit || 10}\`;
  }

  private parseResponse(rawContent: string, sourceUrl: string): ${resultInterface} {
    try {
      const parsed = JSON.parse(rawContent);
      const items = Array.isArray(parsed) ? parsed : parsed.items || [];
      return {
        sourceUrl,
        totalItems: items.length,
        items: items.map((item: Record<string, unknown>, index: number) => ({
          id: String(item.id || \`item-\${index}\`),
          title: String(item.title || "Untitled"),
          content: String(item.content || item.body || ""),
          metadata: typeof item.metadata === "object" ? (item.metadata as Record<string, unknown>) : undefined,
        })),
      };
    } catch {
      return {
        sourceUrl,
        totalItems: 1,
        items: [
          {
            id: "raw-1",
            title: "Plain Text Extraction",
            content: rawContent.trim(),
          },
        ],
      };
    }
  }
}
`;

// 2. Generate Technical Wiki Documentation (with Mermaid Diagrams)
const wikiCode = `# ${pascalName} Actor — Teknik Wiki ve Çalışma Şartnamesi

## 1. Metadata ve Sınıflandırma

| Alan | Değer |
|---|---|
| **Aktör Tanımlayıcı (Type)** | \`${name}\` |
| **Kategori** | \`${category}\` (\`src/actors/${category}/${name}-actor.ts\`) |
| **Sürüm** | \`1.0.0\` |
| **Birincil Sınıf** | \`${className}\` |
| **MCP Aracı** | \`${name}_query\` (\`src/mcp/protokol-mcp-server.ts\`) |
| **Test Dosyası** | \`tests/${name}-actor.test.ts\` |

---

## 2. Mekanizma ve Teknik Genel Bakış

${description}

---

## 3. Mimari ve Bileşen Sınırları (Mermaid Flowchart)

\`\`\`mermaid
flowchart TD
    subgraph Client["İstemci Katmanı"]
        Agent["AI Ajan (Claude / Antigravity)"]
        REST["HTTP REST Router"]
    end

    subgraph CentralMCP["Merkezi MCP Katmanı"]
        MCPServer["protokol-mcp-server.ts<br/>(${name}_query)"]
        Manifest["actor-manifests.ts"]
    end

    subgraph ActorModule["Aktör Alan Katmanı"]
        Core["${name}-actor.ts<br/>(${className})"]
    end

    subgraph SecurityPerimeter["Güvenlik Katmanı"]
        SSRF["SSRFGuard.validateUrlWithDns"]
        Fetch["safeRedirectFetch"]
    end

    Agent --> MCPServer
    MCPServer --> Manifest
    MCPServer --> Core
    REST --> Core
    Core --> SSRF
    SSRF --> Fetch
\`\`\`

---

## 4. İstek Yaşam Döngüsü ve Sıra Şeması (Mermaid Sequence Diagram)

\`\`\`mermaid
sequenceDiagram
    autonumber
    participant Client as Çağırıcı
    participant Actor as ${className}
    participant SSRF as SSRFGuard
    participant Net as safeRedirectFetch

    Client->>Actor: run(task, context)
    Actor->>SSRF: validateUrlWithDns(endpoint)
    alt SSRF Engeli
        SSRF-->>Actor: { valid: false }
        Actor-->>Client: 403 Forbidden
    else Güvenli Hedef
        SSRF-->>Actor: { valid: true }
        Actor->>Net: safeRedirectFetch(signal)
        Net-->>Actor: Response Body
        Actor-->>Client: 200 OK (Data)
    end
\`\`\`

---

## 5. Durum Makinesi (Mermaid State Diagram)

\`\`\`mermaid
stateDiagram-v2
    [*] --> Idle: Aktör Başlatıldı
    Idle --> ResolvingParams: run() çağrıldı
    ResolvingParams --> ValidatingSSRF: Hedef URL belirlendi
    ValidatingSSRF --> Failed: SSRF engeli (403)
    ValidatingSSRF --> DispatchingHTTP: DNS doğrulaması başarılı
    DispatchingHTTP --> TimedOut: 30.000 ms zaman aşımı (408)
    DispatchingHTTP --> Failed: Upstream HTTP hatası (4xx/5xx)
    DispatchingHTTP --> Transforming: 200 OK alındı
    Transforming --> Completed: Başarılı sonuç (200)
    Failed --> [*]
    TimedOut --> [*]
    Completed --> [*]
\`\`\`

---

## 6. Güvenlik İnvariantları

1. **SSRF Koruması:** \`SSRFGuard.validateUrlWithDns\` ile her ağ çağrısı doğrulanır.
2. **Zaman Aşımı:** 30.000 ms limit ve \`AbortController\` işletilir.
3. **Kullanıcı Aracısı:** Standart protokol başlığı kullanılır.
`;

// 3. Generate Unit Test Suite
const testCode = `import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ${className} } from "../src/actors/${category}/${name}-actor";
import type { ActorTask } from "../src/api/types";

describe("${className}", () => {
  it("initializes with correct actorType and description", () => {
    const actor = new ${className}();
    assert.equal(actor.actorType, "${name}");
    assert.ok(actor.description.length > 0);
  });

  it("blocks SSRF attempts to private or cloud metadata IPs", async () => {
    const actor = new ${className}();
    const task: ActorTask = {
      taskId: "test-ssrf-1",
      actorType: "${name}" as any,
      targetUrl: "http://169.254.169.254/latest/meta-data",
    };

    const result = await actor.run(task, { task, startTime: Date.now() });
    assert.equal(result.status, "failed");
    assert.equal(result.statusCode, 403);
    assert.ok(result.errorMessage?.includes("SSRF"));
  });
});
`;

// 4. Generate Example JSON
const exampleJson = JSON.stringify(
  {
    targetUrl: "https://example.com/api/data",
    query: "sample query",
    limit: 10,
    timeoutMs: 15000,
  },
  null,
  2
);

// Write files
writeFileSync(actorFilePath, actorCode, "utf8");
console.log(`[OK] Created actor: ${actorFilePath}`);

writeFileSync(wikiFilePath, wikiCode, "utf8");
console.log(`[OK] Created wiki: ${wikiFilePath}`);

writeFileSync(testFilePath, testCode, "utf8");
console.log(`[OK] Created test: ${testFilePath}`);

if (!existsSync(exampleFilePath)) {
  writeFileSync(exampleFilePath, `${exampleJson}\n`, "utf8");
  console.log(`[OK] Created example: ${exampleFilePath}`);
}

// Append to category barrel
if (existsSync(categoryBarrelPath)) {
  const barrelContent = readFileSync(categoryBarrelPath, "utf8");
  const exportLine = `export * from "./${name}-actor";\n`;
  if (!barrelContent.includes(exportLine)) {
    writeFileSync(categoryBarrelPath, `${barrelContent.trimEnd()}\n${exportLine}`, "utf8");
    console.log(`[OK] Appended export to ${categoryBarrelPath}`);
  }
}

console.log("\n=== REGISTRATION CHECKLIST (NEXT STEPS) ===");
console.log(`1. src/api/types.ts -> Add to ActorType union: | "${name}"`);
console.log(`2. src/actors/actor-manifests.ts -> Add manifest entry for "${name}"`);
console.log(`3. src/actors/actor-registry.ts -> Register: registry.register(new ${className}());`);
console.log(`4. src/index.ts -> Export: export * from "./actors/${category}/${name}-actor";`);
console.log(`5. Run verification: npm test tests/${name}-actor.test.ts\n`);
