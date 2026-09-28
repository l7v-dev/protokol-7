/**
 * CodeEvalActor - Standard code generation and evaluation benchmark dataset
 * harvester (HumanEval, MBPP, SWE-bench).
 * Conforms to docs/actor-contract.md and docs/actors/code-eval.md.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  CodeEvalActorResult,
  CodeEvalActorTaskOptions,
  CodeEvalItem,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";
const HF_DATASETS_SERVER_BASE = "https://datasets-server.huggingface.co";

/**
 * Benchmark to Hugging Face dataset, configuration, and default split mappings.
 */
const BENCHMARK_MAP: Record<
  string,
  { dataset: string; defaultConfig: string; defaultSplit: string }
> = {
  humaneval: {
    dataset: "openai/openai_humaneval",
    defaultConfig: "default",
    defaultSplit: "test",
  },
  mbpp: {
    dataset: "google-research-datasets/mbpp",
    defaultConfig: "full",
    defaultSplit: "test",
  },
  "swe-bench": {
    dataset: "princeton-nlp/SWE-bench_Lite",
    defaultConfig: "default",
    defaultSplit: "test",
  },
  swebench: {
    dataset: "princeton-nlp/SWE-bench_Lite",
    defaultConfig: "default",
    defaultSplit: "test",
  },
};

export class CodeEvalActor implements IActor<CodeEvalActorResult> {
  readonly actorType = "code-eval" as const;
  readonly description =
    "Standard code generation and evaluation benchmark dataset harvester (HumanEval, MBPP, SWE-bench).";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<CodeEvalActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options: CodeEvalActorTaskOptions =
      task.options?.codeEvalOptions || (task.options as unknown as CodeEvalActorTaskOptions) || {};
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

      // 7. Parse tasks into standard CodeEvalItem array
      const tasks = this.parseTasks(resolved.benchmark, json);
      const markdown = this.renderMarkdown(resolved.benchmark, resolved.split, tasks);

      const resultData: CodeEvalActorResult = {
        benchmark: resolved.benchmark,
        split: resolved.split,
        totalTasks: tasks.length,
        offset: resolved.offset,
        limit: resolved.limit,
        tasks,
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
    options: CodeEvalActorTaskOptions
  ): {
    benchmark: string;
    dataset: string;
    config: string;
    split: string;
    offset: number;
    limit: number;
  } {
    let benchmark = (options.benchmark || "humaneval").toLowerCase();
    const split = options.split;
    const offset = options.offset !== undefined ? options.offset : 0;
    const limit = Math.min(Math.max(options.limit || 20, 1), 100);

    if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
      const lower = targetUrl.toLowerCase();
      if (lower.includes("humaneval")) benchmark = "humaneval";
      else if (lower.includes("mbpp")) benchmark = "mbpp";
      else if (lower.includes("swe-bench") || lower.includes("swebench")) benchmark = "swe-bench";
    }

    const mapping = BENCHMARK_MAP[benchmark] || {
      dataset: benchmark,
      defaultConfig: "default",
      defaultSplit: "test",
    };

    const dataset = mapping.dataset;
    const config = mapping.defaultConfig;
    const finalSplit = split || mapping.defaultSplit;

