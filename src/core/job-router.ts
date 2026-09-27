/**
 * Job Router and Controller for Protokol-7.
 * Manages cron-based pipeline executions and recurring actor tasks.
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type http from "node:http";
import { isAbsolute, normalize, resolve } from "node:path";
import type { ActorRegistry } from "../actors/actor-registry";
import { PipelineRunner } from "../pipeline/pipeline-runner";
import { isCronMatch, ScheduleBroker, type ScheduledJobInfo } from "../pipeline/schedule-broker";
import type { PipelineConfig } from "../pipeline/schema";
import { getDefaultRegistryDatabase, type RegistryDatabase } from "./registry-database";
import type { ActorTask, ActorType } from "./types";

export interface ScheduleJobRequestBody {
  jobId?: string;
  cronExpression: string;
  pipeline?: {
    yaml?: string;
    filePath?: string;
    config?: PipelineConfig;
  };
  actor?: {
    actorName: string;
    input?: Record<string, unknown>;
  };
  description?: string;
  checkIntervalMs?: number;
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

export class JobRouter {
  private readonly broker: ScheduleBroker;
  private readonly runner: PipelineRunner;
  private readonly registryDb: RegistryDatabase;
  private readonly actorRegistry?: ActorRegistry;
  private readonly jobDescriptions = new Map<string, string>();

  constructor(
    broker?: ScheduleBroker,
    runner?: PipelineRunner,
    registryDb?: RegistryDatabase,
    actorRegistry?: ActorRegistry
  ) {
    this.registryDb = registryDb ?? getDefaultRegistryDatabase();
    this.broker = broker || new ScheduleBroker({ db: this.registryDb });
    this.runner = runner || new PipelineRunner({ registryDb: this.registryDb });
    this.actorRegistry = actorRegistry;
  }

  getBroker(): ScheduleBroker {
    return this.broker;
  }

  /**
   * POST /api/v1/jobs/schedule
   * Schedules a recurring pipeline or actor task with a 5-part cron expression.
   */
  async handleScheduleJob(res: http.ServerResponse, body: ScheduleJobRequestBody): Promise<void> {
    if (!body?.cronExpression || typeof body.cronExpression !== "string") {
      sendError(
        res,
        400,
        "INVALID_CRON_EXPRESSION",
        "A 5-part cronExpression string is required (e.g. '0 0 * * *').",
        "Provide a standard cron format: minute hour day-of-month month day-of-week."
      );
      return;
    }

    try {
      isCronMatch(body.cronExpression, new Date());
    } catch (err: unknown) {
      sendError(
        res,
        400,
        "INVALID_CRON_EXPRESSION",
        err instanceof Error ? err.message : String(err),
        "Ensure the cron expression contains exactly 5 valid fields."
      );
      return;
    }

    const { pipeline, actor } = body;
    if (!pipeline && !actor) {
      sendError(
        res,
        400,
        "INVALID_JOB_PAYLOAD",
        "Scheduled job requires either a 'pipeline' or an 'actor' specification.",
        "Provide { pipeline: { yaml: '...' } } or { actor: { actorName: '...' } }."
      );
      return;
    }

    // Path traversal validation if pipeline.filePath is specified
    let resolvedFilePath: string | undefined;
    if (pipeline?.filePath) {
      const rootDir = process.cwd();
      const targetPath = isAbsolute(pipeline.filePath)
        ? pipeline.filePath
        : resolve(rootDir, pipeline.filePath);
      const normalizedPath = normalize(targetPath);

      if (!normalizedPath.startsWith(rootDir) || normalizedPath.includes("..")) {
        sendError(
          res,
          403,
          "PATH_TRAVERSAL_DETECTED",
          `Access to path '${pipeline.filePath}' outside workspace root is forbidden.`,
          "Provide a path inside the project workspace directory."
        );
        return;
      }

      if (!existsSync(normalizedPath)) {
        sendError(
          res,
          404,
          "PIPELINE_FILE_NOT_FOUND",
          `Pipeline template file '${pipeline.filePath}' does not exist on disk.`,
          "Check the file path or list templates via GET /api/v1/pipelines/templates."
        );
        return;
      }
      resolvedFilePath = normalizedPath;
    }

    // Validate actor name if actor is specified
    if (actor?.actorName && this.actorRegistry) {
      if (!this.actorRegistry.has(actor.actorName as ActorType)) {
        sendError(
          res,
          400,
          "UNKNOWN_ACTOR",
          `Actor '${actor.actorName}' is not registered in the system actor registry.`,
          "Check registered actors via GET /api/v1/store/actors."
        );
        return;
      }
    }

    const jobId = body.jobId?.trim() || `job_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    if (body.description) {
      this.jobDescriptions.set(jobId, body.description);
    }

    // Create execution handler
    const handler = async () => {
      if (pipeline) {
        if (resolvedFilePath) {
          await this.runner.runFile(resolvedFilePath);
        } else if (pipeline.yaml) {
          await this.runner.runYaml(pipeline.yaml);
        } else if (pipeline.config) {
          await this.runner.runConfig(pipeline.config);
        }
      } else if (actor && this.actorRegistry) {
        const actorInstance = this.actorRegistry.get(actor.actorName as ActorType);
        if (actorInstance) {
          const input = actor.input || {};
          const targetUrl =
            typeof input.targetUrl === "string"
              ? input.targetUrl
              : typeof input.query === "string"
                ? input.query
                : typeof input.searchQuery === "string"
                  ? input.searchQuery
                  : "";
          const task: ActorTask = {
            taskId: `task_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
            actorType: actor.actorName as ActorType,
            targetUrl,
            options: input,
          };
          await actorInstance.run(task, { task, startTime: Date.now() });
        }
      }
    };

    try {
      this.broker.scheduleJob(jobId, body.cronExpression, handler, body.checkIntervalMs || 60000);

      sendJson(res, 201, {
        success: true,
        jobId,
        cronExpression: body.cronExpression,
        running: true,
        description: body.description,
        targetType: pipeline ? "pipeline" : "actor",
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "JOB_SCHEDULING_FAILED",
        err instanceof Error ? err.message : String(err),
        "Check cron syntax and job parameters."
      );
    }
  }

  /**
   * GET /api/v1/jobs
   * Lists all active and persisted scheduled jobs.
   */
  handleListJobs(res: http.ServerResponse): void {
    try {
      const activeJobs = this.broker.getActiveJobs();
      const activeMap = new Map<string, ScheduledJobInfo>();
      for (const j of activeJobs) {
        activeMap.set(j.id, j);
      }

      const dbJobs = this.registryDb.listScheduledJobs();
      const combined: Array<ScheduledJobInfo & { description?: string; activeInMemory: boolean }> =
        [];

      const seenIds = new Set<string>();

      for (const dj of dbJobs) {
        seenIds.add(dj.id);
        const isActive = activeMap.has(dj.id);
        combined.push({
          ...dj,
          running: isActive ? true : dj.running,
          description: this.jobDescriptions.get(dj.id),
          activeInMemory: isActive,
        });
      }

      for (const aj of activeJobs) {
        if (!seenIds.has(aj.id)) {
          combined.push({
            ...aj,
            description: this.jobDescriptions.get(aj.id),
            activeInMemory: true,
          });
        }
      }

      sendJson(res, 200, {
        success: true,
        count: combined.length,
        jobs: combined,
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "JOBS_QUERY_FAILED",
        err instanceof Error ? err.message : String(err),
        "Ensure database connection is healthy."
      );
    }
  }

  /**
   * GET /api/v1/jobs/:id
   * Retrieves single scheduled job information.
   */
  handleGetJob(res: http.ServerResponse, jobId: string): void {
    try {
      const id = decodeURIComponent(jobId).trim();
      const activeJobs = this.broker.getActiveJobs();
      const active = activeJobs.find((j) => j.id === id);
      const dbJob = this.registryDb.getScheduledJob(id);

      if (!active && !dbJob) {
        sendError(
          res,
          404,
          "JOB_NOT_FOUND",
          `Scheduled job '${id}' was not found.`,
          "List scheduled jobs via GET /api/v1/jobs."
        );
        return;
      }

      const job = active || dbJob!;
      sendJson(res, 200, {
        success: true,
        job: {
          ...job,
          running: active ? true : job.running,
          description: this.jobDescriptions.get(id),
          activeInMemory: Boolean(active),
        },
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "JOB_QUERY_FAILED",
        err instanceof Error ? err.message : String(err),
        "Verify job ID and database status."
      );
    }
  }

  /**
   * DELETE /api/v1/jobs/:id or POST /api/v1/jobs/:id/stop
   * Cancels and stops an active scheduled job.
   */
  handleCancelJob(res: http.ServerResponse, jobId: string): void {
    try {
      const id = decodeURIComponent(jobId).trim();
      const stopped = this.broker.stopJob(id);

      if (!stopped) {
        // Also check if persisted in DB and mark inactive
        const dbJob = this.registryDb.getScheduledJob(id);
        if (!dbJob) {
          sendError(
            res,
            404,
            "JOB_NOT_FOUND",
            `Scheduled job '${id}' was not found or is already inactive.`,
            "Check job status via GET /api/v1/jobs."
          );
          return;
        }
        this.registryDb.setScheduledJobRunning(id, false);
      }

      this.jobDescriptions.delete(id);

      sendJson(res, 200, {
        success: true,
        jobId: id,
        stopped: true,
        message: `Scheduled job '${id}' was stopped and deactivated.`,
      });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        "JOB_CANCELLATION_FAILED",
        err instanceof Error ? err.message : String(err),
        "Verify job ID."
      );
    }
  }
}
