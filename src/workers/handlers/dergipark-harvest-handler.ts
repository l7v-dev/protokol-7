/**
 * DergiPark Harvest Job Handler — protokol-7
 *
 * Executes partitioned DergiPark OAI-PMH harvest jobs as managed control plane tasks.
 * Spawns the Python pipeline orchestrator with strict abort signal propagation,
 * collects execution receipts, and registers completed outbox events.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane).
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { TerminalJobError } from "../task-worker.js";
import type { JobHandler, TaskExecutionContext, TaskExecutionResult } from "../types.js";

export interface DergiParkHarvestJobInput {
  partitionId?: string;
  fromDate?: string;
  untilDate?: string;
  setSpec?: string;
  maxRecords?: number;
  batchSize?: number;
  shardSizeMb?: number;
  maxShardRecords?: number;
  dryRun?: boolean;
  noDrive?: boolean;
  pythonPath?: string;
}

export function createDergiParkHarvestJobHandler(): JobHandler {
  return async (ctx: TaskExecutionContext): Promise<TaskExecutionResult> => {
    const input = (ctx.job.input || {}) as unknown as DergiParkHarvestJobInput;
    const projectRoot = process.cwd();

    const pythonBin = input.pythonPath || path.resolve(projectRoot, ".venv/bin/python");

    const orchestratorScript = path.resolve(
      projectRoot,
      "pipelines/api_stream/dergipark/orchestrator.py"
    );

    const args: string[] = [orchestratorScript];

    if (input.fromDate) {
      args.push("--from-date", input.fromDate);
    }
    if (input.untilDate) {
      args.push("--until-date", input.untilDate);
    }
    if (input.setSpec) {
      args.push("--set", input.setSpec);
    }
    if (input.maxRecords !== undefined) {
      args.push("--max-records", String(input.maxRecords));
    }
    if (input.batchSize) {
      args.push("--batch-size", String(input.batchSize));
    }
    if (input.shardSizeMb) {
      args.push("--shard-size-mb", String(input.shardSizeMb));
    }
    if (input.maxShardRecords) {
      args.push("--max-shard-records", String(input.maxShardRecords));
    }
    if (input.dryRun) {
      args.push("--dry-run");
    }
    if (input.noDrive) {
      args.push("--no-drive");
    }

    let stdoutBuffer = "";
    let stderrBuffer = "";

    await new Promise<void>((resolve, reject) => {
      const child = spawn(pythonBin, args, {
        cwd: projectRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
        },
      });

      const onAbort = () => {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 3000);
      };

      if (ctx.signal.aborted) {
        onAbort();
        reject(new TerminalJobError("Job execution aborted before start"));
        return;
      }

      ctx.signal.addEventListener("abort", onAbort, { once: true });

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf-8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderrBuffer += chunk.toString("utf-8");
      });

      child.on("error", (err) => {
        ctx.signal.removeEventListener("abort", onAbort);
        reject(new Error(`Failed to spawn DergiPark orchestrator: ${err.message}`));
      });

      child.on("close", (code) => {
        ctx.signal.removeEventListener("abort", onAbort);
        if (ctx.signal.aborted) {
          reject(new TerminalJobError("Job execution aborted by worker signal"));
          return;
        }

        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `DergiPark orchestrator exited with code ${code}. Stderr: ${stderrBuffer.trim() || stdoutBuffer.slice(-500)}`
            )
          );
        }
      });
    });

    // Parse counts from stdout if present
    const cleanMatch = stdoutBuffer.match(/Total clean records accepted:\s*([0-9,]+)/);
    const newMatch = stdoutBuffer.match(/New articles sharded:\s*([0-9,]+)/);
    const dedupeMatch = stdoutBuffer.match(/Existing articles deduplicated:\s*([0-9,]+)/);

    const cleanCount = cleanMatch ? parseInt(cleanMatch[1].replace(/,/g, ""), 10) : 0;
    const newCount = newMatch ? parseInt(newMatch[1].replace(/,/g, ""), 10) : 0;
    const dedupeCount = dedupeMatch ? parseInt(dedupeMatch[1].replace(/,/g, ""), 10) : 0;

    return {
      outboxEvents: [
        {
          eventType: "dergipark.harvest.completed",
          payload: {
            jobId: ctx.job.id,
            partitionId:
              input.partitionId ||
              `custom_${input.fromDate || "start"}_${input.untilDate || "end"}`,
            cleanCount,
            newCount,
            dedupeCount,
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };
  };
}
