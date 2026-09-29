/**
 * MetamathActor - Metamath Proof Explorer formal mathematical proofs,
 * axioms, hypotheses, and step-by-step verification chains harvester.
 * Conforms to docs/actor-contract.md and docs/actors/metamath.md.
 */

import * as cheerio from "cheerio";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  MetamathActorResult,
  MetamathActorTaskOptions,
  MetamathHypothesis,
  MetamathProofStep,
  MetamathSearchResultItem,
  MetamathTheorem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const METAMATH_BASE_URL = "https://us.metamath.org";

const DB_PATH_MAP: Record<string, string> = {
  "set.mm": "mpeuni",
  "iset.mm": "ileuni",
  "ql.mm": "qleuni",
};

export class MetamathActor implements IActor<MetamathActorResult> {
  readonly actorType = "metamath" as const;
  readonly description =
    "Harvests formal mathematical proofs, axioms, hypotheses, and step-by-step verification chains from the Metamath Proof Explorer.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<MetamathActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: MetamathActorTaskOptions =
      task.options?.metamathOptions || (task.options as unknown as MetamathActorTaskOptions) || {};
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

      // 2. Resolve parameters & action
      const resolved = this.resolveParameters(task.targetUrl, options);

      // 3. Build upstream URL
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

      // 5. Fetch content
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await safeRedirectFetch(endpoint, {
          method: "GET",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": USER_AGENT,
            ...(task.options?.headers || {}),
          },
          signal: controller.signal,
          allowLocalNetwork,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Metamath returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const html = await response.text();

      // 6. Parse response based on action
      const parsed = this.parseResponse(
        resolved.action,
        html,
        endpoint,
        resolved.theorem || resolved.axiom || "mpc2",
        resolved.database,
        resolved.includeProofSteps
      );

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: parsed,
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
   * Resolves action, theorem name, axiom name, query, database, and options.
   */
  resolveParameters(
    targetUrl: string | undefined,
    options: MetamathActorTaskOptions
  ): {
    action: "theorem" | "search" | "axiom";
    theorem?: string;
    axiom?: string;
    query?: string;
    database: "set.mm" | "iset.mm" | "ql.mm";
    includeProofSteps: boolean;
    limit: number;
  } {
    let action: "theorem" | "search" | "axiom" = options.action || "theorem";
    let theorem = options.theorem?.trim().toLowerCase();
    let axiom = options.axiom?.trim().toLowerCase();
    let query = options.query?.trim();
    let database: "set.mm" | "iset.mm" | "ql.mm" = options.database || "set.mm";
    const includeProofSteps = options.includeProofSteps ?? true;
    const limit = Math.max(1, Math.min(options.limit || 20, 100));

    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        const path = parsed.pathname;

        if (path.includes("/ileuni/")) database = "iset.mm";
        else if (path.includes("/qleuni/")) database = "ql.mm";
        else database = "set.mm";

        if (path.includes("mmfind.html")) {
          action = "search";
          query = parsed.searchParams.get("title") || query;
        } else {
          const match = path.match(/\/([^/]+)\.html$/);
          if (match?.[1]) {
            const sym = decodeURIComponent(match[1]).toLowerCase();
            if (sym.startsWith("ax-")) {
              action = "axiom";
              axiom = sym;
            } else {
              action = "theorem";
              theorem = sym;
            }
          }
        }
      } catch {
        // Fall back to options
      }
    }

    if (axiom) {
      action = "axiom";
    } else if (query && !theorem) {
      action = "search";
    } else if (!theorem) {
      theorem = "mpc2";
    }

