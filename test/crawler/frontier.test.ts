import { describe, expect, it } from 'vitest';

import { CrawlFrontierError, CrawlFrontierRegistry } from '../../src/crawler/frontier.js';

const createdAt = new Date('2026-08-27T00:00:00.000Z');

function registry(): CrawlFrontierRegistry {
  return new CrawlFrontierRegistry(() => createdAt);
}

function create(registryInstance: CrawlFrontierRegistry, overrides: Partial<{ tenantId: string; projectId: string; jobId: string; partitionCount: number }> = {}) {
  return registryInstance.create({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', partitionCount: 4, ...overrides });
}

describe('CrawlFrontierRegistry', () => {
  it('creates tenant/job-scoped deterministic queue partitions and idempotent exact URL entries', () => {
    const frontier = registry();
    create(frontier);
    const first = frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'https://example.com/catalog?page=1', depth: 0 });
    const duplicate = frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'https://example.com/catalog?page=1', depth: 0 });

    expect(first.status).toBe('QUEUED');
    expect(first.partition).toBeGreaterThanOrEqual(0);
    expect(first.partition).toBeLessThan(4);
    expect(first.queueKey).toBe(`crawl:tenant_1:job_1:p${first.partition}`);
    expect(duplicate).toEqual(first);
    expect(frontier.list({ tenantId: 'tenant_1', jobId: 'job_1' })).toHaveLength(1);

    const semanticDuplicate = frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'https://EXAMPLE.com:443/catalog?page=1#details', depth: 0 });
    expect(semanticDuplicate).toEqual(first);
    expect(frontier.list({ tenantId: 'tenant_1', jobId: 'job_1' })).toHaveLength(1);
  });

  it('preserves parent lineage and enforces claimed-entry worker ownership transitions', () => {
    const frontier = registry();
    create(frontier);
    const root = frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'https://example.com/root', depth: 0 });
    const child = frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'https://example.com/child', depth: 1, parentEntryId: root.entryId });
    const claimed = frontier.claimNext({ tenantId: 'tenant_1', jobId: 'job_1', workerId: 'worker_1', partition: root.partition });

    expect(child.parentEntryId).toBe(root.entryId);
    expect(claimed?.status).toBe('CLAIMED');
    expect(() => frontier.complete({ tenantId: 'tenant_1', jobId: 'job_1', entryId: root.entryId, workerId: 'worker_2', succeeded: true })).toThrow(CrawlFrontierError);
    expect(frontier.complete({ tenantId: 'tenant_1', jobId: 'job_1', entryId: claimed!.entryId, workerId: 'worker_1', succeeded: true }).status).toBe('SUCCEEDED');
  });

  it('rejects invalid URL/scope/parent inputs and does not expose a crawl across tenant scope', () => {
    const frontier = registry();
    create(frontier);
    expect(() => frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'https://user:password@example.com/private', depth: 0 })).toThrow(CrawlFrontierError);
    expect(() => frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'http://127.0.0.1:8080/private', depth: 0 })).toThrow(CrawlFrontierError);
    expect(() => frontier.enqueue({ tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', url: 'https://example.com/child', depth: 1, parentEntryId: 'frontier_missing' })).toThrow(CrawlFrontierError);
    expect(() => frontier.list({ tenantId: 'tenant_2', jobId: 'job_1' })).toThrow(CrawlFrontierError);
  });
});