    return {
      benchmark,
      dataset,
      config,
      split: finalSplit,
      offset,
      limit,
    };
  }

  /**
   * Builds the API endpoint URL for streaming code benchmark rows.
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
   * Parses JSON API rows into standard CodeEvalItem records.
   */
  parseTasks(benchmark: string, json: Record<string, unknown>): CodeEvalItem[] {
    const rawRows = Array.isArray(json?.rows) ? json.rows : Array.isArray(json) ? json : [];
    const items: CodeEvalItem[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i] as Record<string, unknown>;
      const row =
        raw && typeof raw.row === "object" && raw.row !== null
          ? (raw.row as Record<string, unknown>)
          : raw;

      if (!row) continue;

      let taskId = "";
      let entryPoint: string | undefined;
      let prompt = "";
      let canonicalSolution: string | undefined;
      let test: string | undefined;
      let language = "python";
      let difficulty: string | undefined;

      // 1. HumanEval format: task_id, prompt, entry_point, canonical_solution, test
      if (benchmark === "humaneval") {
        taskId = String(row.task_id || `HumanEval/${i}`);
        entryPoint = typeof row.entry_point === "string" ? row.entry_point : undefined;
        prompt = String(row.prompt || "");
        canonicalSolution =
          typeof row.canonical_solution === "string" ? row.canonical_solution : undefined;
        test = typeof row.test === "string" ? row.test : undefined;
        language = "python";
      }
      // 2. MBPP format: task_id, text, code, test_list, test_setup_code
      else if (benchmark === "mbpp") {
        taskId = String(row.task_id ?? row.id ?? i + 1);
        prompt = String(row.text || row.prompt || "");
        canonicalSolution =
          typeof row.code === "string" ? row.code : (row.canonical_solution as string | undefined);
        if (Array.isArray(row.test_list)) {
          test = row.test_list.map((t) => String(t)).join("\n");
        } else if (typeof row.test === "string") {
          test = row.test;
        }
        language = "python";
      }
      // 3. SWE-bench format: instance_id, problem_statement, patch, test_patch, repo
      else if (benchmark === "swe-bench" || benchmark === "swebench") {
        taskId = String(row.instance_id || row.task_id || `swe-bench-${i + 1}`);
        entryPoint = typeof row.repo === "string" ? row.repo : undefined;
        prompt = String(row.problem_statement || row.prompt || "");
        canonicalSolution = typeof row.patch === "string" ? row.patch : undefined;
        test =
          typeof row.test_patch === "string" ? row.test_patch : (row.test as string | undefined);
        language = "python";
      }
      // 4. Generic fallback
      else {
        taskId = String(row.task_id ?? row.id ?? row.instance_id ?? i + 1);
        entryPoint =
          typeof row.entry_point === "string" ? row.entry_point : (row.repo as string | undefined);
        prompt = String(row.prompt || row.text || row.problem_statement || row.question || "");
        canonicalSolution =
          typeof row.canonical_solution === "string"
            ? row.canonical_solution
            : typeof row.code === "string"
              ? row.code
              : typeof row.solution === "string"
                ? row.solution
                : (row.patch as string | undefined);
        if (Array.isArray(row.test_list)) {
          test = row.test_list.map((t) => String(t)).join("\n");
        } else if (typeof row.test === "string") {
          test = row.test;
        } else if (typeof row.test_patch === "string") {
          test = row.test_patch;
        }
        language = typeof row.language === "string" ? row.language : "python";
        difficulty = typeof row.difficulty === "string" ? row.difficulty : undefined;
      }

      items.push({
        taskId: taskId.trim(),
        entryPoint: entryPoint?.trim(),
        prompt: prompt.trim(),
        canonicalSolution: canonicalSolution?.trim(),
        test: test?.trim(),
        language,
        difficulty,
        raw: row,
      });
    }

    return items;
  }

  /**
   * Formats coding benchmark tasks into structured GFM Markdown for LLM fine-tuning.
   */
  renderMarkdown(benchmark: string, split: string, tasks: CodeEvalItem[]): string {
    const lines: string[] = [];
    lines.push(`# Coding Evaluation Benchmark: ${benchmark.toUpperCase()}`);
    lines.push(`**Split:** \`${split}\``);
    lines.push(`**Total Tasks Extracted:** ${tasks.length}`);
    lines.push("");

    if (tasks.length === 0) {
      lines.push("_No coding tasks extracted in this slice._");
      return lines.join("\n");
    }

    tasks.forEach((task, idx) => {
      lines.push(
        `## Task ${idx + 1}: ${task.taskId}${task.entryPoint ? ` (\`${task.entryPoint}\`)` : ""}`
      );
      lines.push("");
      lines.push("### Prompt / Problem Specification");
      lines.push(`\`\`\`${task.language || "python"}`);
      lines.push(task.prompt);
      lines.push("```");
      lines.push("");

      if (task.canonicalSolution) {
        lines.push("### Canonical Solution");
        lines.push(`\`\`\`${task.language || "python"}`);
        lines.push(task.canonicalSolution);
        lines.push("```");
        lines.push("");
      }

      if (task.test) {
        lines.push("### Verification / Unit Tests");
        lines.push(`\`\`\`${task.language || "python"}`);
        lines.push(task.test);
        lines.push("```");
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  }
}
