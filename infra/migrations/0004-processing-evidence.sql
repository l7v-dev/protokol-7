-- Persist decontamination reports and artifact receipts across registry reopen.
ALTER TABLE pipeline_executions ADD COLUMN processing_metadata_json TEXT;
