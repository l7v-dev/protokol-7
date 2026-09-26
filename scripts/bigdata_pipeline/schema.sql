-- ==============================================================================
-- Enterprise Big Data LLM Dataset Management & Verification Ledger Schema
-- Engine: SQLite / ANSI SQL (Compatible with PostgreSQL / DuckDB)
-- Purpose: Datasets catalog, shard tracking, storage replica inventory,
--          and cryptographic verification audit ledger for zero-raw purge.
-- ==============================================================================

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

-- 2. Pipeline Runs (Ingestion & ETL lifecycle batches)
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

-- 3. Dataset Shards (Individual 512MB-1GB Parquet pieces with cryptographic hashes)
CREATE TABLE IF NOT EXISTS dataset_shards (
    shard_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    shard_index INTEGER NOT NULL,
    filename TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    compression_codec TEXT NOT NULL DEFAULT 'zstd',
    compression_level INTEGER NOT NULL DEFAULT 6,
    sha256_hash TEXT NOT NULL,
    blake3_hash TEXT,
    row_group_count INTEGER NOT NULL DEFAULT 1,
    char_count INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER NOT NULL DEFAULT 0,
    estimated_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id) ON DELETE CASCADE
);

-- 4. Storage Replicas (Tracks where shards reside across Cold Vault, R2, S3, etc.)
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

-- 5. Verification Audit Ledger (Cryptographic gatekeeper before raw data purge)
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_shards_run ON dataset_shards (run_id, shard_index);
CREATE INDEX IF NOT EXISTS idx_replicas_shard ON storage_replicas (shard_id);
CREATE INDEX IF NOT EXISTS idx_replicas_status ON storage_replicas (sync_status);
CREATE INDEX IF NOT EXISTS idx_audit_shard ON verification_audit_ledger (shard_id);
CREATE INDEX IF NOT EXISTS idx_audit_run ON verification_audit_ledger (run_id);
