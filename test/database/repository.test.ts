import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database/client.js';
import { JobRepository } from '../../src/database/repositories/job-repository.js';
import { ProjectRepository } from '../../src/database/repositories/project-repository.js';
import { SchemaRepository } from '../../src/database/repositories/schema-repository.js';
import { TargetRepository } from '../../src/database/repositories/target-repository.js';
import { TaskRepository } from '../../src/database/repositories/task-repository.js';

describe('database foundation', () => {
  it('contains the core tenant-scoped tables and constraints', async () => {
    const migration = await readFile(
      resolve(process.cwd(), 'src/database/migrations/001_core_schema.sql'),
      'utf8'
    );

    for (const table of [
      'tenants',
      'projects',
      'targets',
      'schemas',
      'jobs',
      'runs',
      'tasks',
      'attempts',
      'idempotency_keys',
      'outbox_events',
      'audit_logs',
      'usage_events'
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }

    expect(migration).toContain('FOREIGN KEY (project_id, tenant_id) REFERENCES projects(id, tenant_id)');
    expect(migration).toContain('UNIQUE (tenant_id, idempotency_key, category)');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS idx_outbox_pending');
  });

  it('keeps project reads tenant-scoped and parameterized', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: 'project_1',
        tenant_id: 'tenant_1',
        name: 'Project One',
        description: null,
        status: 'ACTIVE',
        default_policy_json: {},
        created_by: 'actor_1',
        created_at: new Date('2026-08-26T00:00:00.000Z'),
        updated_at: new Date('2026-08-26T00:00:00.000Z')
      }]
    });
    const repository = new ProjectRepository({ query } as unknown as Database);

    const project = await repository.findById('tenant_1', 'project_1');

    expect(project).toMatchObject({ id: 'project_1', tenantId: 'tenant_1' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id = $1 AND id = $2'), [
      'tenant_1',
      'project_1'
    ]);
  });

  it('bounds tenant project list limits', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new ProjectRepository({ query } as unknown as Database);

    await repository.listByTenant('tenant_1', 10_000);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2'), ['tenant_1', 200]);
  });

  it('keeps target reads scoped to tenant and target id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new TargetRepository({ query } as unknown as Database);

    await repository.findById('tenant_2', 'target_2');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id = $1 AND id = $2'), [
      'tenant_2',
      'target_2'
    ]);
  });

  it('keeps schema reads scoped to tenant and schema id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new SchemaRepository({ query } as unknown as Database);

    await repository.findById('tenant_3', 'schema_3');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id = $1 AND id = $2'), [
      'tenant_3',
      'schema_3'
    ]);
  });

  it('keeps job reads scoped to tenant and job id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const repository = new JobRepository({ query } as unknown as Database);

    await repository.findById('tenant_4', 'job_4');

    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE tenant_id = $1 AND id = $2'), [
      'tenant_4',
      'job_4'
    ]);
  });

  it('ignores a task result when the attempt is not owned by the task', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const withTransaction = vi.fn(async (work: (client: { query: typeof query }) => Promise<unknown>) => work({ query }));
    const repository = new TaskRepository({ withTransaction } as unknown as Database);

    const result = await repository.markSucceeded('tenant_5', 'task_5', 'attempt_other', { checksum: 'x' });

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('AND task_id = $3'), [
      'tenant_5',
      'attempt_other',
      'task_5'
    ]);
  });
});
