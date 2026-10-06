-- Actual source bytes and their durable locations; cleaned output is never raw evidence.
CREATE TABLE IF NOT EXISTS raw_artifacts (
  raw_artifact_id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS raw_artifact_locations (
  raw_artifact_id TEXT NOT NULL REFERENCES raw_artifacts(raw_artifact_id),
  uri TEXT NOT NULL,
  PRIMARY KEY(raw_artifact_id, uri)
);
CREATE TABLE IF NOT EXISTS producer_occurrence_receipts (
  receipt_id TEXT PRIMARY KEY,
  occurrence_id INTEGER NOT NULL REFERENCES document_occurrences(occurrence_id),
  run_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS raw_artifact_acquisitions (
  receipt_id TEXT PRIMARY KEY,
  raw_artifact_id TEXT NOT NULL REFERENCES raw_artifacts(raw_artifact_id),
  source_id TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES pipeline_run_manifests(run_id)
);
