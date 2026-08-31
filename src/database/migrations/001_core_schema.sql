CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (id, status)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
  default_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name),
  UNIQUE (id, tenant_id)
);

CREATE TABLE IF NOT EXISTS targets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  seed_url TEXT NOT NULL,
  host TEXT NOT NULL,
  allowed_hosts JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_ports JSONB NOT NULL DEFAULT '[443]'::jsonb,
  execution_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  crawl_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS schemas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  definition_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'DEPRECATED')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name, version),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  schema_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'DISPATCH_PENDING', 'QUEUED', 'RUNNING', 'EXTRACTING', 'VALIDATING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'RETRYING', 'CANCEL_REQUESTED', 'CANCELLED')),
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('MANUAL', 'SCHEDULED', 'API', 'RETRY')),
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_snapshot_json JSONB NOT NULL,
  schema_snapshot_json JSONB NOT NULL,
  strategy_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  progress_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (id, tenant_id),
  FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id),
  FOREIGN KEY (target_id, tenant_id) REFERENCES targets(id, tenant_id),
  FOREIGN KEY (schema_id, tenant_id) REFERENCES schemas(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  job_id TEXT NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  UNIQUE (job_id, sequence_no),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (job_id, tenant_id) REFERENCES jobs(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  parent_task_id TEXT,
  task_key TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('HTTP_FETCH', 'BROWSER_FETCH', 'CRAWL_DISCOVERY', 'EXTRACT', 'VALIDATE', 'PUBLISH', 'EXPORT')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'BLOCKED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'RETRYABLE_FAILED', 'FAILED', 'TIMEOUT', 'CANCEL_REQUESTED', 'CANCELLED')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dependency_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, task_key),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (job_id, tenant_id) REFERENCES jobs(id, tenant_id),
  FOREIGN KEY (run_id, tenant_id) REFERENCES runs(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  task_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  worker_id TEXT,
  lease_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED', 'WORKER_LOST')),
  strategy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, attempt_no),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (task_id, tenant_id) REFERENCES tasks(id, tenant_id)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED', 'EXPIRED')),
  resource_type TEXT,
  resource_id TEXT,
  response_status INTEGER,
  response_body_ref JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tenant_id, scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  message_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  payload_json JSONB NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  actor_id TEXT,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  request_id TEXT,
  trace_id TEXT,
  result TEXT NOT NULL,
  reason_code TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT,
  job_id TEXT,
  task_id TEXT,
  attempt_id TEXT,
  category TEXT NOT NULL,
  quantity NUMERIC(20, 6) NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  unit_cost NUMERIC(20, 10),
  estimated_cost NUMERIC(20, 10),
  currency TEXT NOT NULL DEFAULT 'USD',
  tariff_id TEXT,
  source TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key, category)
);

CREATE INDEX IF NOT EXISTS idx_projects_tenant_status ON projects (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_targets_tenant_host ON targets (tenant_id, host);
CREATE INDEX IF NOT EXISTS idx_schemas_project_status ON schemas (project_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_created ON jobs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status ON jobs (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_job_status ON tasks (job_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status ON tasks (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_attempts_task_started ON attempts (task_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events (status, available_at);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_logs (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_time ON usage_events (tenant_id, occurred_at DESC);
