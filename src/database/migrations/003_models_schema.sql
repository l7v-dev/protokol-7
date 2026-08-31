-- Migration 003: Model Management & AI Agent Registry

CREATE TABLE IF NOT EXISTS models (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  base_model_id TEXT,
  name TEXT NOT NULL,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_control_json JSONB NOT NULL DEFAULT '{"read": {"group_ids": [], "user_ids": []}, "write": {"group_ids": [], "user_ids": []}}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_models_tenant_active ON models (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_models_tenant_user ON models (tenant_id, user_id);
