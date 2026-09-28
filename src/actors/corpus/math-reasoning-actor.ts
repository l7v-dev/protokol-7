/**
 * MathReasoningActor - Mathematical problem solving and Chain-of-Thought (CoT)
 * reasoning corpus extraction actor (GSM8K, Hendrycks MATH, SVAMP, OlympiadBench).
 * Conforms to docs/actor-contract.md and docs/actors/math-reasoning.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  MathReasoningActorResult,
  MathReasoningActorTaskOptions,
  MathReasoningItem,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const HF_DATASETS_SERVER_BASE = "https://datasets-server.huggingface.co";

/**
 * Benchmark to Hugging Face dataset and config mapping.
 */
const BENCHMARK_MAP: Record<
  string,
  { dataset: string; defaultConfig: string; defaultSplit: string }
> = {
  gsm8k: {
    dataset: "openai/gsm8k",
    defaultConfig: "main",
    defaultSplit: "train",
  },
  math: {
    dataset: "EleutherAI/hendrycks_math",
    defaultConfig: "algebra",
    defaultSplit: "train",
  },
  svamp: {
    dataset: "ChilleD/SVAMP",
    defaultConfig: "default",
    defaultSplit: "train",
  },
  olympiadbench: {
    dataset: "HuggingFaceH4/OlympiadBench",
    defaultConfig: "default",
    defaultSplit: "train",
  },
};

export class MathReasoningActor implements IActor<MathReasoningActorResult> {
  readonly actorType = "math-reasoning" as const;
  readonly description =
    "Mathematical problem solving and Chain-of-Thought (CoT) reasoning corpus extraction actor (GSM8K, MATH, SVAMP).";

  async run(
    task: ActorTask,
    context: ActorRunContext
  ): Promise<ActorResult<MathReasoningActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: MathReasoningActorTaskOptions =
      task.options?.mathReasoningOptions ||
      (task.options as unknown as MathReasoningActorTaskOptions) ||
      {};
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if provided
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve parameters
      const resolved = this.resolveParameters(task.targetUrl, options);

      // 3. Build upstream API endpoint
      const endpoint = this.buildEndpointUrl(task.targetUrl, resolved);

      // 4. Secondary SSRF validation on resolved endpoint
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
      const headers: Record<string, string> = {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(task.options?.headers || {}),
      };

