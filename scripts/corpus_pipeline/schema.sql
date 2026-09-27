-- ==============================================================================
-- Protokol-7 Unified Control Plane Database Schema
-- Engine: SQLite 3 / ANSI SQL (Compatible with PostgreSQL / DuckDB)
-- Purpose: Unified persistence for Actor Runs, Pipeline Executions, Datasets,
--          Shards, Storage Replicas, and Cryptographic Verification Audit Ledger.
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- 1. Datasets Catalog (High-level dataset metadata & license partitioning)
CREATE TABLE IF NOT EXISTS datasets (
    dataset_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_platform TEXT NOT NULL,
    license_group TEXT NOT NULL CHECK(license_group IN ('permissive_commercial', 'non_commercial_research', 'public_domain', 'restricted')),
    default_language TEXT NOT NULL DEFAULT 'und',
    description TEXT,
    created_at TEXT NOT NULL
);

-- 2. Actor Runs (Individual actor task executions via REST / MCP)
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

-- 3. Actor Run Logs (Structured streaming logs per run)
CREATE TABLE IF NOT EXISTS actor_run_logs (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES actor_runs(run_id) ON DELETE CASCADE,
    timestamp TEXT NOT NULL,
    level TEXT NOT NULL CHECK(level IN ('INFO', 'WARN', 'ERROR', 'PASS', 'VETO')),
    message TEXT NOT NULL
);

-- 4. Pipeline Executions (YAML workflow execution history)
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

-- 5. Pipeline Runs (Corpus ingestion & ETL lifecycle batches)
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('INITIALIZING', 'INGESTING', 'CLEANING', 'PACKING', 'VERIFYING', 'COMPLETED', 'FAILED')),
    target_storage_provider TEXT NOT NULL,
    total_raw_documents INTEGER NOT NULL DEFAULT 0,
    total_clean_documents INTEGER NOT NULL DEFAULT 0,
    total_rejected_documents INTEGER NOT NULL DEFAULT 0,
    total_uncompressed_bytes INTEGER NOT NULL DEFAULT 0,
    total_compressed_bytes INTEGER NOT NULL DEFAULT 0,
    total_estimated_tokens INTEGER NOT NULL DEFAULT 0,
    total_shards INTEGER NOT NULL DEFAULT 0,
    raw_data_purged INTEGER NOT NULL DEFAULT 0 CHECK(raw_data_purged IN (0, 1)),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT,
    FOREIGN KEY (dataset_id) REFERENCES datasets(dataset_id) ON DELETE RESTRICT
);

-- 6. Dataset Shards (Individual 512MB-1GB Parquet pieces with cryptographic hashes)
CREATE TABLE IF NOT EXISTS dataset_shards (
    shard_id TEXT PRIMARY KEY,
    run_id TEXT,
    shard_index INTEGER NOT NULL DEFAULT 0,
    dataset_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    storage_uri TEXT,
    storage_backend TEXT,
    record_count INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    compression_codec TEXT NOT NULL DEFAULT 'zstd',
    compression_level INTEGER NOT NULL DEFAULT 6,
    sha256_hash TEXT NOT NULL,
    blake3_hash TEXT,
    row_group_count INTEGER NOT NULL DEFAULT 1,
    char_count INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER NOT NULL DEFAULT 0,
    estimated_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id) ON DELETE SET NULL
);

-- 7. Storage Replicas (Tracks where shards reside across Cold Vault, R2, S3, Drive)
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

-- 8. Verification Audit Ledger (Cryptographic gatekeeper before raw data purge)
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
    FOREIGN KEY (shard_id) REFERENCES dataset_shards(shard_id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id) ON DELETE CASCADE
);

-- 9. Scheduled Jobs (Cron job scheduler state)
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    job_id TEXT PRIMARY KEY,
    cron_expression TEXT NOT NULL,
    running INTEGER NOT NULL DEFAULT 1 CHECK(running IN (0, 1)),
    last_run_at TEXT,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_actor_runs_status ON actor_runs(status);
CREATE INDEX IF NOT EXISTS idx_actor_runs_actor ON actor_runs(actor_name);
CREATE INDEX IF NOT EXISTS idx_actor_run_logs_run_id ON actor_run_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_shards_dataset ON dataset_shards(dataset_name);
CREATE INDEX IF NOT EXISTS idx_shards_run ON dataset_shards(run_id, shard_index);
CREATE INDEX IF NOT EXISTS idx_replicas_shard ON storage_replicas(shard_id);
CREATE INDEX IF NOT EXISTS idx_replicas_status ON storage_replicas(sync_status);
CREATE INDEX IF NOT EXISTS idx_audit_shard ON verification_audit_ledger(shard_id);
CREATE INDEX IF NOT EXISTS idx_audit_run ON verification_audit_ledger(run_id);
