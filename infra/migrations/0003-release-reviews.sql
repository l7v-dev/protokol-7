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
