/**
 * Worker Pool Coordinator — protokol-7
 *
 * Coordinates concurrent task workers, manages lease reaping, and handles graceful shutdown.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane) and RFC 05 (Production Runbook).
 */

import { randomUUID } from "node:crypto";
import type { LedgerRepository, ObjectStore } from "../../contracts/index.js";
import { TaskWorker } from "./task-worker.js";
import type { JobHandler, WorkerConfig, WorkerPoolConfig, WorkerStats } from "./types.js";

export class WorkerPool {
  readonly poolId: string;
  readonly concurrency: number;
  readonly reapIntervalMs: number;

  private readonly ledger: LedgerRepository;
  private readonly objectStore?: ObjectStore;
  private readonly workers: TaskWorker[] = [];
  private readonly handlers = new Map<string, JobHandler>();

  private isRunning = false;
  private reaperTimer: NodeJS.Timeout | null = null;
  private reapedLeasesCount = 0;
  private readonly reapDaemonRuns?: () => number | Promise<number>;

  constructor(
    ledger: LedgerRepository,
    config?: Partial<WorkerPoolConfig> & { objectStore?: ObjectStore }
  ) {
    this.ledger = ledger;
    this.poolId = `pool-${randomUUID().slice(0, 8)}`;
    this.concurrency = Math.max(1, config?.concurrency ?? 1);
    this.reapIntervalMs = config?.reapIntervalMs ?? 30000;
    this.objectStore = config?.objectStore;
    this.reapDaemonRuns = config?.reapDaemonRuns;

    for (let i = 0; i < this.concurrency; i++) {
      const workerConfig: Partial<WorkerConfig> = {
        ...config?.workerConfig,
        workerId: `${this.poolId}-w${i + 1}`,
        objectStore: this.objectStore,
      };
      const worker = new TaskWorker(this.ledger, workerConfig);
      this.workers.push(worker);
    }
  }

  registerHandler(operation: string, handler: JobHandler): this {
    this.handlers.set(operation, handler);
    for (const worker of this.workers) {
      worker.registerHandler(operation, handler);
    }
    return this;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Start all workers
    for (const worker of this.workers) {
      worker.start();
    }

    // Start lease reaper background timer
    this.reaperTimer = setInterval(async () => {
      try {
        const result = await this.ledger.reapExpiredLeases();
        this.reapedLeasesCount += result.expiredJobs + result.expiredOutbox;
      } catch {
        // Suppress reaper error to avoid crashing pool loop
      }
      if (this.reapDaemonRuns) {
        try {
          await this.reapDaemonRuns();
        } catch {
          console.error("[ERROR] Daemon heartbeat reaper failed; check monitoring catalog.");
        }
      }
    }, this.reapIntervalMs);
    this.reaperTimer.unref();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }

    // Wait for all workers to finish their current job
    await Promise.all(this.workers.map((w) => w.stop()));
  }

  async drain(): Promise<void> {
    await this.stop();
  }

  getStats(): WorkerStats {
    let jobsClaimed = 0;
    let jobsSucceeded = 0;
    let jobsFailed = 0;
    let jobsQuarantined = 0;
    let activeJobs = 0;

    for (const worker of this.workers) {
      jobsClaimed += worker.stats.jobsClaimed;
      jobsSucceeded += worker.stats.jobsSucceeded;
      jobsFailed += worker.stats.jobsFailed;
      jobsQuarantined += worker.stats.jobsQuarantined;
      activeJobs += worker.stats.activeJobs;
    }

    return {
      jobsClaimed,
      jobsSucceeded,
      jobsFailed,
      jobsQuarantined,
      activeJobs,
      reapedLeases: this.reapedLeasesCount,
    };
  }

  getWorkers(): readonly TaskWorker[] {
    return this.workers;
  }
}
