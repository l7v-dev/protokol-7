import { describe, expect, it } from 'vitest';

import { CrawlCheckpointError, CrawlCheckpointRegistry } from '../../src/crawler/checkpoint.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1' };
const registry = () => new CrawlCheckpointRegistry(() => new Date('2026-08-27T00:00:00.000Z'));

describe('CrawlCheckpointRegistry', () => {
  it('pauses and resumes without duplicating committed entries while returning claimed work to pending', () => {
    const checkpoints = registry();
    checkpoints.initialize(scope, ['entry_1', 'entry_2']);
    const claim = checkpoints.claim(scope, 'worker_1');
    const paused = checkpoints.pause(scope);
    const resumed = checkpoints.resume(scope);

    expect(claim).toMatchObject({ entryId: 'entry_1', status: 'CLAIMED', claimOwner: 'worker_1' });
    expect(paused).toMatchObject({ status: 'PAUSED', revision: 3 });
    expect(resumed).toMatchObject({ status: 'ACTIVE', revision: 4 });
    expect(resumed.entries).toEqual([{ entryId: 'entry_1', status: 'PENDING' }, { entryId: 'entry_2', status: 'PENDING' }]);
  });

  it('enforces claim ownership and completes only once every unique entry is committed', () => {
    const checkpoints = registry();
    checkpoints.initialize(scope, ['entry_1', 'entry_2']);
    const first = checkpoints.claim(scope, 'worker_1')!;
    expect(() => checkpoints.commit(scope, first.entryId, 'worker_2')).toThrow(CrawlCheckpointError);
    expect(checkpoints.commit(scope, first.entryId, 'worker_1')).toMatchObject({ status: 'ACTIVE' });
    const second = checkpoints.claim(scope, 'worker_2')!;
    const completed = checkpoints.commit(scope, second.entryId, 'worker_2');

    expect(completed).toMatchObject({ status: 'COMPLETED' });
    expect(completed.entries.map((entry) => entry.status)).toEqual(['COMMITTED', 'COMMITTED']);
    expect(checkpoints.claim(scope, 'worker_3')).toBeUndefined();
  });

  it('rejects malformed, cross-tenant and non-idempotent checkpoint operations', () => {
    const checkpoints = registry();
    expect(() => checkpoints.initialize(scope, ['entry_1', 'entry_1'])).toThrow(CrawlCheckpointError);
    checkpoints.initialize(scope, ['entry_1']);
    expect(() => checkpoints.initialize(scope, ['entry_2'])).toThrow(CrawlCheckpointError);
    expect(() => checkpoints.get({ tenantId: 'tenant_2', jobId: 'job_1' })).toThrow(CrawlCheckpointError);
    expect(() => checkpoints.resume(scope)).toThrow(CrawlCheckpointError);
  });
});
