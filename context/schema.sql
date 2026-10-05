-- ==============================================================================
-- Protokol-7 Unified Control Plane Database Schema
-- Engine: SQLite 3 / ANSI SQL (Compatible with PostgreSQL / DuckDB)
-- Purpose: Unified persistence for Actor Runs, Event Logs, Pipeline Executions,
--          Scheduled Jobs, Datasets, Shards, Storage Replicas, Snapshots, and Audit Ledger.
-- Base schema: src/api/registry-database.ts
-- Blueprint extension: infra/migrations/0002-blueprint-provenance.sql
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
    finished_at TEXT,
    trace_id TEXT,
    span_id TEXT
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
    completed_at TEXT NOT NULL,
    processing_metadata_json TEXT
);

-- 5. Scheduled Jobs (Cron job scheduler state & execution recovery)
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

-- 6. Dataset Shards (Individual Parquet pieces with cryptographic hashes)
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
    created_at TEXT NOT NULL,
    pii_status TEXT NOT NULL DEFAULT 'unchecked' CHECK(pii_status IN ('unchecked','clear','redacted','quarantined')),
    rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('approved','unknown','blocked'))
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
    path_tier TEXT
    CHECK(path_tier IN ('raw','staging','parsed','normalized','curated','quarantine','datasets')),
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
    FOREIGN KEY (shard_id) REFERENCES dataset_shards(shard_id) ON DELETE CASCADE
);

-- 9. Dataset Snapshots & Training Manifests (Versioned dataset manifests)
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
    created_at TEXT NOT NULL,
    release_state TEXT NOT NULL DEFAULT 'candidate' CHECK(release_state IN ('candidate','released','withdrawn')),
    run_id TEXT,
    trace_id TEXT,
    git_commit TEXT
);

-- Indexes for performance
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

-- Blueprint additions; authoritative migration: infra/migrations/0002-blueprint-provenance.sql
-- Tablo 10: Pipeline Run Manifests (Blueprint manifest.v1 uyumlu)
CREATE TABLE IF NOT EXISTS pipeline_run_manifests (
    manifest_id     TEXT PRIMARY KEY,
    run_id          TEXT NOT NULL UNIQUE,
    parent_run_id   TEXT,
    trace_id        TEXT NOT NULL,
    pipeline        TEXT NOT NULL,
    started_at      TEXT NOT NULL,
    finished_at     TEXT,
    status          TEXT NOT NULL CHECK(status IN ('success','partial','failed','aborted')),
    agent_id        TEXT NOT NULL,
    agent_version   TEXT NOT NULL,
    skill_id        TEXT,
    skill_version   TEXT,
    skill_sha256    TEXT,
    git_commit      TEXT,
    dependency_lock_sha256 TEXT,
    config_sha256   TEXT NOT NULL,
    counts_json     TEXT NOT NULL DEFAULT '{}',
    quality_json    TEXT NOT NULL DEFAULT '{}',
    checkpoint_committed INTEGER NOT NULL DEFAULT 0 CHECK(checkpoint_committed IN (0,1)),
    errors_json     TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL
);

-- Tablo 11: Document Provenance (per-record, document.v1 uyumlu)
CREATE TABLE IF NOT EXISTS document_provenance (
    document_id             TEXT PRIMARY KEY,
    canonicalization_version TEXT NOT NULL,
    language                TEXT NOT NULL,
    pii_status              TEXT NOT NULL DEFAULT 'unchecked'
        CHECK(pii_status IN ('unchecked','clear','redacted','quarantined')),
    split                   TEXT NOT NULL DEFAULT 'unassigned'
        CHECK(split IN ('train','validation','test','unassigned')),
    rights_license          TEXT,
    rights_evidence_uri     TEXT,
    rights_reviewed_at      TEXT,
    rights_allowed_purposes TEXT,
    rights_status           TEXT NOT NULL DEFAULT 'unknown'
        CHECK(rights_status IN ('approved','unknown','blocked')),
    created_at              TEXT NOT NULL
);

-- Tablo 12: Document Occurrences (çok-kaynaklu provenance)
CREATE TABLE IF NOT EXISTS document_occurrences (
    occurrence_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id      TEXT NOT NULL
        REFERENCES document_provenance(document_id) ON DELETE CASCADE,
    source_id        TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    source_uri       TEXT NOT NULL,
    acquired_at      TEXT NOT NULL,
    raw_artifact_id  TEXT NOT NULL
);

