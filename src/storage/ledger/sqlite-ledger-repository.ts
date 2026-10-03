/**
 * SQLite Ledger and Control Plane Repository — protokol-7
 *
 * Implements LedgerRepository contract backed by native node:sqlite DatabaseSync
 * with ACID transactions, epoch-fenced job leasing, and outbox event dispatching.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ArtifactRecord,
  ContentObjectRecord,
  CrawlPartition,
  DocumentRecord,
  FailJobOptions,
  FinalizeJobOptions,
  JobRecord,
  JobStatus,
  LedgerRepository,
  OutboxEventRecord,
  SourceRecord,
} from "../../../contracts/index.js";

export interface SqliteLedgerRepositoryOptions {
  dbPath?: string; // Omitting or ':memory:' uses in-memory DB
}

export class SqliteLedgerRepository implements LedgerRepository {
  private readonly db: DatabaseSync;
  private readonly isMemory: boolean;

  constructor(options?: SqliteLedgerRepositoryOptions) {
    const rawPath = options?.dbPath || ":memory:";
    this.isMemory = rawPath === ":memory:";

    if (!this.isMemory) {
      const resolved = path.resolve(rawPath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      this.db = new DatabaseSync(resolved);
    } else {
      this.db = new DatabaseSync(":memory:");
    }

    this.initSchema();
  }

  private initSchema(): void {
    if (!this.isMemory) {
      this.db.exec("PRAGMA journal_mode = WAL;");
    }
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA foreign_keys = ON;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        descriptor TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS crawl_partitions (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id),
        partition_key TEXT NOT NULL,
        cursor TEXT,
        revision INTEGER NOT NULL DEFAULT 0,
        lease_epoch INTEGER NOT NULL DEFAULT 0,
        lease_owner TEXT,
        lease_until TEXT,
        UNIQUE(source_id, partition_key)
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES sources(id),
        external_id TEXT NOT NULL,
        canonical_url TEXT,
        discovered_at TEXT NOT NULL,
        UNIQUE(source_id, external_id)
      );

      CREATE TABLE IF NOT EXISTS content_objects (
        sha256 TEXT PRIMARY KEY,
        size_bytes INTEGER NOT NULL,
        mime_type TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL REFERENCES content_objects(sha256),
        provider_id TEXT NOT NULL,
        container TEXT NOT NULL,
        object_key TEXT NOT NULL,
        object_version TEXT,
        transform_version TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(provider_id, container, object_key)
      );

      CREATE TABLE IF NOT EXISTS document_assets (
        document_id TEXT NOT NULL REFERENCES documents(id),
        artifact_id TEXT NOT NULL REFERENCES artifacts(id),
        role TEXT NOT NULL,
        PRIMARY KEY(document_id, artifact_id, role)
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        document_id TEXT REFERENCES documents(id),
        operation TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'pending',
        input TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        available_at TEXT NOT NULL,
        lease_owner TEXT,
        lease_epoch INTEGER NOT NULL DEFAULT 0,
        lease_until TEXT,
        error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_jobs_eligible 
      ON jobs(available_at, id) 
      WHERE status IN ('pending', 'retry_wait');

      CREATE TABLE IF NOT EXISTS outbox_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT,
        dispatch_owner TEXT,
        dispatch_until TEXT,
        dispatch_epoch INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_pending 
      ON outbox_events(created_at, id) 
      WHERE published_at IS NULL;
    `);
  }

  async createSource(source: {
    id?: string;
    name: string;
    descriptor: Record<string, unknown>;
    enabled?: boolean;
  }): Promise<SourceRecord> {
    const id = source.id || randomUUID();
    const enabledVal = source.enabled ? 1 : 0;
    const stmt = this.db.prepare(`
      INSERT INTO sources (id, name, descriptor, enabled)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        descriptor = excluded.descriptor,
        enabled = excluded.enabled
    `);
    stmt.run(id, source.name, JSON.stringify(source.descriptor), enabledVal);

    return {
      id,
      name: source.name,
      descriptor: source.descriptor,
      enabled: Boolean(source.enabled),
    };
  }

  async getSource(id: string): Promise<SourceRecord | null> {
    const stmt = this.db.prepare("SELECT * FROM sources WHERE id = ?");
    const row = stmt.get(id) as
      | { id: string; name: string; descriptor: string; enabled: number }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      descriptor: JSON.parse(row.descriptor),
      enabled: Boolean(row.enabled),
    };
  }

  async getOrCreatePartition(sourceId: string, partitionKey: string): Promise<CrawlPartition> {
    const selectStmt = this.db.prepare(
      "SELECT * FROM crawl_partitions WHERE source_id = ? AND partition_key = ?"
    );
    const existing = selectStmt.get(sourceId, partitionKey) as
      | {
          id: string;
          source_id: string;
          partition_key: string;
          cursor: string | null;
          revision: number;
          lease_epoch: number;
          lease_owner: string | null;
          lease_until: string | null;
        }
      | undefined;

    if (existing) {
      return {
        id: existing.id,
        sourceId: existing.source_id,
        partitionKey: existing.partition_key,
        cursor: existing.cursor ? JSON.parse(existing.cursor) : null,
        revision: existing.revision,
        leaseEpoch: existing.lease_epoch,
        leaseOwner: existing.lease_owner,
        leaseUntil: existing.lease_until,
      };
    }

    const id = randomUUID();
    const insertStmt = this.db.prepare(`
      INSERT INTO crawl_partitions (id, source_id, partition_key, cursor, revision, lease_epoch)
      VALUES (?, ?, ?, NULL, 0, 0)
    `);
    insertStmt.run(id, sourceId, partitionKey);

    return {
      id,
      sourceId,
      partitionKey,
      cursor: null,
      revision: 0,
      leaseEpoch: 0,
      leaseOwner: null,
      leaseUntil: null,
    };
  }

  async updatePartitionCursor(
    id: string,
    cursor: Record<string, unknown>,
    expectedRevision: number
  ): Promise<boolean> {
    const stmt = this.db.prepare(`
      UPDATE crawl_partitions
      SET cursor = ?, revision = revision + 1
      WHERE id = ? AND revision = ?
    `);
    const info = stmt.run(JSON.stringify(cursor), id, expectedRevision);
    return info.changes === 1;
  }

  async upsertDocument(doc: {
    sourceId: string;
    externalId: string;
    canonicalUrl?: string;
  }): Promise<DocumentRecord> {
    const selectStmt = this.db.prepare(
      "SELECT * FROM documents WHERE source_id = ? AND external_id = ?"
    );
    const existing = selectStmt.get(doc.sourceId, doc.externalId) as
      | {
          id: string;
          source_id: string;
          external_id: string;
          canonical_url: string | null;
          discovered_at: string;
        }
      | undefined;

    if (existing) {
      return {
        id: existing.id,
        sourceId: existing.source_id,
        externalId: existing.external_id,
        canonicalUrl: existing.canonical_url,
        discoveredAt: existing.discovered_at,
      };
    }

    const id = randomUUID();
    const discoveredAt = new Date().toISOString();
    const insertStmt = this.db.prepare(`
      INSERT INTO documents (id, source_id, external_id, canonical_url, discovered_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertStmt.run(id, doc.sourceId, doc.externalId, doc.canonicalUrl || null, discoveredAt);

    return {
      id,
      sourceId: doc.sourceId,
      externalId: doc.externalId,
      canonicalUrl: doc.canonicalUrl || null,
      discoveredAt,
    };
  }

  async registerContentObject(obj: {
    sha256: string;
    sizeBytes: number;
    mimeType: string;
  }): Promise<ContentObjectRecord> {
    const stmt = this.db.prepare(`
      INSERT INTO content_objects (sha256, size_bytes, mime_type)
      VALUES (?, ?, ?)
      ON CONFLICT(sha256) DO NOTHING
    `);
    stmt.run(obj.sha256, obj.sizeBytes, obj.mimeType);

    return obj;
  }

  async recordArtifact(artifact: {
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
  }): Promise<ArtifactRecord> {
    await this.registerContentObject({
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      mimeType: artifact.mimeType,
    });

    const selectStmt = this.db.prepare(
      "SELECT * FROM artifacts WHERE provider_id = ? AND container = ? AND object_key = ?"
    );
    const existing = selectStmt.get(artifact.providerId, artifact.container, artifact.objectKey) as
      | {
          id: string;
          sha256: string;
          provider_id: string;
          container: string;
          object_key: string;
          object_version: string | null;
          transform_version: string;
          metadata: string;
          created_at: string;
        }
      | undefined;

    let artifactId: string;
    let createdAt: string;

    if (existing) {
      artifactId = existing.id;
      createdAt = existing.created_at;
    } else {
      artifactId = randomUUID();
      createdAt = new Date().toISOString();
      const insertStmt = this.db.prepare(`
        INSERT INTO artifacts (id, sha256, provider_id, container, object_key, object_version, transform_version, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        artifactId,
        artifact.sha256,
        artifact.providerId,
        artifact.container,
        artifact.objectKey,
        artifact.objectVersion || null,
        artifact.transformVersion,
        JSON.stringify(artifact.metadata || {}),
        createdAt
      );
    }

    if (artifact.documentId && artifact.role) {
      const assetStmt = this.db.prepare(`
        INSERT INTO document_assets (document_id, artifact_id, role)
        VALUES (?, ?, ?)
        ON CONFLICT(document_id, artifact_id, role) DO NOTHING
      `);
      assetStmt.run(artifact.documentId, artifactId, artifact.role);
    }

    return {
      id: artifactId,
      sha256: artifact.sha256,
      providerId: artifact.providerId,
      container: artifact.container,
      objectKey: artifact.objectKey,
      objectVersion: artifact.objectVersion || null,
      transformVersion: artifact.transformVersion,
      metadata: artifact.metadata || {},
      createdAt,
    };
  }

  async createJob(job: {
    documentId?: string;
    operation: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
    maxAttempts?: number;
  }): Promise<JobRecord> {
    const selectStmt = this.db.prepare("SELECT * FROM jobs WHERE idempotency_key = ?");
    const existing = selectStmt.get(job.idempotencyKey) as
      | {
          id: string;
          document_id: string | null;
          operation: string;
          idempotency_key: string;
          status: string;
          input: string;
          attempt: number;
          max_attempts: number;
          available_at: string;
          lease_owner: string | null;
          lease_epoch: number;
          lease_until: string | null;
          error_code: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (existing) {
      return {
        id: existing.id,
        documentId: existing.document_id,
        operation: existing.operation,
        idempotencyKey: existing.idempotency_key,
        status: existing.status as JobStatus,
        input: JSON.parse(existing.input),
        attempt: existing.attempt,
        maxAttempts: existing.max_attempts,
        availableAt: existing.available_at,
        leaseOwner: existing.lease_owner,
        leaseEpoch: existing.lease_epoch,
        leaseUntil: existing.lease_until,
        errorCode: existing.error_code,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      };
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const maxAttempts = job.maxAttempts || 5;

    const insertStmt = this.db.prepare(`
      INSERT INTO jobs (
        id, document_id, operation, idempotency_key, status, input, attempt, max_attempts,
        available_at, lease_epoch, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', ?, 0, ?, ?, 0, ?, ?)
    `);

    insertStmt.run(
      id,
      job.documentId || null,
      job.operation,
      job.idempotencyKey,
      JSON.stringify(job.input),
      maxAttempts,
      now,
      now,
      now
    );

    return {
      id,
      documentId: job.documentId || null,
      operation: job.operation,
      idempotencyKey: job.idempotencyKey,
      status: "pending",
      input: job.input,
      attempt: 0,
      maxAttempts,
      availableAt: now,
      leaseOwner: null,
      leaseEpoch: 0,
      leaseUntil: null,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    const fetchStmt = this.db.prepare("SELECT * FROM jobs WHERE id = ?");
    const row = fetchStmt.get(jobId) as
      | {
          id: string;
          document_id: string | null;
          operation: string;
          idempotency_key: string;
          status: string;
          input: string;
          attempt: number;
          max_attempts: number;
          available_at: string;
          lease_owner: string | null;
          lease_epoch: number;
          lease_until: string | null;
          error_code: string | null;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) return null;

    return {
      id: row.id,
      documentId: row.document_id,
      operation: row.operation,
      idempotencyKey: row.idempotency_key,
      status: row.status as JobStatus,
      input: JSON.parse(row.input),
      attempt: row.attempt,
      maxAttempts: row.max_attempts,
      availableAt: row.available_at,
      leaseOwner: row.lease_owner,
      leaseEpoch: row.lease_epoch,
      leaseUntil: row.lease_until,
      errorCode: row.error_code,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async claimJob(
    owner: string,
    leaseSeconds: number,
    allowedOperations?: string[]
  ): Promise<JobRecord | null> {
    const nowIso = new Date().toISOString();
    const leaseUntilIso = new Date(Date.now() + leaseSeconds * 1000).toISOString();

    // Atomic claim simulation with transaction
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      let eligible: { id: string } | undefined;

      if (allowedOperations && allowedOperations.length > 0) {
        const placeholders = allowedOperations.map(() => "?").join(", ");
        const selectStmt = this.db.prepare(`
          SELECT id FROM jobs
          WHERE status IN ('pending', 'retry_wait')
            AND available_at <= ?
            AND attempt < max_attempts
            AND operation IN (${placeholders})
          ORDER BY available_at ASC, id ASC
          LIMIT 1
        `);
        eligible = selectStmt.get(nowIso, ...allowedOperations) as { id: string } | undefined;
      } else {
        const selectStmt = this.db.prepare(`
          SELECT id FROM jobs
          WHERE status IN ('pending', 'retry_wait')
            AND available_at <= ?
            AND attempt < max_attempts
          ORDER BY available_at ASC, id ASC
          LIMIT 1
        `);
        eligible = selectStmt.get(nowIso) as { id: string } | undefined;
      }

      if (!eligible) {
        this.db.exec("COMMIT;");
        return null;
      }

      const updateStmt = this.db.prepare(`
        UPDATE jobs
        SET status = 'running',
            lease_owner = ?,
            lease_epoch = lease_epoch + 1,
            lease_until = ?,
            attempt = attempt + 1,
            updated_at = ?
        WHERE id = ? AND status IN ('pending', 'retry_wait')
      `);

      updateStmt.run(owner, leaseUntilIso, nowIso, eligible.id);

      const fetchStmt = this.db.prepare("SELECT * FROM jobs WHERE id = ?");
      const updated = fetchStmt.get(eligible.id) as {
        id: string;
        document_id: string | null;
        operation: string;
        idempotency_key: string;
        status: string;
        input: string;
        attempt: number;
        max_attempts: number;
        available_at: string;
        lease_owner: string | null;
        lease_epoch: number;
        lease_until: string | null;
        error_code: string | null;
        created_at: string;
        updated_at: string;
      };

      this.db.exec("COMMIT;");

      return {
        id: updated.id,
        documentId: updated.document_id,
        operation: updated.operation,
        idempotencyKey: updated.idempotency_key,
        status: updated.status as JobStatus,
        input: JSON.parse(updated.input),
        attempt: updated.attempt,
        maxAttempts: updated.max_attempts,
        availableAt: updated.available_at,
        leaseOwner: updated.lease_owner,
        leaseEpoch: updated.lease_epoch,
        leaseUntil: updated.lease_until,
        errorCode: updated.error_code,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      };
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  async heartbeatJob(
    jobId: string,
    owner: string,
    leaseEpoch: number,
    leaseSeconds: number
  ): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const leaseUntilIso = new Date(Date.now() + leaseSeconds * 1000).toISOString();

    const stmt = this.db.prepare(`
      UPDATE jobs
      SET lease_until = ?, updated_at = ?
      WHERE id = ? AND status = 'running' AND lease_owner = ?
        AND lease_epoch = ? AND lease_until > ?
    `);

    const info = stmt.run(leaseUntilIso, nowIso, jobId, owner, leaseEpoch, nowIso);
    return info.changes === 1;
  }

  async finalizeJob(
    jobId: string,
    owner: string,
    leaseEpoch: number,
    options?: FinalizeJobOptions
  ): Promise<boolean> {
    const nowIso = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const updateJobStmt = this.db.prepare(`
        UPDATE jobs
        SET status = 'succeeded',
            lease_owner = NULL,
            lease_until = NULL,
            updated_at = ?
        WHERE id = ? AND status = 'running' AND lease_owner = ?
          AND lease_epoch = ? AND lease_until > ?
      `);

      const info = updateJobStmt.run(nowIso, jobId, owner, leaseEpoch, nowIso);
      if (info.changes !== 1) {
        this.db.exec("ROLLBACK;");
        return false;
      }

      // Record child artifacts if provided
      if (options?.artifacts) {
        for (const art of options.artifacts) {
          await this.recordArtifact(art);
        }
      }

      // Record child jobs if provided
      if (options?.childJobs) {
        for (const child of options.childJobs) {
          await this.createJob(child);
        }
      }

      // Emit outbox events atomically
      if (options?.outboxEvents) {
        const outboxStmt = this.db.prepare(`
          INSERT INTO outbox_events (id, job_id, event_type, payload, created_at, dispatch_epoch)
          VALUES (?, ?, ?, ?, ?, 0)
        `);
        for (const event of options.outboxEvents) {
          const eventId = randomUUID();
          outboxStmt.run(eventId, jobId, event.eventType, JSON.stringify(event.payload), nowIso);
        }
      }

      this.db.exec("COMMIT;");
      return true;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  async failJob(
    jobId: string,
    owner: string,
    leaseEpoch: number,
    errorCode: string,
    options?: FailJobOptions
  ): Promise<boolean> {
    const nowIso = new Date().toISOString();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const fetchStmt = this.db.prepare(`
        SELECT attempt, max_attempts FROM jobs
        WHERE id = ? AND status = 'running' AND lease_owner = ?
          AND lease_epoch = ? AND lease_until > ?
      `);
      const job = fetchStmt.get(jobId, owner, leaseEpoch, nowIso) as
        | { attempt: number; max_attempts: number }
        | undefined;

      if (!job) {
        this.db.exec("ROLLBACK;");
        return false;
      }

      let finalStatus: JobStatus;
      let nextAvailableAt: string;

      if (options?.quarantine) {
        finalStatus = "quarantined";
        nextAvailableAt = nowIso;
      } else if (options?.terminal || job.attempt >= job.max_attempts) {
        finalStatus = "failed";
        nextAvailableAt = nowIso;
      } else {
        finalStatus = "retry_wait";
        const delaySeconds = options?.retryAfterSeconds ?? Math.min(300, 2 ** job.attempt * 5);
        nextAvailableAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
      }

      const updateStmt = this.db.prepare(`
        UPDATE jobs
        SET status = ?,
            lease_owner = NULL,
            lease_until = NULL,
            available_at = ?,
            error_code = ?,
            updated_at = ?
        WHERE id = ? AND status = 'running' AND lease_owner = ?
          AND lease_epoch = ? AND lease_until > ?
      `);

      const info = updateStmt.run(
        finalStatus,
        nextAvailableAt,
        errorCode,
        nowIso,
        jobId,
        owner,
        leaseEpoch,
        nowIso
      );

      if (info.changes !== 1) {
        this.db.exec("ROLLBACK;");
        return false;
      }

      this.db.exec("COMMIT;");
      return true;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  async claimOutboxEvents(
    owner: string,
    batchSize = 50,
    leaseSeconds = 60
  ): Promise<OutboxEventRecord[]> {
    const nowIso = new Date().toISOString();
    const leaseUntilIso = new Date(Date.now() + leaseSeconds * 1000).toISOString();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const selectStmt = this.db.prepare(`
        SELECT id FROM outbox_events
        WHERE published_at IS NULL
          AND (dispatch_until IS NULL OR dispatch_until < ?)
        ORDER BY created_at ASC, id ASC
        LIMIT ?
      `);

      const rows = selectStmt.all(nowIso, batchSize) as Array<{ id: string }>;
      if (rows.length === 0) {
        this.db.exec("COMMIT;");
        return [];
      }

      const updateStmt = this.db.prepare(`
        UPDATE outbox_events
        SET dispatch_owner = ?,
            dispatch_until = ?,
            dispatch_epoch = dispatch_epoch + 1
        WHERE id = ?
      `);

      for (const row of rows) {
        updateStmt.run(owner, leaseUntilIso, row.id);
      }

      const placeholders = rows.map(() => "?").join(", ");
      const fetchStmt = this.db.prepare(`
        SELECT * FROM outbox_events WHERE id IN (${placeholders})
      `);

      const fetched = fetchStmt.all(...rows.map((r) => r.id)) as Array<{
        id: string;
        job_id: string;
        event_type: string;
        payload: string;
        created_at: string;
        published_at: string | null;
        dispatch_owner: string | null;
        dispatch_until: string | null;
        dispatch_epoch: number;
      }>;

      this.db.exec("COMMIT;");

      return fetched.map((f) => ({
        id: f.id,
        jobId: f.job_id,
        eventType: f.event_type,
        payload: JSON.parse(f.payload),
        createdAt: f.created_at,
        publishedAt: f.published_at,
        dispatchOwner: f.dispatch_owner,
        dispatchUntil: f.dispatch_until,
        dispatchEpoch: f.dispatch_epoch,
      }));
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  async markOutboxPublished(
    eventId: string,
    owner: string,
    dispatchEpoch: number
  ): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE outbox_events
      SET published_at = ?,
          dispatch_owner = NULL,
          dispatch_until = NULL
      WHERE id = ? AND dispatch_owner = ? AND dispatch_epoch = ?
    `);

    const info = stmt.run(nowIso, eventId, owner, dispatchEpoch);
    return info.changes === 1;
  }

  async reapExpiredLeases(): Promise<{ expiredJobs: number; expiredOutbox: number }> {
    const nowIso = new Date().toISOString();

    const jobReapStmt = this.db.prepare(`
      UPDATE jobs
      SET status = CASE WHEN attempt >= max_attempts THEN 'failed' ELSE 'retry_wait' END,
          lease_owner = NULL,
          lease_until = NULL,
          available_at = ?,
          updated_at = ?,
          error_code = 'lease_expired'
      WHERE status = 'running' AND lease_until < ?
    `);
    const jobInfo = jobReapStmt.run(nowIso, nowIso, nowIso);

    const outboxReapStmt = this.db.prepare(`
      UPDATE outbox_events
      SET dispatch_owner = NULL,
          dispatch_until = NULL
      WHERE published_at IS NULL AND dispatch_until < ?
    `);
    const outboxInfo = outboxReapStmt.run(nowIso);

    return {
      expiredJobs: Number(jobInfo.changes),
      expiredOutbox: Number(outboxInfo.changes),
    };
  }

  close(): void {
    this.db.close();
  }
}
