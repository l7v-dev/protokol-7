-- Corpus batch state is distinct from daemon monitoring and YAML pipeline executions.
CREATE TABLE IF NOT EXISTS corpus_pipeline_runs (
    run_id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL REFERENCES datasets(dataset_id),
    status TEXT NOT NULL CHECK(status IN ('INITIALIZING','INGESTING','CLEANING','PACKING','VERIFYING','COMPLETED','FAILED')),
    target_storage_provider TEXT NOT NULL,
    total_raw_documents INTEGER NOT NULL DEFAULT 0,
    total_clean_documents INTEGER NOT NULL DEFAULT 0,
    total_rejected_documents INTEGER NOT NULL DEFAULT 0,
    total_uncompressed_bytes INTEGER NOT NULL DEFAULT 0,
    total_compressed_bytes INTEGER NOT NULL DEFAULT 0,
    total_estimated_tokens INTEGER NOT NULL DEFAULT 0,
    total_shards INTEGER NOT NULL DEFAULT 0,
    raw_data_purged INTEGER NOT NULL DEFAULT 0 CHECK(raw_data_purged IN (0,1)),
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error_message TEXT
);
CREATE TABLE IF NOT EXISTS corpus_shard_runs (
    shard_id TEXT PRIMARY KEY REFERENCES dataset_shards(shard_id),
    run_id TEXT NOT NULL REFERENCES corpus_pipeline_runs(run_id),
    shard_index INTEGER NOT NULL,
    blake3_hash TEXT,
    row_group_count INTEGER NOT NULL,
    char_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    estimated_tokens INTEGER NOT NULL,
    compression_level INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corpus_shard_runs_run ON corpus_shard_runs(run_id,shard_index);
