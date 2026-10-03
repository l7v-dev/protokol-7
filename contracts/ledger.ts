/**
 * Control Plane and Ledger Contracts — protokol-7
 *
 * Conforms to Developer Package V3 specifications (001-control-plane.sql, 002-lease-examples.sql).
 */

export interface SourceRecord {
  id: string;
  name: string;
  descriptor: Record<string, unknown>;
  enabled: boolean;
}

export interface CrawlPartition {
  id: string;
  sourceId: string;
  partitionKey: string;
  cursor: Record<string, unknown> | null;
  revision: number;
  leaseEpoch: number;
  leaseOwner: string | null;
  leaseUntil: string | null;
}

export interface DocumentRecord {
  id: string;
  sourceId: string;
  externalId: string;
  canonicalUrl: string | null;
  discoveredAt: string;
}

export interface ContentObjectRecord {
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}

export interface ArtifactRecord {
  id: string;
  sha256: string;
  providerId: string;
  container: string;
  objectKey: string;
  objectVersion: string | null;
  transformVersion: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type JobStatus =
  | "pending"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "quarantined"
  | "cancelled";

export interface JobRecord {
  id: string;
  documentId: string | null;
  operation: string;
  idempotencyKey: string;
  status: JobStatus;
  input: Record<string, unknown>;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  leaseOwner: string | null;
  leaseEpoch: number;
  leaseUntil: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboxEventRecord {
  id: string;
  jobId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  publishedAt: string | null;
  dispatchOwner: string | null;
  dispatchUntil: string | null;
  dispatchEpoch: number;
}

export interface FinalizeJobOptions {
  artifacts?: Array<{
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    providerId: string;
    container: string;
    objectKey: string;
    objectVersion?: string | null;
    transformVersion: string;
    metadata?: Record<string, unknown>;
    role?: string;
  }>;
  childJobs?: Array<{
    documentId?: string;
    operation: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
    maxAttempts?: number;
  }>;
  outboxEvents?: Array<{
    eventType: string;
    payload: Record<string, unknown>;
  }>;
}

export interface FailJobOptions {
  terminal?: boolean;
  retryAfterSeconds?: number;
  quarantine?: boolean;
}

export interface TaskContext {
  job: JobRecord;
  workerId: string;
  signal: AbortSignal;
}

export interface TaskResult {
  artifacts?: FinalizeJobOptions["artifacts"];
  childJobs?: FinalizeJobOptions["childJobs"];
  outboxEvents?: FinalizeJobOptions["outboxEvents"];
}

// biome-ignore lint/suspicious/noConfusingVoidType: async task handler returning void or TaskResult
export type TaskHandler = (ctx: TaskContext) => Promise<TaskResult | void>;

export interface LedgerRepository {
  createSource(source: {
    name: string;
    descriptor: Record<string, unknown>;
    enabled?: boolean;
  }): Promise<SourceRecord>;
  getSource(id: string): Promise<SourceRecord | null>;
  getOrCreatePartition(sourceId: string, partitionKey: string): Promise<CrawlPartition>;
  updatePartitionCursor(
    id: string,
    cursor: Record<string, unknown>,
    expectedRevision: number
  ): Promise<boolean>;
  upsertDocument(doc: {
    sourceId: string;
    externalId: string;
    canonicalUrl?: string;
  }): Promise<DocumentRecord>;
  registerContentObject(obj: {
    sha256: string;
    sizeBytes: number;
    mimeType: string;
  }): Promise<ContentObjectRecord>;
  recordArtifact(artifact: {
    documentId?: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    providerId: string;
    container: string;
    objectKey: string;
    objectVersion?: string | null;
    transformVersion: string;
    metadata?: Record<string, unknown>;
    role?: string;
  }): Promise<ArtifactRecord>;
  createJob(job: {
    documentId?: string;
    operation: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
    maxAttempts?: number;
  }): Promise<JobRecord>;
  getJob(jobId: string): Promise<JobRecord | null>;
  claimJob(
    owner: string,
    leaseSeconds: number,
    allowedOperations?: string[]
  ): Promise<JobRecord | null>;
  heartbeatJob(
    jobId: string,
    owner: string,
    leaseEpoch: number,
    leaseSeconds: number
  ): Promise<boolean>;
  finalizeJob(
    jobId: string,
    owner: string,
    leaseEpoch: number,
    options?: FinalizeJobOptions
  ): Promise<boolean>;
  failJob(
    jobId: string,
    owner: string,
    leaseEpoch: number,
    errorCode: string,
    options?: FailJobOptions
  ): Promise<boolean>;
  claimOutboxEvents(
    owner: string,
    batchSize?: number,
    leaseSeconds?: number
  ): Promise<OutboxEventRecord[]>;
  markOutboxPublished(eventId: string, owner: string, dispatchEpoch: number): Promise<boolean>;
  reapExpiredLeases(): Promise<{ expiredJobs: number; expiredOutbox: number }>;
}