      const token = options.hfToken || process.env.HF_TOKEN;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

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
          errorMessage: `Datasets API returned HTTP ${response.status}: ${errorBody.slice(0, 300)}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      const json = (await response.json()) as Record<string, unknown>;

      // 7. Parse problems into standard MathReasoningItem array
      const problems = this.parseProblems(resolved.benchmark, json);
      const markdown = this.renderMarkdown(resolved.benchmark, resolved.subject, problems);

      const resultData: MathReasoningActorResult = {
        benchmark: resolved.benchmark,
        totalProblems: problems.length,
        problems,
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
   * Resolves benchmark, config, split, and pagination parameters.
   */
  resolveParameters(
    targetUrl: string,
    options: MathReasoningActorTaskOptions
  ): {
    benchmark: string;
    dataset: string;
    config: string;
    split: string;
    subject?: string;
    offset: number;
    limit: number;
  } {
    let benchmark = (options.benchmark || "gsm8k").toLowerCase();
    const subject = options.subject;
    const split = options.split;
    const offset = options.offset !== undefined ? options.offset : 0;
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      const lower = targetUrl.toLowerCase();
      if (lower.includes("gsm8k")) benchmark = "gsm8k";
      else if (lower.includes("hendrycks") || lower.includes("math")) benchmark = "math";
      else if (lower.includes("svamp")) benchmark = "svamp";
      else if (lower.includes("olympiad")) benchmark = "olympiadbench";
    }

    const mapping = BENCHMARK_MAP[benchmark] || {
      dataset: benchmark,
      defaultConfig: "default",
      defaultSplit: "train",
    };

    const dataset = mapping.dataset;
    const config = subject || mapping.defaultConfig;
    const finalSplit = split || mapping.defaultSplit;

    return {
      benchmark,
      dataset,
      config,
      split: finalSplit,
      subject,
      offset,
      limit,
    };
  }

  /**
   * Builds the API endpoint URL for streaming math benchmark rows.
   */
  buildEndpointUrl(
    targetUrl: string,
    resolved: {
      dataset: string;
      config: string;
      split: string;
      offset: number;
      limit: number;
    }
  ): string {
    if (targetUrl && (targetUrl.includes("/rows") || targetUrl.includes("/test"))) {
      return targetUrl;
    }

    const encDataset = encodeURIComponent(resolved.dataset);
    const encConfig = encodeURIComponent(resolved.config);
    const encSplit = encodeURIComponent(resolved.split);

    return `${HF_DATASETS_SERVER_BASE}/rows?dataset=${encDataset}&config=${encConfig}&split=${encSplit}&offset=${resolved.offset}&length=${resolved.limit}`;
  }

  /**
   * Parses JSON API rows into standard MathReasoningItem records.
   */
  parseProblems(benchmark: string, json: Record<string, unknown>): MathReasoningItem[] {
    const rawRows = Array.isArray(json?.rows) ? json.rows : Array.isArray(json) ? json : [];
    const items: MathReasoningItem[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i] as Record<string, unknown>;
      const row =
        raw && typeof raw.row === "object" && raw.row !== null
          ? (raw.row as Record<string, unknown>)
          : raw;

      if (!row) continue;

      let problem = "";
      let reasoning = "";
      let answer = "";
      let boxedAnswer: string | undefined;
      let rawSolution: string | undefined;
      const subject = typeof row.type === "string" ? row.type : undefined;
      const level =
        typeof row.level === "string" || typeof row.level === "number" ? row.level : undefined;

      // 1. GSM8K format: question + answer (with reasoning + #### answer)
      if (benchmark === "gsm8k") {
        problem = String(row.question || "");
        rawSolution = String(row.answer || "");

        if (rawSolution.includes("####")) {
          const parts = rawSolution.split("####");
          reasoning = parts[0].trim();
          answer = parts.slice(1).join("####").trim();
        } else {
          reasoning = rawSolution;
          answer = "";
        }
      }
      // 2. Hendrycks MATH format: problem + solution (with \boxed{answer})
      else if (benchmark === "math") {
        problem = String(row.problem || row.question || "");
        rawSolution = String(row.solution || row.answer || "");
        reasoning = rawSolution;

        // Extract \boxed{...} answer
        const boxedMatch = /\\boxed\{([^}]+)\}/.exec(rawSolution);
        if (boxedMatch) {
          boxedAnswer = boxedMatch[1].trim();
          answer = boxedAnswer;
        } else {
          answer = "";
        }
      }
      // 3. SVAMP format: Body + Question + Equation + Answer
      else if (benchmark === "svamp") {
        const body = row.Body ? `${row.Body} ` : "";
        problem = `${body}${row.Question || ""}`.trim();
        reasoning = String(row.Equation || "");
        answer = String(row.Answer !== undefined ? row.Answer : "");
        rawSolution = `${reasoning} => ${answer}`;
      }
      // 4. Generic / OlympiadBench format
      else {
        problem = String(row.problem || row.question || row.prompt || "");
        reasoning = String(row.reasoning || row.solution || row.answer || "");
        answer = String(row.final_answer || row.answer || "");
        rawSolution = reasoning;
      }

      items.push({
        id: (raw.row_idx as number | undefined) ?? i + 1,
        benchmark,
        subject,
        level,
        problem: problem.trim(),
        reasoning: reasoning.trim(),
        answer: answer.trim(),
        boxedAnswer,
        rawSolution,
      });
    }

    return items;
  }

  /**
   * Formats problems into structured GFM Markdown for LLM fine-tuning.
   */
  renderMarkdown(
    benchmark: string,
    subject: string | undefined,
    problems: MathReasoningItem[]
  ): string {
    const lines: string[] = [];
    lines.push(`# Mathematical Reasoning Corpus: ${benchmark.toUpperCase()}`);
    if (subject) lines.push(`**Subject / Domain:** \`${subject}\``);
    lines.push(`**Total Problems Extracted:** ${problems.length}`);
    lines.push("");

    if (problems.length === 0) {
      lines.push("_No mathematical problems extracted in this slice._");
      return lines.join("\n");
    }

    problems.forEach((item, idx) => {
      lines.push(
        `## Problem ${idx + 1}${item.subject ? ` [${item.subject}]` : ""}${item.level ? ` (Level ${item.level})` : ""}`
      );
      lines.push("");
      lines.push("### Question");
      lines.push(item.problem);
      lines.push("");
      lines.push("### Chain-of-Thought (Reasoning Steps)");
      lines.push(item.reasoning);
      lines.push("");
      lines.push("### Final Answer");
      lines.push(`\`${item.answer}\``);
      if (item.boxedAnswer) {
        lines.push(` (Boxed: $\\boxed{${item.boxedAnswer}}$)`);
      }
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  }
}