-- Tablo 13: Dataset Release Gates
CREATE TABLE IF NOT EXISTS dataset_release_gates (
    gate_id           TEXT PRIMARY KEY,
    snapshot_id       TEXT NOT NULL
        REFERENCES dataset_snapshots(snapshot_id) ON DELETE CASCADE,
    schema_gate       INTEGER NOT NULL DEFAULT 0 CHECK(schema_gate IN (0,1)),
    quality_gate      INTEGER NOT NULL DEFAULT 0 CHECK(quality_gate IN (0,1)),
    privacy_gate      INTEGER NOT NULL DEFAULT 0 CHECK(privacy_gate IN (0,1)),
    contamination_gate INTEGER NOT NULL DEFAULT 0 CHECK(contamination_gate IN (0,1)),
    rights_gate       INTEGER NOT NULL DEFAULT 0 CHECK(rights_gate IN (0,1)),
    release_state     TEXT NOT NULL DEFAULT 'candidate'
        CHECK(release_state IN ('candidate','released','withdrawn')),
    reviewed_by       TEXT,
    reviewed_at       TEXT,
    created_at        TEXT NOT NULL,
    CHECK(release_state != 'released' OR
        (schema_gate = 1 AND quality_gate = 1 AND privacy_gate = 1
         AND contamination_gate = 1 AND rights_gate = 1
         AND reviewed_by IS NOT NULL AND length(reviewed_by) > 0
         AND reviewed_at IS NOT NULL))
);

-- Tablo 14: OTel Structured Log Events (log-event.v1 uyumlu)
CREATE TABLE IF NOT EXISTS otel_log_events (
    event_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp        TEXT NOT NULL,
    observed_timestamp TEXT NOT NULL,
    event_name       TEXT NOT NULL,
    severity_text    TEXT NOT NULL CHECK(severity_text IN ('DEBUG','INFO','WARN','ERROR')),
    severity_number  INTEGER NOT NULL CHECK(severity_number IN (5,9,13,17)),
    body             TEXT NOT NULL CHECK(body = event_name),
    trace_id         TEXT NOT NULL,
    span_id          TEXT NOT NULL,
    service_name     TEXT NOT NULL,
    service_version  TEXT NOT NULL,
    deployment_env   TEXT NOT NULL DEFAULT 'development',
    blueprint_run_id    TEXT,
    blueprint_agent_id  TEXT,
    blueprint_skill_id  TEXT,
    blueprint_status    TEXT,
    blueprint_duration_ms INTEGER CHECK(blueprint_duration_ms >= 0),
    content_capture INTEGER NOT NULL DEFAULT 0 CHECK(content_capture = 0),
    CHECK((severity_text = 'DEBUG' AND severity_number = 5) OR
          (severity_text = 'INFO' AND severity_number = 9) OR
          (severity_text = 'WARN' AND severity_number = 13) OR
          (severity_text = 'ERROR' AND severity_number = 17))
);

-- Tablo 15: Source Verification Evidence
CREATE TABLE IF NOT EXISTS source_verification_evidence (
    evidence_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id          TEXT NOT NULL,
    verification_level TEXT NOT NULL DEFAULT 'not_checked'
        CHECK(verification_level IN
              ('not_checked','index_evidence','page_fetched',
               'docs_inspected','sample_tested','downloaded')),
    uri                TEXT NOT NULL,
    checked_at         TEXT NOT NULL,
    finding            TEXT NOT NULL
);

-- Mevcut tablolara yeni kolonlar









-- Yeni index'ler
CREATE INDEX IF NOT EXISTS idx_doc_prov_lang ON document_provenance(language);
CREATE INDEX IF NOT EXISTS idx_doc_prov_pii  ON document_provenance(pii_status);
CREATE INDEX IF NOT EXISTS idx_doc_occ_source ON document_occurrences(source_id);
CREATE INDEX IF NOT EXISTS idx_otel_trace    ON otel_log_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_otel_sev      ON otel_log_events(severity_text);
CREATE INDEX IF NOT EXISTS idx_gates_snap    ON dataset_release_gates(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_manifests_run ON pipeline_run_manifests(run_id);

CREATE INDEX IF NOT EXISTS idx_doc_occ_document ON document_occurrences(document_id);
CREATE INDEX IF NOT EXISTS idx_source_evidence_source ON source_verification_evidence(source_id);

-- Evidence is bound to the immutable candidate manifest, not the latest dataset name.
CREATE TABLE IF NOT EXISTS dataset_release_reviews (
  snapshot_id TEXT PRIMARY KEY REFERENCES dataset_snapshots(snapshot_id) ON DELETE CASCADE,
  manifest_sha256 TEXT NOT NULL,
  evidence_json TEXT NOT NULL
);
-- Reservations precede artifact writes; failed attempts retain their namespace.
CREATE TABLE IF NOT EXISTS dataset_publication_reservations (
  dataset_name TEXT NOT NULL,
  version TEXT NOT NULL,
  snapshot_id TEXT NOT NULL UNIQUE,
  output_dir TEXT UNIQUE,
  PRIMARY KEY (dataset_name, version)
);
INSERT OR IGNORE INTO dataset_publication_reservations (dataset_name, version, snapshot_id)
  SELECT dataset_name, version, MIN(snapshot_id) FROM dataset_snapshots GROUP BY dataset_name, version;

CREATE TABLE IF NOT EXISTS document_occurrence_runs (
  occurrence_id INTEGER PRIMARY KEY REFERENCES document_occurrences(occurrence_id) ON DELETE CASCADE,
  run_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_occurrence_runs_run ON document_occurrence_runs(run_id);
