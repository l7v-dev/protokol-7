-- Migration 005: Files & Knowledge Upload Schema

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  hash TEXT,
  path TEXT,
  meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_files_tenant_user ON files (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files (tenant_id, hash);
