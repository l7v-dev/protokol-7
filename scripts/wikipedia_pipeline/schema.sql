-- ==============================================================================
-- Wikipedia LLM Pre-training Dataset Management Schema
-- Engine: SQLite / ANSI SQL (Compatible with PostgreSQL / DuckDB)
-- Purpose: Audit trail, provenance tracking, hash integrity & lifecycle sync
-- ==============================================================================

-- 1. Pipeline Runs (Dataset Versioning & Ingestion Batches)
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id TEXT PRIMARY KEY,
    language TEXT NOT NULL DEFAULT 'tr',
    source_dump_url TEXT NOT NULL,
    source_dump_md5 TEXT,
    source_dump_size_bytes INTEGER,
    status TEXT NOT NULL CHECK(status IN ('INITIALIZING', 'PARSING', 'PACKING', 'SYNCING', 'COMPLETED', 'FAILED')),
    total_scanned_pages INTEGER NOT NULL DEFAULT 0,
    total_clean_articles INTEGER NOT NULL DEFAULT 0,
    total_skipped_redirects INTEGER NOT NULL DEFAULT 0,
    total_skipped_short INTEGER NOT NULL DEFAULT 0,
    total_uncompressed_bytes INTEGER NOT NULL DEFAULT 0,
    total_compressed_bytes INTEGER NOT NULL DEFAULT 0,
    total_estimated_tokens INTEGER NOT NULL DEFAULT 0,
    total_parts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT
);

-- 2. Dataset Parts (Shards, Cryptographic Hashes, Drive Sync & Cleanup State)
CREATE TABLE IF NOT EXISTS dataset_parts (
    part_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    part_index INTEGER NOT NULL,
    filename TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    size_bytes INTEGER NOT NULL,
    compression_codec TEXT NOT NULL DEFAULT 'zstd',
    compression_level INTEGER NOT NULL DEFAULT 6,
    local_md5_hash TEXT NOT NULL,
    local_sha256_hash TEXT,
    drive_file_id TEXT,
    drive_folder_id TEXT,
    drive_md5_hash TEXT,
    sync_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(sync_status IN ('PENDING', 'UPLOADING', 'VERIFIED', 'FAILED')),
    sync_attempts INTEGER NOT NULL DEFAULT 0,
    sync_started_at TEXT,
    sync_completed_at TEXT,
    verified_at TEXT,
    local_file_deleted INTEGER NOT NULL DEFAULT 0 CHECK(local_file_deleted IN (0, 1)),
    deleted_at TEXT,
    last_error TEXT,
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id) ON DELETE CASCADE
);

-- 3. Article Provenance Index (Fast lookup of which article resides in which part)
CREATE TABLE IF NOT EXISTS article_provenance_index (
    article_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    part_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    estimated_tokens INTEGER NOT NULL,
    PRIMARY KEY (run_id, article_id),
    FOREIGN KEY (run_id) REFERENCES pipeline_runs(run_id) ON DELETE CASCADE
);

-- Indexes for high-performance querying and verification
CREATE INDEX IF NOT EXISTS idx_parts_run_order ON dataset_parts (run_id, part_index);
CREATE INDEX IF NOT EXISTS idx_parts_sync_status ON dataset_parts (sync_status);
CREATE INDEX IF NOT EXISTS idx_provenance_title ON article_provenance_index (title);
CREATE INDEX IF NOT EXISTS idx_provenance_part ON article_provenance_index (run_id, part_index);
