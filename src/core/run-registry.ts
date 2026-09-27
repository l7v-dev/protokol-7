/**
 * Run Registry for tracking actor executions, live SSE events, and dataset results.
 */

import { EventEmitter } from "node:events";
import { type RegistryDatabase, getDefaultRegistryDatabase } from "./registry-database";

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

export interface RunRegistryOptions {
  db?: RegistryDatabase;
}

export class RunRegistry extends EventEmitter {
  private readonly runs = new Map<string, RunRecord>();
  private static readonly MAX_RUNS = 200;
  private readonly db?: RegistryDatabase;

  constructor(options?: RunRegistryOptions) {
    super();
    this.db = options?.db ?? getDefaultRegistryDatabase();
  }

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
    if (this.db) {
      try {
        this.db.createRun(record);
      } catch (err) {
        console.error(`[DB_ERROR] Failed to persist run ${runId}:`, err);
      }
    }
    this.emit("created", record);
    return record;
  }

  getRun(runId: string): RunRecord | undefined {
    const inMem = this.runs.get(runId);
    if (inMem) return inMem;
    if (this.db) {
      const fromDb = this.db.getRun(runId);
      if (fromDb) {
        this.runs.set(runId, fromDb);
        return fromDb;
      }
    }
    return undefined;
  }

  listRuns(limit = 50): RunRecord[] {
    if (this.db) {
      try {
        return this.db.listRuns(limit);
      } catch (err) {
        console.error("[DB_ERROR] Failed to list runs from database:", err);
      }
    }
    return Array.from(this.runs.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  startRun(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = "running";
    if (this.db) {
      try {
        this.db.startRun(runId);
      } catch (err) {
        console.error(`[DB_ERROR] Failed to update run status ${runId}:`, err);
      }
    }
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
    if (this.db) {
      try {
        this.db.appendLog(runId, logEntry);
      } catch (err) {
        console.error(`[DB_ERROR] Failed to persist log for run ${runId}:`, err);
      }
    }
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
    if (this.db) {
      try {
        this.db.completeRun(runId, output, itemCount, run.finishedAt, run.durationMs);
      } catch (err) {
        console.error(`[DB_ERROR] Failed to complete run ${runId}:`, err);
      }
    }
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
    if (this.db) {
      try {
        this.db.failRun(runId, errorMessage, run.finishedAt, run.durationMs);
      } catch (err) {
        console.error(`[DB_ERROR] Failed to fail run ${runId}:`, err);
      }
    }
    this.appendLog(runId, "ERROR", `Hata oluştu: ${errorMessage}`);
    this.emit(`status:${runId}`, run.status);
    this.emit(`done:${runId}`, run);
  }
}

export const globalRunRegistry = new RunRegistry();
