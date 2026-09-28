/**
 * LeanMathlibActor - Computer-verified formal proofs, theorems, lemmas,
 * definitions, and proof tactic steps harvester from Lean 4 and Mathlib4.
 * Conforms to docs/actor-contract.md and docs/actors/lean-mathlib.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  LeanMathlibActorResult,
  LeanMathlibActorTaskOptions,
  LeanMathlibItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const DEFAULT_REPO = "leanprover-community/mathlib4";
const DEFAULT_BRANCH = "master";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com";
const GITHUB_API_BASE = "https://api.github.com";

const REPRESENTATIVE_MATHLIB_PATHS = [
  "Mathlib/Data/Nat/Basic.lean",
  "Mathlib/Algebra/Group/Basic.lean",
  "Mathlib/Logic/Basic.lean",
  "Mathlib/Topology/Basic.lean",
  "Mathlib/Order/Basic.lean",
];

export class LeanMathlibActor implements IActor<LeanMathlibActorResult> {
  readonly actorType = "lean-mathlib" as const;
  readonly description =
    "Harvests computer-verified formal theorems, lemmas, definitions, and proof tactic steps from Lean 4 and Mathlib4 repositories.";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<LeanMathlibActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: LeanMathlibActorTaskOptions =
      task.options?.leanMathlibOptions ||
      (task.options as unknown as LeanMathlibActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF check on targetUrl if provided
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve parameters
      const resolved = this.resolveParameters(task.targetUrl, options);

      // 3. Build upstream endpoint URL
      const endpoint = this.buildEndpointUrl(task.targetUrl, resolved);

      // 4. Secondary SSRF check on resolved endpoint
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed for endpoint ${endpoint}: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Build headers
      const token = resolved.githubToken || process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        Accept: resolved.action === "search" ? "application/vnd.github.v3+json" : "text/plain",
        "User-Agent": USER_AGENT,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(task.options?.headers || {}),
      };

      // 6. Network fetch with abort controller
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          method: "GET",
          headers,
          signal: controller.signal,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Lean Mathlib API returned HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      let items: LeanMathlibItem[] = [];

      // 7. Parse response depending on action
      if (resolved.action === "search") {
        const json = (await response.json()) as Record<string, unknown>;
        items = this.parseSearchResults(json, resolved.repo);
      } else {
        const sourceText = await response.text();
        items = this.parseLeanDeclarations(
          sourceText,
          resolved.repo,
          resolved.path,
          resolved.theorem
        );
      }

      // Respect limit
      if (resolved.limit && items.length > resolved.limit) {
        items = items.slice(0, resolved.limit);
      }

      const markdown = this.renderMarkdown(resolved.action, resolved.repo, resolved.path, items);

      const resultData: LeanMathlibActorResult = {
        action: resolved.action,
        repo: resolved.repo,
        totalDeclarations: items.length,
        items,
        queryUrl: endpoint,
        markdown,
      };

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: resultData,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"));
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isAbort ? "timed_out" : "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Resolves action, repository, path, theorem name, and query.
   */
  resolveParameters(
    targetUrl: string,
    options: LeanMathlibActorTaskOptions
  ): {
    action: "file" | "theorem" | "search" | "random";
    repo: string;
    path: string;
    theorem?: string;
    query?: string;
    limit: number;
    githubToken?: string;
  } {
    let action: "file" | "theorem" | "search" | "random" = "file";
    let repo = options.repo?.trim() || DEFAULT_REPO;
    let path = options.path?.trim() || "Mathlib/Data/Nat/Basic.lean";
    const theorem = options.theorem?.trim();
    const query = options.query?.trim();
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);
    const githubToken = options.githubToken;

    if (options.action) {
      const act = options.action.toLowerCase();
      if (act === "theorem" || act === "search" || act === "random" || act === "file") {
        action = act;
      }
    } else if (theorem) {
      action = "theorem";
    } else if (query) {
      action = "search";
    }

    if (action === "random") {
      const idx = Math.floor(Math.random() * REPRESENTATIVE_MATHLIB_PATHS.length);
      path = REPRESENTATIVE_MATHLIB_PATHS[idx];
      action = "file";
    }

    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.hostname === "github.com") {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) {
            repo = `${parts[0]}/${parts[1]}`;
          }
          if (parts.includes("blob") && parts.length > parts.indexOf("blob") + 2) {
            path = parts.slice(parts.indexOf("blob") + 2).join("/");
          }
        } else if (parsed.hostname === "raw.githubusercontent.com") {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 3) {
            repo = `${parts[0]}/${parts[1]}`;
            path = parts.slice(3).join("/");
          }
        }
      } catch {
        // Fallback to options
      }
    }

    // Clean leading slashes from path
    path = path.replace(/^\/+/, "");

    return {
      action,
      repo,
      path,
      theorem,
      query,
      limit,
      githubToken,
    };
  }

  /**
   * Constructs the source or API endpoint URL.
   */
  buildEndpointUrl(
    targetUrl: string,
    resolved: {
      action: "file" | "theorem" | "search" | "random";
      repo: string;
      path: string;
      query?: string;
    }
  ): string {
    if (
      targetUrl &&
      (targetUrl.includes("raw.githubusercontent.com") ||
        targetUrl.includes("/test") ||
        targetUrl.includes("/rows"))
    ) {
      return targetUrl;
    }

    if (resolved.action === "search") {
      const encQuery = encodeURIComponent(resolved.query || "theorem");
      return `${GITHUB_API_BASE}/search/code?q=${encQuery}+repo:${resolved.repo}+extension:lean`;
    }

    return `${GITHUB_RAW_BASE}/${resolved.repo}/${DEFAULT_BRANCH}/${resolved.path}`;
  }

  /**
   * Parses Lean 4 source text into structured declarations, docstrings, and proof tactics.
   */
  parseLeanDeclarations(
    sourceText: string,
    repo: string,
    filePath: string,
    filterTheorem?: string
  ): LeanMathlibItem[] {
    const items: LeanMathlibItem[] = [];

    // Pattern to capture docstring and declaration header
    // e.g.: /-- doc --/ theorem foo (a b : Nat) : a + b = b + a := by
    const declRegex =
      /(?:\/--\s*([\s\S]*?)\s*-\/\s*)?(?:(?:protected|private|scoped|noncomputable|@[^\n]+)\s+)*(theorem|lemma|def|axiom|instance)\s+([A-Za-z0-9_.'’]+)([\s\S]*?)(?=(?:\n\/--|\n(?:protected|private|scoped|noncomputable|@[^\n]+|\s*)*(?:theorem|lemma|def|axiom|instance)\s+[A-Za-z0-9_.'’]+|\s*$))/g;

    let match: RegExpExecArray | null;

    while (true) {
      match = declRegex.exec(sourceText);
      if (!match) break;

      const rawDocstring = match[1]?.trim();
      const kind = match[2];
      const name = match[3];
      const body = match[4]?.trim() || "";

      if (filterTheorem && name !== filterTheorem && !name.endsWith(`.${filterTheorem}`)) {
        continue;
      }

      // Split signature and proof by `:=`
      let signature = "";
      let proof = "";
      const tactics: string[] = [];

      const assignIndex = body.indexOf(":=");
      if (assignIndex !== -1) {
        signature = body.slice(0, assignIndex).trim();
        proof = body.slice(assignIndex + 2).trim();

        // If proof is in tactic mode (`by ...`)
        if (proof.startsWith("by")) {
          const tacticLines = proof
            .slice(2)
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith("--"));
          tactics.push(...tacticLines);
        }
      } else {
        signature = body;
      }

      // Clean signature (remove leading colon if present)
      if (signature.startsWith(":")) {
        signature = signature.slice(1).trim();
      }

      const fullCode = [
        rawDocstring ? `/-- ${rawDocstring} -/` : "",
        `${kind} ${name} ${signature ? `: ${signature}` : ""} ${proof ? `:= ${proof}` : ""}`.trim(),
      ]
        .filter(Boolean)
        .join("\n");

      const itemUrl = `https://github.com/${repo}/blob/${DEFAULT_BRANCH}/${filePath}#${name}`;

      items.push({
        name,
        kind,
        docstring: rawDocstring || undefined,
        signature,
        proof: proof || undefined,
        tactics: tactics.length > 0 ? tactics : undefined,
        code: fullCode,
        file: filePath,
        repo,
        url: itemUrl,
      });
    }

    return items;
  }

  /**
   * Parses GitHub Code Search API response.
   */
  parseSearchResults(json: Record<string, unknown>, repo: string): LeanMathlibItem[] {
    const items: LeanMathlibItem[] = [];
    const jsonItems = json.items as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(jsonItems)) return items;

    for (const entry of jsonItems) {
      const path = String(entry.path || "");
      const name = String(entry.name || path.split("/").pop() || "declaration");
      const htmlUrl = String(
        entry.html_url || `https://github.com/${repo}/blob/${DEFAULT_BRANCH}/${path}`
      );

      items.push({
        name,
        kind: "theorem",
        signature: `File search result: ${path}`,
        code: `-- Found in ${path}`,
        file: path,
        repo,
        url: htmlUrl,
      });
    }

    return items;
  }

  /**
   * Formats extracted formal proofs and declarations into GFM Markdown.
   */
  renderMarkdown(action: string, repo: string, path: string, items: LeanMathlibItem[]): string {
    const lines: string[] = [];
    lines.push(`# Lean 4 & Mathlib Computer-Verified Formal Proofs`);
    lines.push(`**Repository:** \`${repo}\``);
    lines.push(`**Path:** \`${path}\``);
    lines.push(`**Action Mode:** \`${action}\``);
    lines.push(`**Total Declarations:** ${items.length}`);
    lines.push("");

    if (items.length === 0) {
      lines.push("_No formal declarations found for the query or file._");
      return lines.join("\n");
    }

    items.forEach((item, idx) => {
      lines.push(`## ${idx + 1}. \`${item.name}\` (${item.kind})`);
      lines.push(`[Source File Link](${item.url})`);
      lines.push("");

      if (item.docstring) {
        lines.push(`> ${item.docstring.replace(/\n/g, "\n> ")}`);
        lines.push("");
      }

      if (item.signature) {
        lines.push("### Mathematical Statement / Type Signature");
        lines.push("```lean4");
        lines.push(`${item.kind} ${item.name} : ${item.signature}`);
        lines.push("```");
        lines.push("");
      }

      if (item.tactics && item.tactics.length > 0) {
        lines.push("### Verified Proof Tactic Sequence (`by`)");
        lines.push("```lean4");
        for (const tac of item.tactics) {
          lines.push(`  ${tac}`);
        }
        lines.push("```");
        lines.push("");
      } else if (item.proof) {
        lines.push("### Proof Term");
        lines.push("```lean4");
        lines.push(item.proof);
        lines.push("```");
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  }
}
