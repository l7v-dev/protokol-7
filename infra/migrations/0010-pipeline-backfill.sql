-- Dedicated daemon monitoring catalog only; not a source/central catalog migration.
ALTER TABLE pipeline_runs ADD COLUMN backfill_start TEXT DEFAULT NULL;
ALTER TABLE pipeline_runs ADD COLUMN backfill_end TEXT DEFAULT NULL;
ALTER TABLE pipeline_runs ADD COLUMN backfill_current TEXT DEFAULT NULL;
