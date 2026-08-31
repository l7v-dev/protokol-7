import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../src/database/client.js';
import type { ProjectRecord } from '../../src/database/repositories/project-repository.js';
import type { SchemaRecord } from '../../src/database/repositories/schema-repository.js';
import type { TargetRecord } from '../../src/database/repositories/target-repository.js';
import { JobService } from '../../src/services/job-service.js';
import type { JobResourceNotReadyError } from '../../src/services/job-service.js';
import type { ResourceService } from '../../src/services/resource-service.js';

const project: ProjectRecord = {
  id: 'project_1',
  tenantId: 'tenant_1',
  name: 'Project One',
  description: null,
  status: 'ACTIVE',
  defaultPolicy: {},
  createdBy: 'actor_1',
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  updatedAt: new Date('2026-08-26T00:00:00.000Z')
};

const target = (status: TargetRecord['status']): TargetRecord => ({
  id: 'target_1',
  tenantId: 'tenant_1',
  projectId: 'project_1',
  name: 'Target One',
  seedUrl: 'https://example.com',
  host: 'example.com',
  allowedHosts: ['example.com'],
  allowedPorts: [443],
  executionPolicy: {},
  crawlPolicy: {},
  accessPolicy: {},
  status,
  createdAt: new Date('2026-08-26T00:00:00.000Z'),
  updatedAt: new Date('2026-08-26T00:00:00.000Z')
});

const schema = (status: SchemaRecord['status']): SchemaRecord => ({
  id: 'schema_1',
  tenantId: 'tenant_1',
  projectId: 'project_1',
  name: 'Schema One',
  version: 1,
  definition: { fields: [] },
  status,
  createdBy: 'actor_1',
  createdAt: new Date('2026-08-26T00:00:00.000Z')
});

function command() {
  return {
    tenantId: 'tenant_1',
    projectId: 'project_1',
    targetId: 'target_1',
    schemaId: 'schema_1',
    triggerType: 'API' as const,
    input: {},
    createdBy: 'actor_1',
    idempotencyKey: 'idem_1',
    correlationId: 'corr_1'
  };
}

describe('JobService create readiness guards', () => {
  it('rejects a non-active target before repository persistence', async () => {
    const resources = {
      getProject: vi.fn().mockResolvedValue(project),
      getTarget: vi.fn().mockResolvedValue(target('PAUSED')),
      getSchema: vi.fn().mockResolvedValue(schema('PUBLISHED'))
    } as unknown as ResourceService;
    const database = { query: vi.fn() } as unknown as Database;
    const service = new JobService(database, resources);

    await expect(service.create(command())).rejects.toMatchObject<JobResourceNotReadyError>({
      resource: 'target',
      requiredStatus: 'ACTIVE',
      actualStatus: 'PAUSED'
    });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('rejects a draft schema before repository persistence', async () => {
    const resources = {
      getProject: vi.fn().mockResolvedValue(project),
      getTarget: vi.fn().mockResolvedValue(target('ACTIVE')),
      getSchema: vi.fn().mockResolvedValue(schema('DRAFT'))
    } as unknown as ResourceService;
    const database = { query: vi.fn() } as unknown as Database;
    const service = new JobService(database, resources);

    await expect(service.create(command())).rejects.toMatchObject<JobResourceNotReadyError>({
      resource: 'schema',
      requiredStatus: 'PUBLISHED',
      actualStatus: 'DRAFT'
    });
    expect(database.query).not.toHaveBeenCalled();
  });

  it('passes the authenticated tenant to every resource lookup', async () => {
    const resources = {
      getProject: vi.fn().mockResolvedValue(null),
      getTarget: vi.fn(),
      getSchema: vi.fn()
    } as unknown as ResourceService;
    const service = new JobService({ query: vi.fn() } as unknown as Database, resources);

    await expect(service.create(command())).rejects.toMatchObject({ name: 'JobResourceNotFoundError' });
    expect(resources.getProject).toHaveBeenCalledWith('tenant_1', 'project_1');
    expect(resources.getTarget).not.toHaveBeenCalled();
    expect(resources.getSchema).not.toHaveBeenCalled();
  });
});
