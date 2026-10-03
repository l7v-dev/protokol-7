/**
 * Worker and Task Execution Contracts — protokol-7
 *
 * Defines worker pool configuration, task execution context, and runtime telemetry.
 * Conforms to RFC 03 (Workers, Transaction and Control Plane) and RFC 05 (Production Runbook).
 */

import type {
  FinalizeJobOptions,
  JobRecord,
  LedgerRepository,
  ObjectStore,
} from "../../contracts/index.js";

export interface WorkerConfig {
  workerId: string;
  leaseSeconds: number;
  heartbeatIntervalMs: number;
  pollIntervalMs: number;
  allowedOperations?: string[];
  executionTimeoutMs: number;
  maxAttempts: number;
  objectStore?: ObjectStore;
}

export interface WorkerPoolConfig {
  concurrency: number;
  reapIntervalMs: number;
  workerConfig?: Partial<WorkerConfig>;
}

export interface WorkerStats {
  jobsClaimed: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsQuarantined: number;
  activeJobs: number;
  reapedLeases: number;
}

export interface TaskExecutionContext {
  job: JobRecord;
  workerId: string;
  signal: AbortSignal;
  ledger: LedgerRepository;
  objectStore?: ObjectStore;
}

export interface TaskExecutionResult {
  artifacts?: FinalizeJobOptions["artifacts"];
  childJobs?: FinalizeJobOptions["childJobs"];
  outboxEvents?: FinalizeJobOptions["outboxEvents"];
}

// biome-ignore lint/suspicious/noConfusingVoidType: async task handler returning void or TaskExecutionResult
export type JobHandler = (ctx: TaskExecutionContext) => Promise<TaskExecutionResult | void>;
