-- NULL heartbeat preserves legacy runs until producers explicitly opt in.
ALTER TABLE pipeline_runs ADD COLUMN last_heartbeat_at DATETIME DEFAULT NULL;
ALTER TABLE pipeline_runs ADD COLUMN heartbeat_interval_seconds INTEGER DEFAULT 60 CHECK (heartbeat_interval_seconds > 0);