    return {
      action,
      theorem,
      axiom,
      query,
      database,
      includeProofSteps,
      limit,
    };
  }

  /**
   * Builds the upstream URL. In test mode, targetUrl is respected.
   */
  buildEndpointUrl(
    targetUrl: string | undefined,
    resolved: ReturnType<typeof this.resolveParameters>
  ): string {
    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      return targetUrl;
    }

    const folder = DB_PATH_MAP[resolved.database] || "mpeuni";

    if (resolved.action === "search") {
      const q = encodeURIComponent(resolved.query || "pythag");
      return `${METAMATH_BASE_URL}/${folder}/mmfind.html?title=${q}`;
    }

    const targetSymbol = resolved.action === "axiom" ? resolved.axiom : resolved.theorem;
    return `${METAMATH_BASE_URL}/${folder}/${encodeURIComponent(targetSymbol || "mpc2")}.html`;
  }

  /**
   * Parses HTML into structured MetamathActorResult.
   */
  parseResponse(
    action: "theorem" | "search" | "axiom",
    html: string,
    endpoint: string,
    symbol: string,
    database: string,
    includeProofSteps: boolean
  ): MetamathActorResult {
    const $ = cheerio.load(html);

    if (action === "search") {
      const searchResults: MetamathSearchResultItem[] = [];
      $("table tr, ul li").each((_, el) => {
        const linkEl = $(el).find("a").first();
        const href = linkEl.attr("href") || "";
        const name = linkEl.text().trim();
        const fullText = $(el).text().trim();

        if (name && href.endsWith(".html") && !href.includes("mmfind")) {
          const folder = DB_PATH_MAP[database] || "mpeuni";
          const desc = $(el).find("td").last().text().trim() || fullText;
          searchResults.push({
            name,
            database,
            url: href.startsWith("http") ? href : `${METAMATH_BASE_URL}/${folder}/${href}`,
            description: desc.replace(name, "").trim() || undefined,
          });
        }
      });

      const markdown = [
        `# Metamath Proof Explorer Search Results`,
        `**Database**: ${database}`,
        `**Query URL**: ${endpoint}`,
        `**Total Found**: ${searchResults.length}`,
        "",
        ...searchResults.map(
          (r, i) => `${i + 1}. [${r.name}](${r.url})${r.description ? ` - ${r.description}` : ""}`
        ),
      ].join("\n");

      return {
        action: "search",
        queryUrl: endpoint,
        totalResults: searchResults.length,
        searchResults,
        markdown,
      };
    }

    // Default: action === "theorem" or "axiom"
    let name = symbol;
    const titleMatch = $("title")
      .text()
      .match(/(?:Theorem|Axiom)\s+([a-zA-Z0-9._-]+)/i);
    if (titleMatch) {
      name = titleMatch[1];
    } else {
      const headingMatch = $("h1, b, center")
        .text()
        .match(/(?:Theorem|Axiom)\s+([a-zA-Z0-9._-]+)/i);
      if (headingMatch) name = headingMatch[1];
    }

    // Description text
    const descriptionLines: string[] = [];
    $("table")
      .first()
      .prevAll("p, center")
      .each((_, el) => {
        const text = $(el).text().trim();
        if (text && !text.includes("Metamath Proof Explorer")) {
          descriptionLines.push(text);
        }
      });
    if (descriptionLines.length === 0) {
      $("p").each((_, el) => {
        const text = $(el).text().trim();
        if (
          text &&
          !text.includes("Metamath Proof Explorer") &&
          !text.includes("Colors of variables")
        ) {
          descriptionLines.push(text);
        }
      });
    }
    const description = descriptionLines.join("\n\n");

    // Hypotheses and Assertion
    const hypotheses: MetamathHypothesis[] = [];
    let assertion = "";

    $("table").each((_, table) => {
      const tableText = $(table).text();
      if (
        $(table).attr("summary") === "Proof" ||
        (tableText.includes("Step") && tableText.includes("Hyp") && tableText.includes("Ref"))
      ) {
        return;
      }

      $(table)
        .find("tr")
        .each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length >= 2) {
            const label = $(cells[0]).text().trim();
            const expr = $(cells[1]).text().trim();

            if (label.toLowerCase().includes("assertion")) {
              assertion = expr;
            } else if (
              label.toLowerCase().includes("hypothes") ||
              label.match(/^[a-zA-Z0-9._-]+(?:\.[0-9]+)?$/)
            ) {
              hypotheses.push({
                tag: label,
                type: label.startsWith("d") ? "distinct" : "essential",
                expression: expr,
              });
            }
          }
        });
    });

    if (!assertion) {
      const assertionRow = $("tr:contains('Assertion')");
      if (assertionRow.length) {
        assertion = assertionRow.find("td").last().text().trim();
      }
    }

    // Proof steps table
    const proofSteps: MetamathProofStep[] = [];
    if (includeProofSteps) {
      const proofTable = $("table[summary='Proof'], table")
        .filter((_, t) => {
          const text = $(t).text();
          return text.includes("Step") && text.includes("Hyp") && text.includes("Ref");
        })
        .first();

      if (proofTable.length) {
        proofTable.find("tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length >= 4) {
            const stepNum = parseInt($(cells[0]).text().trim(), 10);
            if (!Number.isNaN(stepNum)) {
              const hypStr = $(cells[1]).text().trim();
              const hyp = hypStr ? hypStr.split(/\s*,\s*|\s+/).filter(Boolean) : [];
              const ref = $(cells[2]).text().trim();
              const expression = $(cells[3]).text().trim();

              proofSteps.push({
                step: stepNum,
                hyp,
                ref,
                expression,
              });
            }
          }
        });
      }
    }

    // Cross-references
    const usedBy: string[] = [];
    const uses: string[] = [];
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      const parentText = $(el).parent().text();

      if (href.endsWith(".html") && text?.match(/^[a-zA-Z0-9._-]+$/)) {
        if (parentText.toLowerCase().includes("referenced by")) {
          if (!usedBy.includes(text) && text !== name) usedBy.push(text);
        } else if (parentText.toLowerCase().includes("uses")) {
          if (!uses.includes(text) && text !== name) uses.push(text);
        }
      }
    });

    // Format formal GFM Markdown
    const markdownLines: string[] = [
      `# Metamath: ${name} (${action === "axiom" ? "Axiom" : "Theorem"})`,
      `**Database**: \`${database}\``,
      `**Source URL**: ${endpoint}`,
      "",
    ];

    if (description) {
      markdownLines.push("## Description", "", description, "");
    }

    if (hypotheses.length > 0) {
      markdownLines.push("## Hypotheses", "");
      markdownLines.push("| Tag | Type | Expression |");
      markdownLines.push("|---|---|---|");
      for (const h of hypotheses) {
        markdownLines.push(`| \`${h.tag}\` | ${h.type} | \`${h.expression}\` |`);
      }
      markdownLines.push("");
    }

    if (assertion) {
      markdownLines.push("## Assertion", "", `$$\n${assertion}\n$$`, "");
    }

    if (proofSteps.length > 0) {
      markdownLines.push(`## Formal Proof (${proofSteps.length} Steps)`, "");
      markdownLines.push("| Step | Hyp | Ref | Expression |");
      markdownLines.push("|---|---|---|---|");
      for (const s of proofSteps) {
        markdownLines.push(
          `| ${s.step} | ${s.hyp.join(", ") || "-"} | [${s.ref}](${METAMATH_BASE_URL}/${DB_PATH_MAP[database]}/${s.ref}.html) | \`${s.expression}\` |`
        );
      }
      markdownLines.push("");
    }

    if (usedBy.length > 0 || uses.length > 0) {
      markdownLines.push("## Cross References", "");
      if (uses.length > 0) {
        markdownLines.push(`**Theorems/Axioms Used**: ${uses.map((u) => `\`${u}\``).join(", ")}`);
      }
      if (usedBy.length > 0) {
        markdownLines.push(
          `**Referenced By**: ${usedBy
            .slice(0, 30)
            .map((u) => `\`${u}\``)
            .join(", ")}${usedBy.length > 30 ? ` ... (${usedBy.length} total)` : ""}`
        );
      }
      markdownLines.push("");
    }

    const markdown = markdownLines.join("\n");

    const theorem: MetamathTheorem = {
      name,
      database,
      url: endpoint,
      description,
      hypotheses,
      assertion,
      proofSteps: proofSteps.length > 0 ? proofSteps : undefined,
      crossReferences: {
        usedBy: usedBy.length > 0 ? usedBy : undefined,
        uses: uses.length > 0 ? uses : undefined,
      },
      markdown,
    };

    return {
      action,
      queryUrl: endpoint,
      totalResults: 1,
      theorem,
      markdown,
    };
  }
}
