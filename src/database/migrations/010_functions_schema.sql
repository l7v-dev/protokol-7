-- 010_functions_schema.sql
-- Enterprise agent filter pipelines and function valves with multi-tenancy

CREATE TABLE IF NOT EXISTS functions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL DEFAULT 'pipe',
  content TEXT NOT NULL DEFAULT '',
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  valves_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_functions_tenant_user ON functions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_functions_type ON functions(type);
