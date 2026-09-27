/**
 * Pipeline Router and Controller for Protokol-7.
 * Dispatches declarative YAML pipeline executions, lists history, and exposes available templates.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import type http from "node:http";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { PipelineRunner, type PipelineRunResult } from "../../pipeline/pipeline-runner";
import { type PipelineConfig, parsePipelineYaml } from "../../pipeline/schema";
import { getDefaultRegistryDatabase, type RegistryDatabase } from "../registry-database";

export interface PipelineRunRequestBody {
  yaml?: string;
  config?: PipelineConfig;
  filePath?: string;
  async?: boolean;
}

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

function sendError(
  res: http.ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  remedy: string,
  retryable = false,
  details?: unknown
): void {
  sendJson(res, statusCode, {
    success: false,
    error: message,
    code,
    retryable,
    remedy,
    timestamp: new Date().toISOString(),
    ...(details !== undefined ? { details } : {}),
  });
}

export class PipelineRouter {
  private readonly runner: PipelineRunner;
  private readonly registryDb?: RegistryDatabase;

  constructor(runner?: PipelineRunner, registryDb?: RegistryDatabase) {
    this.registryDb = registryDb ?? getDefaultRegistryDatabase();
    this.runner = runner || new PipelineRunner({ registryDb: this.registryDb });
  }

  getRunner(): PipelineRunner {
    return this.runner;
  }

  /**
   * POST /api/v1/pipelines/run
   * Executes a pipeline via raw YAML string, parsed JSON config, or safe file path.
   */
  async handleRunPipeline(res: http.ServerResponse, body: PipelineRunRequestBody): Promise<void> {
    const { yaml, config, filePath, async: isAsync } = body || {};

    if (!yaml && !config && !filePath) {
      sendError(
        res,
        400,
        "INVALID_PIPELINE_PAYLOAD",
        "Pipeline execution payload must contain at least one of 'yaml', 'config', or 'filePath'.",
        "Provide a valid YAML string in 'yaml' or a relative path to a template in 'filePath'."
      );
      return;
    }

    // Path traversal check if filePath is supplied
    let resolvedFilePath: string | undefined;
    if (filePath) {
      const rootDir = process.cwd();
      const targetPath = isAbsolute(filePath) ? filePath : resolve(rootDir, filePath);
      const normalizedPath = normalize(targetPath);

      if (!normalizedPath.startsWith(rootDir) || normalizedPath.includes("..")) {
        sendError(
          res,
          403,
          "PATH_TRAVERSAL_DETECTED",
          `Access to path '${filePath}' outside workspace root is forbidden.`,
          "Provide a path inside the project workspace directory."
        );
        return;
      }

      if (!existsSync(normalizedPath)) {
        sendError(
          res,
          404,
          "PIPELINE_FILE_NOT_FOUND",
          `Pipeline definition file '${filePath}' was not found.`,
          "Verify that the file path exists in examples/pipelines/ or project root."
        );
        return;
      }

      resolvedFilePath = normalizedPath;
    }

    const executePipeline = async (): Promise<PipelineRunResult> => {
      if (resolvedFilePath) {
        return this.runner.runFile(resolvedFilePath);
      }
      if (yaml) {
        return this.runner.runYaml(yaml);
      }
      if (config) {
        return this.runner.runConfig(config);
      }
      throw new Error("No executable pipeline configuration found.");
    };

    if (isAsync) {
      const estimatedRunId = `run_async_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      // Launch in background
      void executePipeline().catch((err) => {
        console.error(`[PIPELINE_ASYNC_ERROR] Background execution failed:`, err);
      });

      sendJson(res, 202, {
        success: true,
        runId: estimatedRunId,
        status: "pending",
        message: "Pipeline execution started in background.",
        eventsUrl: `/api/v1/pipelines/runs/${estimatedRunId}/events`,
      });
      return;
    }

    // Synchronous execution
    try {
      const result = await executePipeline();

      if (result.status === "failed") {
        sendJson(res, 422, {
          success: false,
          error: result.error || "Pipeline execution failed.",
          code: "PIPELINE_EXECUTION_FAILED",
          remedy: "Inspect input configuration and actor options.",
          result,
        });
        return;
      }

      sendJson(res, 200, {
        success: true,
        result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(
        res,
        500,
        "PIPELINE_EXECUTION_EXCEPTION",
        message,
        "Check system logs for stack trace and verify database connectivity."
      );
    }
  }

  /**
   * GET /api/v1/pipelines/runs
   * Returns recent pipeline execution records.
   */
  handleListRuns(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    let runs: unknown[] = [];
    if (this.registryDb) {
      try {
        runs = this.registryDb.listPipelineExecutions(limit);
      } catch (_err) {
        runs = this.runner.getRunHistory().slice(0, limit);
      }
    } else {
      runs = this.runner.getRunHistory().slice(0, limit);
    }

    sendJson(res, 200, {
      success: true,
      runs,
      total: runs.length,
    });
  }

  /**
   * GET /api/v1/pipelines/runs/:id
   * Returns details of a specific pipeline execution.
   */
  handleGetRun(res: http.ServerResponse, runId: string): void {
    let run: unknown | undefined;

    if (this.registryDb) {
      try {
        const executions = this.registryDb.listPipelineExecutions(200);
        run = executions.find((e) => e.runId === runId);
      } catch (_err) {
        // Ignore and fallback
      }
    }

    if (!run) {
      run = this.runner.getRunHistory().find((r) => r.runId === runId);
    }

    if (!run) {
      sendError(
        res,
        404,
        "PIPELINE_RUN_NOT_FOUND",
        `Pipeline execution '${runId}' not found.`,
        "Check GET /api/v1/pipelines/runs for available execution IDs."
      );
      return;
    }

    sendJson(res, 200, {
      success: true,
      run,
    });
  }

  /**
   * GET /api/v1/pipelines/templates
   * Lists available sample pipeline YAML configurations in examples/pipelines/.
   */
  handleListTemplates(res: http.ServerResponse): void {
    const pipelinesDir = join(process.cwd(), "examples", "pipelines");
    const templates: Array<{ name: string; path: string; description?: string }> = [];

    if (existsSync(pipelinesDir)) {
      const files = readdirSync(pipelinesDir).filter(
        (f) => f.endsWith(".yaml") || f.endsWith(".yml")
      );
      for (const file of files) {
        const fullPath = join(pipelinesDir, file);
        try {
          const content = readFileSync(fullPath, "utf8");
          const parsed = parsePipelineYaml(content);
          templates.push({
            name: parsed.name,
            path: `examples/pipelines/${file}`,
            description: `Pipeline for ${parsed.actor.id} -> ${parsed.output.format} via ${parsed.storage.backend}`,
          });
        } catch {
          templates.push({
            name: file.replace(/\.ya?ml$/, ""),
            path: `examples/pipelines/${file}`,
          });
        }
      }
    }

    sendJson(res, 200, {
      success: true,
      templates,
      total: templates.length,
    });
  }
}
