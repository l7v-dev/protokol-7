-- Migration 006: Prompts and Custom Tools Schema

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_grants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_tenant_command ON prompts (tenant_id, command) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prompts_tenant_user ON prompts (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  specs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  valves_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_grants_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tools_tenant_active ON tools (tenant_id, is_active, deleted_at);
CREATE INDEX IF NOT EXISTS idx_tools_tenant_user ON tools (tenant_id, user_id);
