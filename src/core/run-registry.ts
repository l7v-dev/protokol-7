/**
 * Run Registry for tracking actor executions, live SSE events, and dataset results.
 */

import { EventEmitter } from "node:events";

export type RunStatus = "pending" | "running" | "succeeded" | "failed" | "vetoed";

export interface RunRecord {
  runId: string;
  actorName: string;
  status: RunStatus;
  input: Record<string, unknown>;
  output?: unknown;
  errorMessage?: string;
  logs: Array<{
    timestamp: string;
    level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO";
    message: string;
  }>;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  itemCount?: number;
}

export class RunRegistry extends EventEmitter {
  private readonly runs = new Map<string, RunRecord>();
  private static readonly MAX_RUNS = 200;

  createRun(actorName: string, input: Record<string, unknown>): RunRecord {
    // Evict oldest run if maximum capacity reached to prevent memory leaks
    if (this.runs.size >= RunRegistry.MAX_RUNS) {
      const oldestKey = this.runs.keys().next().value;
      if (oldestKey) {
        this.runs.delete(oldestKey);
      }
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const record: RunRecord = {
      runId,
      actorName,
      status: "pending",
      input,
      logs: [],
      startedAt: new Date().toISOString(),
    };
    this.runs.set(runId, record);
    this.emit("created", record);
    return record;
  }

  getRun(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }

  listRuns(limit = 50): RunRecord[] {
    return Array.from(this.runs.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  startRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = "running";
    this.appendLog(runId, "INFO", `Aktör [${run.actorName}] başlatıldı.`);
    this.emit(`status:${runId}`, run.status);
  }

  appendLog(
    runId: string,
    level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO",
    message: string
  ): void {
    const run = this.runs.get(runId);
    if (!run) return;
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    run.logs.push(logEntry);
    this.emit(`log:${runId}`, logEntry);
  }

  completeRun(runId: string, output: unknown, itemCount = 0): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = "succeeded";
    run.output = output;
    run.itemCount = itemCount;
    run.finishedAt = new Date().toISOString();
    run.durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    this.appendLog(runId, "PASS", `Aktör tamamlandı (${run.durationMs}ms, ${itemCount} kayıt).`);
    this.emit(`status:${runId}`, run.status);
    this.emit(`done:${runId}`, run);
  }

  failRun(runId: string, errorMessage: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = "failed";
    run.errorMessage = errorMessage;
    run.finishedAt = new Date().toISOString();
    run.durationMs = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    this.appendLog(runId, "ERROR", `Hata oluştu: ${errorMessage}`);
    this.emit(`status:${runId}`, run.status);
    this.emit(`done:${runId}`, run);
  }
}

export const globalRunRegistry = new RunRegistry();
