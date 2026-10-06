-- Dedicated daemon monitoring catalogs also apply this nullable column on open.
ALTER TABLE pipeline_runs ADD COLUMN retry_config JSON DEFAULT NULL;
