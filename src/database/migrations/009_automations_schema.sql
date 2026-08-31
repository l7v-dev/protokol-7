-- 009_automations_schema.sql
-- Enterprise scheduled scraping automations and run executions with multi-tenancy

CREATE TABLE IF NOT EXISTS automations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folder_id VARCHAR(64) REFERENCES folders(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automations_tenant_user ON automations(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_automations_folder ON automations(folder_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id VARCHAR(64) PRIMARY KEY,
  automation_id VARCHAR(64) NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  chat_id VARCHAR(64) REFERENCES chats(id) ON DELETE SET NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'completed',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id, created_at DESC);
