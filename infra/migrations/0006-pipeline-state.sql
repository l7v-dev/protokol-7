ALTER TABLE pipeline_runs ADD COLUMN state_type TEXT DEFAULT NULL CHECK(state_type IN ('partial','completed'));
ALTER TABLE pipeline_runs ADD COLUMN state_payload JSON DEFAULT NULL;
ALTER TABLE pipeline_runs ADD COLUMN cursor_version INTEGER NOT NULL DEFAULT 0 CHECK(cursor_version >= 0);

-- Stable stream identity survives a new UUID run and fences competing producers.
CREATE TABLE IF NOT EXISTS pipeline_states (
    stream_id TEXT PRIMARY KEY,
    owner_run_id TEXT NOT NULL REFERENCES pipeline_runs(run_id),
    state_type TEXT NOT NULL CHECK(state_type IN ('partial','completed')),
    state_payload JSON NOT NULL,
    cursor_version INTEGER NOT NULL CHECK(cursor_version >= 1),
    updated_at TEXT NOT NULL
);
