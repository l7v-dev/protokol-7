-- Blueprint provenance, release gates and local OTel logs.
-- Registry applies missing ALTER columns within one transaction; raw SQL is one-shot.
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
ALTER TABLE actor_runs     ADD COLUMN trace_id TEXT;
ALTER TABLE actor_runs     ADD COLUMN span_id  TEXT;
ALTER TABLE dataset_snapshots ADD COLUMN release_state TEXT NOT NULL DEFAULT 'candidate' CHECK(release_state IN ('candidate','released','withdrawn'));
ALTER TABLE dataset_snapshots ADD COLUMN run_id TEXT;
ALTER TABLE dataset_snapshots ADD COLUMN trace_id TEXT;
ALTER TABLE dataset_snapshots ADD COLUMN git_commit TEXT;
ALTER TABLE dataset_shards    ADD COLUMN pii_status TEXT NOT NULL DEFAULT 'unchecked' CHECK(pii_status IN ('unchecked','clear','redacted','quarantined'));
ALTER TABLE dataset_shards    ADD COLUMN rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('approved','unknown','blocked'));

-- Yeni index'ler
CREATE INDEX IF NOT EXISTS idx_doc_prov_lang ON document_provenance(language);
CREATE INDEX IF NOT EXISTS idx_doc_prov_pii  ON document_provenance(pii_status);
CREATE INDEX IF NOT EXISTS idx_doc_occ_source ON document_occurrences(source_id);
CREATE INDEX IF NOT EXISTS idx_otel_trace    ON otel_log_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_otel_sev      ON otel_log_events(severity_text);
CREATE INDEX IF NOT EXISTS idx_gates_snap    ON dataset_release_gates(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_manifests_run ON pipeline_run_manifests(run_id);
ALTER TABLE storage_replicas ADD COLUMN path_tier TEXT
    CHECK(path_tier IN ('raw','staging','parsed','normalized','curated','quarantine','datasets'));
CREATE INDEX IF NOT EXISTS idx_doc_occ_document ON document_occurrences(document_id);
CREATE INDEX IF NOT EXISTS idx_source_evidence_source ON source_verification_evidence(source_id);
