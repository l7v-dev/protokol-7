/**
 * SQLite Relational Database Engine for Protokol-7.
 * Provides ACID persistence for Actor Runs, Event Logs, Pipeline Executions, and Scheduled Jobs
 * using native node:sqlite with zero external dependencies.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type {
  ArtifactPathTier,
  DatasetReleaseGateRecord,
  DocumentOccurrenceRecord,
  DocumentProvenanceRecord,
  ReleaseState,
} from "../../contracts/provenance";
import { validateReleaseReview } from "../dataset/release-review";
import type { ReleaseReview } from "../dataset/types";
import type { PipelineRunResult } from "../pipeline/pipeline-runner";
import type { ScheduledJobInfo } from "../pipeline/schedule-broker";
import { type LogEvent, MetadataLogEventSchema, type StoredLogEvent } from "../telemetry/log-event";
import { applyBlueprintMigration } from "./blueprint-migration";
import type { RunMetadata, RunRecord, RunStatus } from "./run-registry";

export interface DatasetShardRecord {
  shardId: string;
  pipelineRunId?: string;
  datasetName: string;
  fileName: string;
  storageUri: string;
  storageBackend: string;
  recordCount: number;
  sizeBytes: number;
  sha256Hash: string;
  compressionCodec?: string;
  createdAt: string;
}

export interface DatasetSnapshotRecord {
  releaseState?: ReleaseState;
  runId?: string;
  traceId?: string;
  gitCommit?: string;
  snapshotId: string;
  datasetName: string;
  version: string;
  splitsJson: string;
  shardCount: number;
  totalRecordCount: number;
  totalSizeBytes: number;
  totalTokensEstimated: number;
  manifestUri: string;
  manifestJson: string;
  createdAt: string;
}

export interface DatasetRecord {
  datasetId: string;
  name: string;
  sourcePlatform: string;
  licenseGroup:
    | "permissive_commercial"
    | "non_commercial_research"
    | "public_domain"
    | "restricted";
  defaultLanguage?: string;
  description?: string;
  createdAt: string;
}

export interface StorageReplicaRecord {
  pathTier?: ArtifactPathTier;
  replicaId: string;
  shardId: string;
  storageProvider: string;
  remoteUri: string;
  remoteSha256Hash: string;
  remoteSizeBytes: number;
  syncStatus: "PENDING" | "UPLOADING" | "VERIFIED" | "FAILED";
  verifiedAt?: string;
  lastError?: string;
}

export interface VerificationAuditRecord {
  auditId: string;
  shardId: string;
  runId: string;
  recordCountMatches: boolean;
  parquetReadable: boolean;
  checksumMatches: boolean;
  verificationPassed: boolean;
  rawSourcePath: string;
  rawSourceSha256?: string;
  rawPurged: boolean;
  purgedAt?: string;
  verifierIdentity: string;
  notes?: string;
  createdAt: string;
}

export interface RegistryDatabaseOptions {
  dbPath?: string;
  inMemory?: boolean;
}

export class RegistryDatabase {
  private readonly db: DatabaseSync;
  private readonly dbPath: string;
  private readonly isMemory: boolean;

  // Prepared statements for high performance execution
  private stmtInsertRun!: StatementSync;
  private stmtUpdateRunStatus!: StatementSync;
  private stmtCompleteRun!: StatementSync;
  private stmtFailRun!: StatementSync;
  private stmtGetRun!: StatementSync;
  private stmtListRuns!: StatementSync;
  private stmtInsertLog!: StatementSync;
  private stmtGetLogsForRun!: StatementSync;

  private stmtInsertPipelineExec!: StatementSync;
  private stmtListPipelineExecs!: StatementSync;

  private stmtUpsertJob!: StatementSync;
  private stmtUpdateJobRun!: StatementSync;
  private stmtUpdateJobRunFailure!: StatementSync;
  private stmtSetJobRunning!: StatementSync;
  private stmtListJobs!: StatementSync;
  private stmtGetJob!: StatementSync;
  private stmtDeleteJob!: StatementSync;

  private stmtInsertShard!: StatementSync;
  private stmtListShardsByDataset!: StatementSync;
  private stmtListShardsAll!: StatementSync;
  private stmtGetShard!: StatementSync;
  private stmtDeleteShard!: StatementSync;

  private stmtUpsertDataset!: StatementSync;
  private stmtGetDataset!: StatementSync;
  private stmtListDatasets!: StatementSync;
  private stmtDeleteDataset!: StatementSync;

  private stmtInsertSnapshot!: StatementSync;
  private stmtListSnapshotsByName!: StatementSync;
  private stmtListSnapshotsAll!: StatementSync;
  private stmtGetSnapshot!: StatementSync;
  private stmtGetLatestSnapshotByName!: StatementSync;
  private stmtDeleteSnapshot!: StatementSync;

  private stmtInsertReplica!: StatementSync;
  private stmtListReplicasByShard!: StatementSync;

  private stmtInsertAudit!: StatementSync;
  private stmtListAuditByRun!: StatementSync;
  private stmtInsertOtelLog!: StatementSync;
  private stmtListOtelLogs!: StatementSync;
  private stmtListOtelLogsByTrace!: StatementSync;

  constructor(options?: RegistryDatabaseOptions) {
    const isTest = process.env.NODE_ENV === "test";
    this.isMemory =
      options?.inMemory ?? (options?.dbPath === ":memory:" || (isTest && !options?.dbPath));
    this.dbPath = this.isMemory
      ? ":memory:"
      : options?.dbPath || process.env.PROTOKOL_DB_PATH || "data/catalog.sqlite";

    if (!this.isMemory) {
      const dir = dirname(this.dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    try {
      this.initDatabase();
      this.prepareStatements();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  private initDatabase(): void {
    this.db.exec("PRAGMA foreign_keys = ON;");

    if (!this.isMemory) {
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");
      this.db.exec("PRAGMA busy_timeout = 5000;");
    }

    // 1. Actor Runs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS actor_runs (
        run_id TEXT PRIMARY KEY,
        actor_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'succeeded', 'failed', 'vetoed')),
        input_json TEXT NOT NULL,
        output_json TEXT,
        error_message TEXT,
        item_count INTEGER DEFAULT 0,
        duration_ms INTEGER,
        actor_version TEXT,
        actor_category TEXT,
        execution_target TEXT DEFAULT 'local',
        source_url TEXT,
        source_domain TEXT,
        content_language TEXT,
        http_status_code INTEGER,
        retry_count INTEGER DEFAULT 0,
        byte_size_output INTEGER DEFAULT 0,
        pipeline_run_id TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
    `);

    // Migration for existing tables created before metadata columns
    try {
      const existingCols = new Set(
        (this.db.prepare("PRAGMA table_info(actor_runs);").all() as Array<{ name: string }>).map(
          (c) => c.name
        )
      );
      const newCols: Array<{ name: string; type: string }> = [
        { name: "actor_version", type: "TEXT" },
        { name: "actor_category", type: "TEXT" },
        { name: "execution_target", type: "TEXT DEFAULT 'local'" },
        { name: "source_url", type: "TEXT" },
        { name: "source_domain", type: "TEXT" },
        { name: "content_language", type: "TEXT" },
        { name: "http_status_code", type: "INTEGER" },
        { name: "retry_count", type: "INTEGER DEFAULT 0" },
        { name: "byte_size_output", type: "INTEGER DEFAULT 0" },
        { name: "pipeline_run_id", type: "TEXT" },
      ];
      for (const col of newCols) {
        if (!existingCols.has(col.name)) {
          this.db.exec(`ALTER TABLE actor_runs ADD COLUMN ${col.name} ${col.type};`);
        }
      }
    } catch {
      // Ignore migration errors during in-memory initialization
    }

    // 2. Actor Run Logs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS actor_run_logs (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES actor_runs(run_id) ON DELETE CASCADE,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR', 'PASS', 'VETO')),
        message TEXT NOT NULL
      );
    `);

    // 3. Pipeline Executions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_executions (
        execution_id TEXT PRIMARY KEY,
        pipeline_name TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('succeeded', 'failed')),
        item_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        receipt_json TEXT,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL
      );
    `);

    // 4. Scheduled Jobs
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_jobs (
        job_id TEXT PRIMARY KEY,
        cron_expression TEXT NOT NULL,
        running INTEGER NOT NULL DEFAULT 1 CHECK(running IN (0, 1)),
        last_run_at TEXT,
        run_count INTEGER NOT NULL DEFAULT 0,
        pipeline_config_json TEXT,
        actor_config_json TEXT,
        last_error TEXT,
        fail_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    // Migration for scheduled_jobs columns
    try {
      const existingJobCols = new Set(
        (
          this.db.prepare("PRAGMA table_info(scheduled_jobs);").all() as Array<{ name: string }>
        ).map((c) => c.name)
      );
      const newJobCols: Array<{ name: string; type: string }> = [
        { name: "pipeline_config_json", type: "TEXT" },
        { name: "actor_config_json", type: "TEXT" },
        { name: "last_error", type: "TEXT" },
        { name: "fail_count", type: "INTEGER NOT NULL DEFAULT 0" },
      ];
      for (const col of newJobCols) {
        if (!existingJobCols.has(col.name)) {
          this.db.exec(`ALTER TABLE scheduled_jobs ADD COLUMN ${col.name} ${col.type};`);
        }
      }
    } catch {
      // Ignore migration errors during in-memory initialization
    }

    // 5. Datasets Catalog
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS datasets (
        dataset_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source_platform TEXT NOT NULL,
        license_group TEXT NOT NULL CHECK(license_group IN ('permissive_commercial', 'non_commercial_research', 'public_domain', 'restricted')),
        default_language TEXT NOT NULL DEFAULT 'und',
        description TEXT,
        created_at TEXT NOT NULL
      );
    `);

    // 6. Dataset Shards
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dataset_shards (
        shard_id TEXT PRIMARY KEY,
        pipeline_run_id TEXT,
        dataset_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        storage_uri TEXT NOT NULL,
        storage_backend TEXT NOT NULL,
        record_count INTEGER NOT NULL DEFAULT 0,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        sha256_hash TEXT NOT NULL,
        compression_codec TEXT NOT NULL DEFAULT 'zstd',
        created_at TEXT NOT NULL
      );
    `);

    // 7. Storage Replicas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storage_replicas (
        replica_id TEXT PRIMARY KEY,
        shard_id TEXT NOT NULL,
        storage_provider TEXT NOT NULL,
        remote_uri TEXT NOT NULL,
        remote_sha256_hash TEXT NOT NULL,
        remote_size_bytes INTEGER NOT NULL,
        sync_status TEXT NOT NULL CHECK(sync_status IN ('PENDING', 'UPLOADING', 'VERIFIED', 'FAILED')),
        verified_at TEXT,
        last_error TEXT,
        FOREIGN KEY (shard_id) REFERENCES dataset_shards(shard_id) ON DELETE CASCADE
      );
    `);

    // 8. Verification Audit Ledger
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS verification_audit_ledger (
        audit_id TEXT PRIMARY KEY,
        shard_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        record_count_matches INTEGER NOT NULL CHECK(record_count_matches IN (0, 1)),
        parquet_readable INTEGER NOT NULL CHECK(parquet_readable IN (0, 1)),
        checksum_matches INTEGER NOT NULL CHECK(checksum_matches IN (0, 1)),
        verification_passed INTEGER NOT NULL CHECK(verification_passed IN (0, 1)),
        raw_source_path TEXT NOT NULL,
        raw_source_sha256 TEXT,
        raw_purged INTEGER NOT NULL DEFAULT 0 CHECK(raw_purged IN (0, 1)),
        purged_at TEXT,
        verifier_identity TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (shard_id) REFERENCES dataset_shards(shard_id) ON DELETE CASCADE
      );
    `);

    // 9. Dataset Snapshots & Training Manifests
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dataset_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        dataset_name TEXT NOT NULL,
        version TEXT NOT NULL,
        splits_json TEXT NOT NULL,
        shard_count INTEGER NOT NULL DEFAULT 0,
        total_record_count INTEGER NOT NULL DEFAULT 0,
        total_size_bytes INTEGER NOT NULL DEFAULT 0,
        total_tokens_estimated INTEGER NOT NULL DEFAULT 0,
        manifest_uri TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Indexes
    applyBlueprintMigration(this.db);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_actor_runs_status ON actor_runs(status);
      CREATE INDEX IF NOT EXISTS idx_actor_runs_started_at ON actor_runs(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_actor_runs_domain ON actor_runs(source_domain);
      CREATE INDEX IF NOT EXISTS idx_actor_runs_pipeline ON actor_runs(pipeline_run_id);
      CREATE INDEX IF NOT EXISTS idx_actor_run_logs_run_id ON actor_run_logs(run_id);
      CREATE INDEX IF NOT EXISTS idx_pipeline_exec_started ON pipeline_executions(started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_running ON scheduled_jobs(running);
      CREATE INDEX IF NOT EXISTS idx_dataset_shards_dataset ON dataset_shards(dataset_name);
      CREATE INDEX IF NOT EXISTS idx_dataset_shards_pipeline ON dataset_shards(pipeline_run_id);
      CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_name ON dataset_snapshots(dataset_name);
      CREATE INDEX IF NOT EXISTS idx_dataset_snapshots_created ON dataset_snapshots(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_replicas_shard ON storage_replicas(shard_id);
      CREATE INDEX IF NOT EXISTS idx_replicas_status ON storage_replicas(sync_status);
      CREATE INDEX IF NOT EXISTS idx_audit_shard ON verification_audit_ledger(shard_id);
      CREATE INDEX IF NOT EXISTS idx_audit_run ON verification_audit_ledger(run_id);
    `);
  }

  private prepareStatements(): void {
    this.stmtInsertRun = this.db.prepare(`
      INSERT OR REPLACE INTO actor_runs (
        run_id, actor_name, status, input_json, actor_version, actor_category,
        execution_target, source_url, source_domain, content_language, pipeline_run_id, started_at,
        trace_id, span_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtUpdateRunStatus = this.db.prepare(`
      UPDATE actor_runs SET status = ? WHERE run_id = ?
    `);

    this.stmtCompleteRun = this.db.prepare(`
      UPDATE actor_runs SET
        status = 'succeeded',
        output_json = ?,
        item_count = ?,
        http_status_code = COALESCE(?, http_status_code),
        retry_count = COALESCE(?, retry_count),
        byte_size_output = COALESCE(?, byte_size_output),
        finished_at = ?,
        duration_ms = ?
      WHERE run_id = ?
    `);

    this.stmtFailRun = this.db.prepare(`
      UPDATE actor_runs SET
        status = 'failed',
        error_message = ?,
        http_status_code = COALESCE(?, http_status_code),
        retry_count = COALESCE(?, retry_count),
        finished_at = ?,
        duration_ms = ?
      WHERE run_id = ?
    `);

    this.stmtGetRun = this.db.prepare(`
      SELECT run_id, actor_name, status, input_json, output_json, error_message,
             item_count, duration_ms, actor_version, actor_category,
             execution_target, source_url, source_domain, content_language,
             http_status_code, retry_count, byte_size_output, pipeline_run_id,
             started_at, finished_at, trace_id, span_id
      FROM actor_runs WHERE run_id = ?
    `);

    this.stmtListRuns = this.db.prepare(`
      SELECT run_id, actor_name, status, input_json, output_json, error_message,
             item_count, duration_ms, actor_version, actor_category,
             execution_target, source_url, source_domain, content_language,
             http_status_code, retry_count, byte_size_output, pipeline_run_id,
             started_at, finished_at, trace_id, span_id
      FROM actor_runs ORDER BY started_at DESC LIMIT ?
    `);

    this.stmtInsertLog = this.db.prepare(`
      INSERT INTO actor_run_logs (run_id, timestamp, level, message)
      VALUES (?, ?, ?, ?)
    `);

    this.stmtGetLogsForRun = this.db.prepare(`
      SELECT timestamp, level, message
      FROM actor_run_logs WHERE run_id = ? ORDER BY log_id ASC
    `);

    this.stmtInsertPipelineExec = this.db.prepare(`
      INSERT OR REPLACE INTO pipeline_executions (
        execution_id, pipeline_name, actor_id, status, item_count,
        duration_ms, receipt_json, error_message, started_at, completed_at, processing_metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtListPipelineExecs = this.db.prepare(`
      SELECT execution_id, pipeline_name, actor_id, status, item_count,
             duration_ms, receipt_json, error_message, started_at, completed_at, processing_metadata_json
      FROM pipeline_executions ORDER BY started_at DESC LIMIT ?
    `);

    this.stmtUpsertJob = this.db.prepare(`
      INSERT INTO scheduled_jobs (
        job_id, cron_expression, running, last_run_at, run_count,
        pipeline_config_json, actor_config_json, last_error, fail_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        cron_expression = excluded.cron_expression,
        running = excluded.running,
        last_run_at = excluded.last_run_at,
        run_count = excluded.run_count,
        pipeline_config_json = COALESCE(excluded.pipeline_config_json, scheduled_jobs.pipeline_config_json),
        actor_config_json = COALESCE(excluded.actor_config_json, scheduled_jobs.actor_config_json),
        last_error = excluded.last_error,
        fail_count = excluded.fail_count,
        updated_at = excluded.updated_at
    `);

    this.stmtUpdateJobRun = this.db.prepare(`
      UPDATE scheduled_jobs SET
        last_run_at = ?,
        run_count = ?,
        last_error = NULL,
        updated_at = ?
      WHERE job_id = ?
    `);

    this.stmtUpdateJobRunFailure = this.db.prepare(`
      UPDATE scheduled_jobs SET
        last_run_at = ?,
        fail_count = fail_count + 1,
        last_error = ?,
        updated_at = ?
      WHERE job_id = ?
    `);

    this.stmtSetJobRunning = this.db.prepare(`
      UPDATE scheduled_jobs SET running = ?, updated_at = ? WHERE job_id = ?
    `);

    this.stmtListJobs = this.db.prepare(`
      SELECT job_id, cron_expression, running, last_run_at, run_count,
             pipeline_config_json, actor_config_json, last_error, fail_count
      FROM scheduled_jobs ORDER BY job_id ASC
    `);

    this.stmtGetJob = this.db.prepare(`
      SELECT job_id, cron_expression, running, last_run_at, run_count,
             pipeline_config_json, actor_config_json, last_error, fail_count
      FROM scheduled_jobs WHERE job_id = ?
    `);

    this.stmtDeleteJob = this.db.prepare(`
      DELETE FROM scheduled_jobs WHERE job_id = ?
    `);

    this.stmtInsertShard = this.db.prepare(`
      INSERT OR REPLACE INTO dataset_shards (
        shard_id, pipeline_run_id, dataset_name, file_name, storage_uri,
        storage_backend, record_count, size_bytes, sha256_hash, compression_codec, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtListShardsByDataset = this.db.prepare(`
      SELECT shard_id, pipeline_run_id, dataset_name, file_name, storage_uri,
             storage_backend, record_count, size_bytes, sha256_hash, compression_codec, created_at
      FROM dataset_shards WHERE dataset_name = ? ORDER BY created_at DESC LIMIT ?
    `);

    this.stmtListShardsAll = this.db.prepare(`
      SELECT shard_id, pipeline_run_id, dataset_name, file_name, storage_uri,
             storage_backend, record_count, size_bytes, sha256_hash, compression_codec, created_at
      FROM dataset_shards ORDER BY created_at DESC LIMIT ?
    `);

    this.stmtGetShard = this.db.prepare(`
      SELECT shard_id, pipeline_run_id, dataset_name, file_name, storage_uri,
             storage_backend, record_count, size_bytes, sha256_hash, compression_codec, created_at
      FROM dataset_shards WHERE shard_id = ?
    `);

    this.stmtDeleteShard = this.db.prepare(`
      DELETE FROM dataset_shards WHERE shard_id = ?
    `);

    this.stmtUpsertDataset = this.db.prepare(`
      INSERT INTO datasets (dataset_id, name, source_platform, license_group, default_language, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dataset_id) DO UPDATE SET
        name = excluded.name,
        source_platform = excluded.source_platform,
        license_group = excluded.license_group,
        default_language = excluded.default_language,
        description = excluded.description
    `);

    this.stmtGetDataset = this.db.prepare(`
      SELECT dataset_id, name, source_platform, license_group, default_language, description, created_at
      FROM datasets WHERE dataset_id = ?
    `);

    this.stmtListDatasets = this.db.prepare(`
      SELECT dataset_id, name, source_platform, license_group, default_language, description, created_at
      FROM datasets ORDER BY created_at DESC
    `);

    this.stmtDeleteDataset = this.db.prepare(`
      DELETE FROM datasets WHERE dataset_id = ?
    `);

    this.stmtInsertSnapshot = this.db.prepare(`
      INSERT INTO dataset_snapshots (
        snapshot_id, dataset_name, version, splits_json, shard_count,
        total_record_count, total_size_bytes, total_tokens_estimated,
        manifest_uri, manifest_json, created_at, run_id, trace_id, git_commit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtListSnapshotsByName = this.db.prepare(`
      SELECT snapshot_id, dataset_name, version, splits_json, shard_count,
             total_record_count, total_size_bytes, total_tokens_estimated,
             manifest_uri, manifest_json, created_at, release_state, run_id, trace_id, git_commit
      FROM dataset_snapshots WHERE dataset_name = ? ORDER BY created_at DESC LIMIT ?
    `);

    this.stmtListSnapshotsAll = this.db.prepare(`
      SELECT snapshot_id, dataset_name, version, splits_json, shard_count,
             total_record_count, total_size_bytes, total_tokens_estimated,
             manifest_uri, manifest_json, created_at, release_state, run_id, trace_id, git_commit
      FROM dataset_snapshots ORDER BY created_at DESC LIMIT ?
    `);

    this.stmtGetSnapshot = this.db.prepare(`
      SELECT snapshot_id, dataset_name, version, splits_json, shard_count,
             total_record_count, total_size_bytes, total_tokens_estimated,
             manifest_uri, manifest_json, created_at, release_state, run_id, trace_id, git_commit
      FROM dataset_snapshots WHERE snapshot_id = ?
    `);

    this.stmtGetLatestSnapshotByName = this.db.prepare(`
      SELECT snapshot_id, dataset_name, version, splits_json, shard_count,
             total_record_count, total_size_bytes, total_tokens_estimated,
             manifest_uri, manifest_json, created_at, release_state, run_id, trace_id, git_commit
      FROM dataset_snapshots WHERE dataset_name = ? ORDER BY created_at DESC LIMIT 1
    `);

    this.stmtDeleteSnapshot = this.db.prepare(`
      DELETE FROM dataset_snapshots WHERE snapshot_id = ?
    `);

    this.stmtInsertReplica = this.db.prepare(`
      INSERT OR REPLACE INTO storage_replicas (
        replica_id, shard_id, storage_provider, remote_uri, remote_sha256_hash,
        remote_size_bytes, sync_status, verified_at, last_error, path_tier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtListReplicasByShard = this.db.prepare(`
      SELECT replica_id, shard_id, storage_provider, remote_uri, remote_sha256_hash,
             remote_size_bytes, sync_status, verified_at, last_error, path_tier
      FROM storage_replicas WHERE shard_id = ? ORDER BY verified_at DESC
    `);

    this.stmtInsertAudit = this.db.prepare(`
      INSERT OR REPLACE INTO verification_audit_ledger (
        audit_id, shard_id, run_id, record_count_matches, parquet_readable,
        checksum_matches, verification_passed, raw_source_path, raw_source_sha256,
        raw_purged, purged_at, verifier_identity, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtListAuditByRun = this.db.prepare(`
      SELECT audit_id, shard_id, run_id, record_count_matches, parquet_readable,
             checksum_matches, verification_passed, raw_source_path, raw_source_sha256,
             raw_purged, purged_at, verifier_identity, notes, created_at
      FROM verification_audit_ledger WHERE run_id = ? ORDER BY created_at DESC
    `);
    this.stmtInsertOtelLog = this.db.prepare(`
      INSERT INTO otel_log_events (
        timestamp, observed_timestamp, event_name, severity_text, severity_number, body,
        trace_id, span_id, service_name, service_version, deployment_env,
        blueprint_run_id, blueprint_agent_id, blueprint_skill_id, blueprint_status,
        blueprint_duration_ms, content_capture
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.stmtListOtelLogs = this.db.prepare(
      "SELECT * FROM otel_log_events ORDER BY event_id DESC LIMIT ?"
    );
    this.stmtListOtelLogsByTrace = this.db.prepare(
      "SELECT * FROM otel_log_events WHERE trace_id = ? ORDER BY event_id DESC LIMIT ?"
    );
  }

  // --- Actor Runs & Logs API ---

  createRun(record: {
    runId: string;
    actorName: string;
    input: Record<string, unknown>;
    startedAt: string;
    metadata?: RunMetadata;
  }): void {
    const meta = record.metadata;
    this.stmtInsertRun.run(
      record.runId,
      record.actorName,
      "pending",
      JSON.stringify(record.input),
      meta?.actorVersion || null,
      meta?.actorCategory || null,
      meta?.executionTarget || "local",
      meta?.sourceUrl || null,
      meta?.sourceDomain || null,
      meta?.contentLanguage || null,
      meta?.pipelineRunId || null,
      record.startedAt,
      meta?.traceId ?? null,
      meta?.spanId ?? null
    );
  }

  startRun(runId: string): void {
    this.stmtUpdateRunStatus.run("running", runId);
  }

  appendLog(
    runId: string,
    log: { timestamp: string; level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO"; message: string }
  ): void {
    this.stmtInsertLog.run(runId, log.timestamp, log.level, log.message);
  }

  completeRun(
    runId: string,
    output: unknown,
    itemCount: number,
    finishedAt: string,
    durationMs: number,
    metadata?: RunMetadata
  ): void {
    const outputJson = output !== undefined ? JSON.stringify(output) : null;
    const byteSize = metadata?.byteSizeOutput ?? (outputJson ? Buffer.byteLength(outputJson) : 0);
    this.stmtCompleteRun.run(
      outputJson,
      itemCount,
      metadata?.httpStatusCode ?? 200,
      metadata?.retryCount ?? null,
      byteSize,
      finishedAt,
      durationMs,
      runId
    );
  }

  failRun(
    runId: string,
    errorMessage: string,
    finishedAt: string,
    durationMs: number,
    metadata?: RunMetadata
  ): void {
    this.stmtFailRun.run(
      errorMessage,
      metadata?.httpStatusCode ?? null,
      metadata?.retryCount ?? null,
      finishedAt,
      durationMs,
      runId
    );
  }

  getRun(runId: string): RunRecord | undefined {
    const row = this.stmtGetRun.get(runId) as Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }

    const logRows = this.stmtGetLogsForRun.all(runId) as Array<{
      timestamp: string;
      level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO";
      message: string;
    }>;

    return this.mapRunRow(row, logRows);
  }

  listRuns(limit = 50): RunRecord[] {
    const rows = this.stmtListRuns.all(limit) as Record<string, unknown>[];
    return rows.map((row) => {
      const runId = String(row.run_id);
      const logRows = this.stmtGetLogsForRun.all(runId) as Array<{
        timestamp: string;
        level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO";
        message: string;
      }>;
      return this.mapRunRow(row, logRows);
    });
  }

  private mapRunRow(
    row: Record<string, unknown>,
    logs: Array<{
      timestamp: string;
      level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO";
      message: string;
    }>
  ): RunRecord {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(String(row.input_json || "{}"));
    } catch {
      input = {};
    }

    let output: unknown;
    if (row.output_json) {
      try {
        output = JSON.parse(String(row.output_json));
      } catch {
        output = row.output_json;
      }
    }

    const hasMetadata =
      row.actor_version ||
      row.actor_category ||
      row.execution_target ||
      row.source_url ||
      row.source_domain ||
      row.content_language ||
      row.http_status_code !== null ||
      row.retry_count !== null ||
      row.byte_size_output !== null ||
      row.pipeline_run_id ||
      row.trace_id ||
      row.span_id;

    const metadata: RunMetadata | undefined = hasMetadata
      ? {
          actorVersion: row.actor_version ? String(row.actor_version) : undefined,
          actorCategory: row.actor_category ? String(row.actor_category) : undefined,
          executionTarget: row.execution_target ? String(row.execution_target) : undefined,
          sourceUrl: row.source_url ? String(row.source_url) : undefined,
          sourceDomain: row.source_domain ? String(row.source_domain) : undefined,
          contentLanguage: row.content_language ? String(row.content_language) : undefined,
          httpStatusCode:
            row.http_status_code !== null && row.http_status_code !== undefined
              ? Number(row.http_status_code)
              : undefined,
          retryCount:
            row.retry_count !== null && row.retry_count !== undefined
              ? Number(row.retry_count)
              : undefined,
          byteSizeOutput:
            row.byte_size_output !== null && row.byte_size_output !== undefined
              ? Number(row.byte_size_output)
              : undefined,
          pipelineRunId: row.pipeline_run_id ? String(row.pipeline_run_id) : undefined,
          traceId: row.trace_id ? String(row.trace_id) : undefined,
          spanId: row.span_id ? String(row.span_id) : undefined,
        }
      : undefined;

    return {
      runId: String(row.run_id),
      actorName: String(row.actor_name),
      status: row.status as RunStatus,
      input,
      output,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      itemCount:
        row.item_count !== null && row.item_count !== undefined
          ? Number(row.item_count)
          : undefined,
      durationMs:
        row.duration_ms !== null && row.duration_ms !== undefined
          ? Number(row.duration_ms)
          : undefined,
      startedAt: String(row.started_at),
      finishedAt: row.finished_at ? String(row.finished_at) : undefined,
      logs,
      metadata,
    };
  }

  // --- Pipeline Executions API ---

  recordPipelineExecution(result: PipelineRunResult): void {
    this.stmtInsertPipelineExec.run(
      result.runId,
      result.pipelineName,
      result.actorId,
      result.status,
      result.itemCount,
      result.durationMs,
      result.receipt ? JSON.stringify(result.receipt) : null,
      result.error || null,
      result.startedAt,
      result.completedAt,
      result.contamination
        ? JSON.stringify({
            contamination: result.contamination,
            quarantineReceipt: result.quarantineReceipt,
            contaminationReceipt: result.contaminationReceipt,
          })
        : null
    );
  }

  listPipelineExecutions(limit = 50): PipelineRunResult[] {
    const rows = this.stmtListPipelineExecs.all(limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      runId: String(row.execution_id),
      pipelineName: String(row.pipeline_name),
      actorId: String(row.actor_id),
      status: row.status as "succeeded" | "failed",
      itemCount: Number(row.item_count),
      durationMs: Number(row.duration_ms),
      receipt: row.receipt_json ? JSON.parse(String(row.receipt_json)) : undefined,
      ...(row.processing_metadata_json ? JSON.parse(String(row.processing_metadata_json)) : {}),
      error: row.error_message ? String(row.error_message) : undefined,
      startedAt: String(row.started_at),
      completedAt: String(row.completed_at),
    }));
  }

  // --- Scheduled Jobs API ---

  upsertScheduledJob(job: ScheduledJobInfo): void {
    const now = new Date().toISOString();
    const pipelineConfigJson = job.pipelineConfig ? JSON.stringify(job.pipelineConfig) : null;
    const actorConfigJson = job.actorConfig ? JSON.stringify(job.actorConfig) : null;
    this.stmtUpsertJob.run(
      job.id,
      job.cronExpression,
      job.running ? 1 : 0,
      job.lastRunAt || null,
      job.runCount,
      pipelineConfigJson,
      actorConfigJson,
      job.lastError || null,
      job.failCount || 0,
      now,
      now
    );
  }

  updateScheduledJobRun(id: string, lastRunAt: string, runCount: number): void {
    const now = new Date().toISOString();
    this.stmtUpdateJobRun.run(lastRunAt, runCount, now, id);
  }

  updateScheduledJobFailure(id: string, lastRunAt: string, errorMessage: string): void {
    const now = new Date().toISOString();
    this.stmtUpdateJobRunFailure.run(lastRunAt, errorMessage, now, id);
  }

  setScheduledJobRunning(id: string, running: boolean): void {
    const now = new Date().toISOString();
    this.stmtSetJobRunning.run(running ? 1 : 0, now, id);
  }

  private mapJobRow(row: Record<string, unknown>): ScheduledJobInfo {
    let pipelineConfig: ScheduledJobInfo["pipelineConfig"];
    if (row.pipeline_config_json) {
      try {
        pipelineConfig = JSON.parse(String(row.pipeline_config_json));
      } catch {
        // ignore parse error
      }
    }

    let actorConfig: ScheduledJobInfo["actorConfig"];
    if (row.actor_config_json) {
      try {
        actorConfig = JSON.parse(String(row.actor_config_json));
      } catch {
        // ignore parse error
      }
    }

    return {
      id: String(row.job_id),
      cronExpression: String(row.cron_expression),
      running: Number(row.running) === 1,
      lastRunAt: row.last_run_at ? String(row.last_run_at) : undefined,
      runCount: Number(row.run_count),
      pipelineConfig,
      actorConfig,
      lastError: row.last_error ? String(row.last_error) : undefined,
      failCount:
        row.fail_count !== undefined && row.fail_count !== null ? Number(row.fail_count) : 0,
    };
  }

  listScheduledJobs(): ScheduledJobInfo[] {
    const rows = this.stmtListJobs.all() as Record<string, unknown>[];
    return rows.map((row) => this.mapJobRow(row));
  }

  getScheduledJob(id: string): ScheduledJobInfo | undefined {
    const row = this.stmtGetJob.get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.mapJobRow(row);
  }

  deleteScheduledJob(id: string): boolean {
    const result = this.stmtDeleteJob.run(id);
    return Number(result.changes) > 0;
  }

  // --- Dataset Shards API ---

  recordDatasetShard(shard: DatasetShardRecord): void {
    this.stmtInsertShard.run(
      shard.shardId,
      shard.pipelineRunId || null,
      shard.datasetName,
      shard.fileName,
      shard.storageUri,
      shard.storageBackend,
      shard.recordCount,
      shard.sizeBytes,
      shard.sha256Hash,
      shard.compressionCodec || "zstd",
      shard.createdAt
    );
  }

  listDatasetShards(datasetName?: string, limit = 50): DatasetShardRecord[] {
    const rows = (
      datasetName
        ? this.stmtListShardsByDataset.all(datasetName, limit)
        : this.stmtListShardsAll.all(limit)
    ) as Record<string, unknown>[];

    return rows.map((row) => ({
      shardId: String(row.shard_id),
      pipelineRunId: row.pipeline_run_id ? String(row.pipeline_run_id) : undefined,
      datasetName: String(row.dataset_name),
      fileName: String(row.file_name),
      storageUri: String(row.storage_uri),
      storageBackend: String(row.storage_backend),
      recordCount: Number(row.record_count),
      sizeBytes: Number(row.size_bytes),
      sha256Hash: String(row.sha256_hash),
      compressionCodec: row.compression_codec ? String(row.compression_codec) : undefined,
      createdAt: String(row.created_at),
    }));
  }

  getDatasetShard(shardId: string): DatasetShardRecord | undefined {
    const row = this.stmtGetShard.get(shardId) as Record<string, unknown> | undefined;
    if (!row) {
      return undefined;
    }
    return {
      shardId: String(row.shard_id),
      pipelineRunId: row.pipeline_run_id ? String(row.pipeline_run_id) : undefined,
      datasetName: String(row.dataset_name),
      fileName: String(row.file_name),
      storageUri: String(row.storage_uri),
      storageBackend: String(row.storage_backend),
      recordCount: Number(row.record_count),
      sizeBytes: Number(row.size_bytes),
      sha256Hash: String(row.sha256_hash),
      compressionCodec: row.compression_codec ? String(row.compression_codec) : undefined,
      createdAt: String(row.created_at),
    };
  }

  deleteDatasetShard(shardId: string): boolean {
    const result = this.stmtDeleteShard.run(shardId);
    return Number(result.changes) > 0;
  }

  // --- Datasets Catalog API ---

  upsertDataset(dataset: DatasetRecord): void {
    this.stmtUpsertDataset.run(
      dataset.datasetId,
      dataset.name,
      dataset.sourcePlatform,
      dataset.licenseGroup,
      dataset.defaultLanguage || "und",
      dataset.description || null,
      dataset.createdAt
    );
  }

  getDataset(datasetId: string): DatasetRecord | undefined {
    const row = this.stmtGetDataset.get(datasetId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      datasetId: String(row.dataset_id),
      name: String(row.name),
      sourcePlatform: String(row.source_platform),
      licenseGroup: row.license_group as DatasetRecord["licenseGroup"],
      defaultLanguage: row.default_language ? String(row.default_language) : undefined,
      description: row.description ? String(row.description) : undefined,
      createdAt: String(row.created_at),
    };
  }

  listDatasets(): DatasetRecord[] {
    const rows = this.stmtListDatasets.all() as Record<string, unknown>[];
    return rows.map((row) => ({
      datasetId: String(row.dataset_id),
      name: String(row.name),
      sourcePlatform: String(row.source_platform),
      licenseGroup: row.license_group as DatasetRecord["licenseGroup"],
      defaultLanguage: row.default_language ? String(row.default_language) : undefined,
      description: row.description ? String(row.description) : undefined,
      createdAt: String(row.created_at),
    }));
  }

  deleteDataset(datasetId: string): boolean {
    const result = this.stmtDeleteDataset.run(datasetId);
    return Number(result.changes) > 0;
  }

  // --- Dataset Snapshots API ---

  recordDatasetSnapshot(snapshot: DatasetSnapshotRecord): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const reservation = this.db
        .prepare(
          "SELECT snapshot_id FROM dataset_publication_reservations WHERE dataset_name = ? AND version = ?"
        )
        .get(snapshot.datasetName, snapshot.version);
      if (reservation && reservation.snapshot_id !== snapshot.snapshotId)
        throw new Error("Dataset version already exists.");
      if (!reservation)
        this.db
          .prepare(
            "INSERT INTO dataset_publication_reservations (dataset_name, version, snapshot_id) VALUES (?, ?, ?)"
          )
          .run(snapshot.datasetName, snapshot.version, snapshot.snapshotId);
      this.stmtInsertSnapshot.run(
        snapshot.snapshotId,
        snapshot.datasetName,
        snapshot.version,
        snapshot.splitsJson,
        snapshot.shardCount,
        snapshot.totalRecordCount,
        snapshot.totalSizeBytes,
        snapshot.totalTokensEstimated,
        snapshot.manifestUri,
        snapshot.manifestJson,
        snapshot.createdAt,
        snapshot.runId ?? null,
        snapshot.traceId ?? null,
        snapshot.gitCommit ?? null
      );
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listDatasetSnapshots(datasetName?: string, limit = 50): DatasetSnapshotRecord[] {
    const rows = (
      datasetName
        ? this.stmtListSnapshotsByName.all(datasetName, limit)
        : this.stmtListSnapshotsAll.all(limit)
    ) as Record<string, unknown>[];

    return rows.map((row) => ({
      snapshotId: String(row.snapshot_id),
      datasetName: String(row.dataset_name),
      version: String(row.version),
      splitsJson: String(row.splits_json),
      shardCount: Number(row.shard_count),
      totalRecordCount: Number(row.total_record_count),
      totalSizeBytes: Number(row.total_size_bytes),
      totalTokensEstimated: Number(row.total_tokens_estimated),
      manifestUri: String(row.manifest_uri),
      manifestJson: String(row.manifest_json),
      createdAt: String(row.created_at),
      releaseState: row.release_state as ReleaseState,
      runId: row.run_id ? String(row.run_id) : undefined,
      traceId: row.trace_id ? String(row.trace_id) : undefined,
      gitCommit: row.git_commit ? String(row.git_commit) : undefined,
    }));
  }

  getDatasetSnapshot(snapshotId: string): DatasetSnapshotRecord | undefined {
    const row = this.stmtGetSnapshot.get(snapshotId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      snapshotId: String(row.snapshot_id),
      datasetName: String(row.dataset_name),
      version: String(row.version),
      splitsJson: String(row.splits_json),
      shardCount: Number(row.shard_count),
      totalRecordCount: Number(row.total_record_count),
      totalSizeBytes: Number(row.total_size_bytes),
      totalTokensEstimated: Number(row.total_tokens_estimated),
      manifestUri: String(row.manifest_uri),
      manifestJson: String(row.manifest_json),
      createdAt: String(row.created_at),
      releaseState: row.release_state as ReleaseState,
      runId: row.run_id ? String(row.run_id) : undefined,
      traceId: row.trace_id ? String(row.trace_id) : undefined,
      gitCommit: row.git_commit ? String(row.git_commit) : undefined,
    };
  }

  getLatestDatasetSnapshot(datasetName: string): DatasetSnapshotRecord | undefined {
    const row = this.stmtGetLatestSnapshotByName.get(datasetName) as
      | Record<string, unknown>
      | undefined;
    if (!row) return undefined;
    return {
      snapshotId: String(row.snapshot_id),
      datasetName: String(row.dataset_name),
      version: String(row.version),
      splitsJson: String(row.splits_json),
      shardCount: Number(row.shard_count),
      totalRecordCount: Number(row.total_record_count),
      totalSizeBytes: Number(row.total_size_bytes),
      totalTokensEstimated: Number(row.total_tokens_estimated),
      manifestUri: String(row.manifest_uri),
      manifestJson: String(row.manifest_json),
      createdAt: String(row.created_at),
      releaseState: row.release_state as ReleaseState,
      runId: row.run_id ? String(row.run_id) : undefined,
      traceId: row.trace_id ? String(row.trace_id) : undefined,
      gitCommit: row.git_commit ? String(row.git_commit) : undefined,
    };
  }

  deleteDatasetSnapshot(snapshotId: string): boolean {
    const result = this.stmtDeleteSnapshot.run(snapshotId);
    return Number(result.changes) > 0;
  }

  reserveDatasetPublication(
    datasetName: string,
    version: string,
    snapshotId: string,
    outputDir: string
  ): void {
    try {
      this.db
        .prepare(
          "INSERT INTO dataset_publication_reservations (dataset_name, version, snapshot_id, output_dir) VALUES (?, ?, ?, ?)"
        )
        .run(datasetName, version, snapshotId, outputDir);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE"))
        throw new Error(
          "Dataset version or output directory already exists; use a new immutable namespace."
        );
      throw error;
    }
  }

  recordDocumentProvenance(record: DocumentProvenanceRecord): void {
    this.db
      .prepare(
        `INSERT INTO document_provenance (document_id, canonicalization_version, language, pii_status, split, rights_license, rights_evidence_uri, rights_reviewed_at, rights_allowed_purposes, rights_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.documentId,
        record.canonicalizationVersion,
        record.language,
        record.piiStatus,
        record.split,
        record.rightsLicense ?? null,
        record.rightsEvidenceUri ?? null,
        record.rightsReviewedAt ?? null,
        record.rightsAllowedPurposes ?? null,
        record.rightsStatus,
        record.createdAt
      );
  }

  recordDocumentOccurrence(record: DocumentOccurrenceRecord, runId: string): number {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(runId))
      throw new Error("Invalid runId.");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const inserted = this.db
        .prepare(
          "INSERT INTO document_occurrences (document_id, source_id, source_record_id, source_uri, acquired_at, raw_artifact_id) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(
          record.documentId,
          record.sourceId,
          record.sourceRecordId,
          record.sourceUri,
          record.acquiredAt,
          record.rawArtifactId
        );
      const occurrenceId = Number(inserted.lastInsertRowid);
      this.db
        .prepare("INSERT INTO document_occurrence_runs (occurrence_id, run_id) VALUES (?, ?)")
        .run(occurrenceId, runId);
      this.db.exec("COMMIT");
      return occurrenceId;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getSnapshotManifestHash(snapshotId: string): string | undefined {
    const snapshot = this.getDatasetSnapshot(snapshotId);
    return snapshot ? createHash("sha256").update(snapshot.manifestJson).digest("hex") : undefined;
  }

  getRunLineage(runId: string) {
    const manifests = this.db
      .prepare("SELECT * FROM pipeline_run_manifests WHERE run_id = ?")
      .all(runId);
    const snapshotRows = this.db
      .prepare(
        "SELECT snapshot_id FROM dataset_snapshots WHERE run_id = ? ORDER BY created_at DESC"
      )
      .all(runId);
    const snapshots = snapshotRows.map((row) => this.getDatasetSnapshot(String(row.snapshot_id))!);
    const shards = this.db
      .prepare("SELECT * FROM dataset_shards WHERE pipeline_run_id = ?")
      .all(runId);
    const occurrences = this.db
      .prepare(
        "SELECT o.* FROM document_occurrences o JOIN document_occurrence_runs r ON r.occurrence_id = o.occurrence_id WHERE r.run_id = ?"
      )
      .all(runId);
    const documents = this.db
      .prepare(
        "SELECT DISTINCT p.* FROM document_provenance p JOIN document_occurrences o ON o.document_id = p.document_id JOIN document_occurrence_runs r ON r.occurrence_id = o.occurrence_id WHERE r.run_id = ?"
      )
      .all(runId);
    const sourceEvidence = this.db
      .prepare(
        "SELECT DISTINCT e.* FROM source_verification_evidence e JOIN document_occurrences o ON o.source_id = e.source_id JOIN document_occurrence_runs r ON r.occurrence_id = o.occurrence_id WHERE r.run_id = ?"
      )
      .all(runId);
    return { run_id: runId, manifests, snapshots, shards, occurrences, documents, sourceEvidence };
  }

  getDatasetReleaseGates(snapshotId: string): DatasetReleaseGateRecord | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM dataset_release_gates WHERE snapshot_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .get(snapshotId);
    if (!row) return undefined;
    return {
      gateId: String(row.gate_id),
      snapshotId: String(row.snapshot_id),
      schemaGate: row.schema_gate === 1,
      qualityGate: row.quality_gate === 1,
      privacyGate: row.privacy_gate === 1,
      contaminationGate: row.contamination_gate === 1,
      rightsGate: row.rights_gate === 1,
      releaseState: row.release_state as ReleaseState,
      reviewedBy: row.reviewed_by ? String(row.reviewed_by) : undefined,
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
      createdAt: String(row.created_at),
    };
  }

  releaseDatasetSnapshot(review: ReleaseReview): DatasetSnapshotRecord {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const snapshot = this.getDatasetSnapshot(review.snapshotId);
      if (!snapshot) throw new Error("Snapshot not found.");
      if (snapshot.releaseState !== "candidate")
        throw new Error("Only candidate snapshots can be released.");
      validateReleaseReview(review, snapshot.manifestJson);
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT INTO dataset_release_gates (gate_id, snapshot_id, schema_gate, quality_gate, privacy_gate, contamination_gate, rights_gate, release_state, reviewed_by, reviewed_at, created_at) VALUES (?, ?, 1, 1, 1, 1, 1, 'released', ?, ?, ?)`
        )
        .run(
          `review_${review.snapshotId}`,
          review.snapshotId,
          review.reviewedBy,
          review.reviewedAt,
          now
        );
      this.db
        .prepare(
          "INSERT INTO dataset_release_reviews (snapshot_id, manifest_sha256, evidence_json) VALUES (?, ?, ?)"
        )
        .run(review.snapshotId, review.manifestSha256, JSON.stringify(review.evidence));
      this.db
        .prepare("UPDATE dataset_snapshots SET release_state = 'released' WHERE snapshot_id = ?")
        .run(review.snapshotId);
      this.db.exec("COMMIT");
      return this.getDatasetSnapshot(review.snapshotId)!;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  getDatasetReleaseReview(snapshotId: string): Record<string, unknown> | undefined {
    const row = this.db
      .prepare(
        "SELECT manifest_sha256, evidence_json FROM dataset_release_reviews WHERE snapshot_id = ?"
      )
      .get(snapshotId);
    return row
      ? { manifestSha256: row.manifest_sha256, evidence: JSON.parse(String(row.evidence_json)) }
      : undefined;
  }

  // --- Storage Replicas API ---

  recordStorageReplica(replica: StorageReplicaRecord): void {
    this.stmtInsertReplica.run(
      replica.replicaId,
      replica.shardId,
      replica.storageProvider,
      replica.remoteUri,
      replica.remoteSha256Hash,
      replica.remoteSizeBytes,
      replica.syncStatus,
      replica.verifiedAt || null,
      replica.lastError || null,
      replica.pathTier ?? null
    );
  }

  listStorageReplicas(shardId: string): StorageReplicaRecord[] {
    const rows = this.stmtListReplicasByShard.all(shardId) as Record<string, unknown>[];
    return rows.map((row) => ({
      replicaId: String(row.replica_id),
      shardId: String(row.shard_id),
      storageProvider: String(row.storage_provider),
      remoteUri: String(row.remote_uri),
      remoteSha256Hash: String(row.remote_sha256_hash),
      remoteSizeBytes: Number(row.remote_size_bytes),
      syncStatus: row.sync_status as StorageReplicaRecord["syncStatus"],
      verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
      lastError: row.last_error ? String(row.last_error) : undefined,
      pathTier: row.path_tier ? (row.path_tier as ArtifactPathTier) : undefined,
    }));
  }

  // --- Verification Audit Ledger API ---

  recordVerificationAudit(audit: VerificationAuditRecord): void {
    this.stmtInsertAudit.run(
      audit.auditId,
      audit.shardId,
      audit.runId,
      audit.recordCountMatches ? 1 : 0,
      audit.parquetReadable ? 1 : 0,
      audit.checksumMatches ? 1 : 0,
      audit.verificationPassed ? 1 : 0,
      audit.rawSourcePath,
      audit.rawSourceSha256 || null,
      audit.rawPurged ? 1 : 0,
      audit.purgedAt || null,
      audit.verifierIdentity,
      audit.notes || null,
      audit.createdAt
    );
  }

  listVerificationAudits(runId: string): VerificationAuditRecord[] {
    const rows = this.stmtListAuditByRun.all(runId) as Record<string, unknown>[];
    return rows.map((row) => ({
      auditId: String(row.audit_id),
      shardId: String(row.shard_id),
      runId: String(row.run_id),
      recordCountMatches: Number(row.record_count_matches) === 1,
      parquetReadable: Number(row.parquet_readable) === 1,
      checksumMatches: Number(row.checksum_matches) === 1,
      verificationPassed: Number(row.verification_passed) === 1,
      rawSourcePath: String(row.raw_source_path),
      rawSourceSha256: row.raw_source_sha256 ? String(row.raw_source_sha256) : undefined,
      rawPurged: Number(row.raw_purged) === 1,
      purgedAt: row.purged_at ? String(row.purged_at) : undefined,
      verifierIdentity: String(row.verifier_identity),
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: String(row.created_at),
    }));
  }

  recordOtelLogEvent(input: LogEvent): number {
    const event = MetadataLogEventSchema.parse(input);
    const result = this.stmtInsertOtelLog.run(
      event.timestamp,
      event.observed_timestamp,
      event.event_name,
      event.severity_text,
      event.severity_number,
      event.body,
      event.trace_id,
      event.span_id,
      event.service_name,
      event.service_version,
      event.deployment_env,
      event.blueprint_run_id ?? null,
      event.blueprint_agent_id ?? null,
      event.blueprint_skill_id ?? null,
      event.blueprint_status ?? null,
      event.blueprint_duration_ms ?? null,
      0
    );
    return Number(result.lastInsertRowid);
  }

  listOtelLogEvents(traceId?: string, limit = 100): StoredLogEvent[] {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      throw new Error("Log query limit must be between 1 and 10000.");
    }
    const rows = traceId
      ? this.stmtListOtelLogsByTrace.all(traceId, limit)
      : this.stmtListOtelLogs.all(limit);
    return rows.map((row) => {
      const { event_id, ...fields } = row;
      for (const key of Object.keys(fields)) {
        if (fields[key] === null) {
          delete fields[key];
        }
      }
      const event = MetadataLogEventSchema.parse({
        ...fields,
        schema_version: "log-event.v1",
        content_capture: Boolean(fields.content_capture),
      });
      return { ...event, event_id: Number(event_id) };
    });
  }

  close(): void {
    this.db.close();
  }
}

let defaultDbInstance: RegistryDatabase | null = null;

export function getDefaultRegistryDatabase(): RegistryDatabase {
  if (!defaultDbInstance) {
    defaultDbInstance = new RegistryDatabase();
  }
  return defaultDbInstance;
}

export function resetDefaultRegistryDatabase(): void {
  if (defaultDbInstance) {
    try {
      defaultDbInstance.close();
    } catch {
      // ignore close errors during reset
    }
    defaultDbInstance = null;
  }
}
