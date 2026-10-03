/**
 * Task Worker Engine — protokol-7
 *
 * Implements bounded task execution loop with atomic job leases, epoch fencing,
 * periodic heartbeats, backoff jitter, and transactional finalization.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane).
 */

import { randomUUID } from "node:crypto";
import type { JobRecord, LedgerRepository, ObjectStore } from "../../contracts/index.js";
import type { JobHandler, TaskExecutionContext, WorkerConfig, WorkerStats } from "./types.js";

export class QuarantineError extends Error {
  readonly quarantine = true;
  constructor(message: string) {
    super(message);
    this.name = "QuarantineError";
  }
}

export class TerminalJobError extends Error {
  readonly terminal = true;
  constructor(message: string) {
    super(message);
    this.name = "TerminalJobError";
  }
}

export class TaskWorker {
  readonly workerId: string;
  readonly leaseSeconds: number;
  readonly heartbeatIntervalMs: number;
  readonly pollIntervalMs: number;
  readonly executionTimeoutMs: number;
  readonly maxAttempts: number;
  readonly allowedOperations?: string[];
  readonly objectStore?: ObjectStore;

  private readonly ledger: LedgerRepository;
  private readonly handlers = new Map<string, JobHandler>();

  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeAbortController: AbortController | null = null;
  private activeHeartbeatTimer: NodeJS.Timeout | null = null;
  private activeJob: JobRecord | null = null;
  private executionPromise: Promise<void> | null = null;

  readonly stats: WorkerStats = {
    jobsClaimed: 0,
    jobsSucceeded: 0,
    jobsFailed: 0,
    jobsQuarantined: 0,
    activeJobs: 0,
    reapedLeases: 0,
  };

  constructor(ledger: LedgerRepository, config?: Partial<WorkerConfig>) {
    this.ledger = ledger;
    this.workerId = config?.workerId || `worker-${randomUUID().slice(0, 8)}`;
    this.leaseSeconds = config?.leaseSeconds ?? 60;
    this.heartbeatIntervalMs =
      config?.heartbeatIntervalMs ?? Math.max(1000, Math.floor((this.leaseSeconds * 1000) / 3));
    this.pollIntervalMs = config?.pollIntervalMs ?? 1000;
    this.executionTimeoutMs = config?.executionTimeoutMs ?? 180000;
    this.maxAttempts = config?.maxAttempts ?? 5;
    this.allowedOperations = config?.allowedOperations;
    this.objectStore = config?.objectStore;
  }

  registerHandler(operation: string, handler: JobHandler): this {
    this.handlers.set(operation, handler);
    return this;
  }

  getHandler(operation: string): JobHandler | undefined {
    return this.handlers.get(operation);
  }

  getActiveJob(): JobRecord | null {
    return this.activeJob;
  }

  getActiveAbortSignal(): AbortSignal | null {
    return this.activeAbortController?.signal ?? null;
  }

  getIsRunning(): boolean {
    return this.isRunning;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleNextPoll(0);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.executionPromise) {
      await this.executionPromise;
    }
  }

  private scheduleNextPoll(delayMs: number): void {
    if (!this.isRunning) return;
    this.pollTimer = setTimeout(async () => {
      this.pollTimer = null;
      if (!this.isRunning) return;

      try {
        const processed = await this.executeOnce();
        // If a job was processed, immediately poll for the next job; otherwise wait pollIntervalMs
        this.scheduleNextPoll(processed ? 0 : this.pollIntervalMs);
      } catch {
        this.scheduleNextPoll(this.pollIntervalMs);
      }
    }, delayMs);
    this.pollTimer.unref();
  }

  async executeOnce(): Promise<boolean> {
    const job = await this.ledger.claimJob(
      this.workerId,
      this.leaseSeconds,
      this.allowedOperations
    );

    if (!job) {
      return false;
    }

    this.stats.jobsClaimed += 1;
    this.stats.activeJobs += 1;
    this.activeJob = job;

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const timeoutTimer = setTimeout(() => {
      abortController.abort(
        new Error(`Execution deadline exceeded (${this.executionTimeoutMs} ms)`)
      );
    }, this.executionTimeoutMs);
    timeoutTimer.unref();

    this.activeHeartbeatTimer = setInterval(async () => {
      try {
        const renewed = await this.ledger.heartbeatJob(
          job.id,
          this.workerId,
          job.leaseEpoch,
          this.leaseSeconds
        );
        if (!renewed) {
          abortController.abort(new Error("Lease ownership lost or expired"));
          if (this.activeHeartbeatTimer) {
            clearInterval(this.activeHeartbeatTimer);
            this.activeHeartbeatTimer = null;
          }
        }
      } catch {
        // Suppress transient heartbeat lookup failures to allow next attempt
      }
    }, this.heartbeatIntervalMs);
    this.activeHeartbeatTimer.unref();

    const executeTask = async (): Promise<void> => {
      try {
        const handler = this.handlers.get(job.operation);
        if (!handler) {
          throw new TerminalJobError(`No handler registered for operation: ${job.operation}`);
        }

        const ctx: TaskExecutionContext = {
          job,
          workerId: this.workerId,
          signal: abortController.signal,
          ledger: this.ledger,
          objectStore: this.objectStore,
        };

        const result = await handler(ctx);

        if (abortController.signal.aborted) {
          throw new Error("Execution was aborted during processing");
        }

        // Finalize transaction with epoch fence
        const finalized = await this.ledger.finalizeJob(
          job.id,
          this.workerId,
          job.leaseEpoch,
          result
            ? {
                artifacts: result.artifacts,
                childJobs: result.childJobs,
                outboxEvents: result.outboxEvents,
              }
            : undefined
        );

        if (finalized) {
          this.stats.jobsSucceeded += 1;
        } else {
          this.stats.jobsFailed += 1;
        }
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        const isQuarantine = Boolean((error as unknown as { quarantine?: boolean }).quarantine);
        const isTerminal = Boolean((error as unknown as { terminal?: boolean }).terminal);

        const delay = Math.min(300, 2 ** job.attempt * 5);
        const jitteredDelay = Math.max(1, Math.floor(Math.random() * delay));

        await this.ledger.failJob(job.id, this.workerId, job.leaseEpoch, error.message, {
          quarantine: isQuarantine,
          terminal: isTerminal,
          retryAfterSeconds: jitteredDelay,
        });

        if (isQuarantine) {
          this.stats.jobsQuarantined += 1;
        } else {
          this.stats.jobsFailed += 1;
        }
      } finally {
        clearTimeout(timeoutTimer);
        if (this.activeHeartbeatTimer) {
          clearInterval(this.activeHeartbeatTimer);
          this.activeHeartbeatTimer = null;
        }
        this.activeAbortController = null;
        this.activeJob = null;
        this.stats.activeJobs = Math.max(0, this.stats.activeJobs - 1);
      }
    };

    this.executionPromise = executeTask();
    await this.executionPromise;
    this.executionPromise = null;
    return true;
  }
}
