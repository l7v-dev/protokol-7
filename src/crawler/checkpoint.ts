export type CrawlCheckpointStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type CheckpointEntryStatus = 'PENDING' | 'CLAIMED' | 'COMMITTED';

export type CrawlCheckpointScope = {
  tenantId: string;
  jobId: string;
};

export type CrawlCheckpointEntry = {
  entryId: string;
  status: CheckpointEntryStatus;
  claimOwner?: string;
  committedAt?: string;
};

export type CrawlCheckpoint = {
  scope: CrawlCheckpointScope;
  status: CrawlCheckpointStatus;
  revision: number;
  entries: ReadonlyArray<CrawlCheckpointEntry>;
  updatedAt: string;
};

export class CrawlCheckpointError extends Error {
  public constructor(public readonly code: 'CRAWL_CHECKPOINT_INVALID' | 'CRAWL_CHECKPOINT_NOT_FOUND' | 'CRAWL_CHECKPOINT_CONFLICT', message: string) {
    super(message);
    this.name = 'CrawlCheckpointError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_ENTRIES = 10_000;

/**
 * A process-local checkpoint reference. It models pause/resume and recovery
 * transitions only; it is not durable storage or a distributed lease service.
 */
export class CrawlCheckpointRegistry {
  private readonly checkpoints = new Map<string, CrawlCheckpoint>();

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public initialize(scope: CrawlCheckpointScope, entryIds: ReadonlyArray<string>): CrawlCheckpoint {
    validateScope(scope);
    if (entryIds.length > MAX_ENTRIES || entryIds.length === 0 || entryIds.some((entryId) => !SAFE_ID.test(entryId)) || new Set(entryIds).size !== entryIds.length) {
      throw new CrawlCheckpointError('CRAWL_CHECKPOINT_INVALID', 'Checkpoint entry listesi geçerli değil.');
    }
    const key = checkpointKey(scope);
    const existing = this.checkpoints.get(key);
    if (existing) {
      if (existing.entries.map((entry) => entry.entryId).join(':') !== entryIds.join(':')) {
        throw new CrawlCheckpointError('CRAWL_CHECKPOINT_CONFLICT', 'Mevcut checkpoint farklı frontier entry listesiyle yeniden başlatılamaz.');
      }
      return cloneCheckpoint(existing);
    }
    const checkpoint: CrawlCheckpoint = {
      scope: { ...scope },
      status: 'ACTIVE',
      revision: 1,
      entries: entryIds.map((entryId) => ({ entryId, status: 'PENDING' })),
      updatedAt: this.now().toISOString()
    };
    this.checkpoints.set(key, checkpoint);
    return cloneCheckpoint(checkpoint);
  }

  public pause(scope: CrawlCheckpointScope): CrawlCheckpoint {
    const current = this.require(scope);
    if (current.status !== 'ACTIVE') throw new CrawlCheckpointError('CRAWL_CHECKPOINT_CONFLICT', 'Yalnız active crawl checkpoint pause edilebilir.');
    return this.replace({ ...current, status: 'PAUSED' });
  }

  public resume(scope: CrawlCheckpointScope): CrawlCheckpoint {
    const current = this.require(scope);
    if (current.status !== 'PAUSED') throw new CrawlCheckpointError('CRAWL_CHECKPOINT_CONFLICT', 'Yalnız paused crawl checkpoint resume edilebilir.');
    const entries = current.entries.map((entry) => entry.status === 'CLAIMED' ? { entryId: entry.entryId, status: 'PENDING' as const } : { ...entry });
    return this.replace({ ...current, status: 'ACTIVE', entries });
  }

  public claim(scope: CrawlCheckpointScope, workerId: string): CrawlCheckpointEntry | undefined {
    const current = this.require(scope);
    if (!SAFE_ID.test(workerId)) throw new CrawlCheckpointError('CRAWL_CHECKPOINT_INVALID', 'Checkpoint worker identity geçerli değil.');
    if (current.status !== 'ACTIVE') return undefined;
    const index = current.entries.findIndex((entry) => entry.status === 'PENDING');
    if (index === -1) return undefined;
    const entries = [...current.entries];
    const claimed: CrawlCheckpointEntry = { entryId: entries[index]!.entryId, status: 'CLAIMED', claimOwner: workerId };
    entries[index] = claimed;
    this.replace({ ...current, entries });
    return { ...claimed };
  }

  public commit(scope: CrawlCheckpointScope, entryId: string, workerId: string): CrawlCheckpoint {
    const current = this.require(scope);
    if (!SAFE_ID.test(entryId) || !SAFE_ID.test(workerId)) throw new CrawlCheckpointError('CRAWL_CHECKPOINT_INVALID', 'Checkpoint entry veya worker identity geçerli değil.');
    if (current.status !== 'ACTIVE') throw new CrawlCheckpointError('CRAWL_CHECKPOINT_CONFLICT', 'Paused veya terminal checkpoint commit kabul etmez.');
    const index = current.entries.findIndex((entry) => entry.entryId === entryId);
    if (index === -1) throw new CrawlCheckpointError('CRAWL_CHECKPOINT_NOT_FOUND', 'Checkpoint entry bulunamadı.');
    const entry = current.entries[index]!;
    if (entry.status !== 'CLAIMED' || entry.claimOwner !== workerId) {
      throw new CrawlCheckpointError('CRAWL_CHECKPOINT_CONFLICT', 'Yalnız claim owner checkpoint entry commit edebilir.');
    }
    const entries = [...current.entries];
    entries[index] = { entryId, status: 'COMMITTED', committedAt: this.now().toISOString() };
    const status: CrawlCheckpointStatus = entries.every((candidate) => candidate.status === 'COMMITTED') ? 'COMPLETED' : 'ACTIVE';
    return this.replace({ ...current, status, entries });
  }

  public get(scope: CrawlCheckpointScope): CrawlCheckpoint {
    return cloneCheckpoint(this.require(scope));
  }

  private require(scope: CrawlCheckpointScope): CrawlCheckpoint {
    validateScope(scope);
    const checkpoint = this.checkpoints.get(checkpointKey(scope));
    if (!checkpoint) throw new CrawlCheckpointError('CRAWL_CHECKPOINT_NOT_FOUND', 'Crawl checkpoint bulunamadı.');
    return checkpoint;
  }

  private replace(next: Omit<CrawlCheckpoint, 'revision' | 'updatedAt'>): CrawlCheckpoint {
    const existing = this.checkpoints.get(checkpointKey(next.scope));
    if (!existing) throw new CrawlCheckpointError('CRAWL_CHECKPOINT_NOT_FOUND', 'Crawl checkpoint bulunamadı.');
    const checkpoint: CrawlCheckpoint = {
      ...next,
      scope: { ...next.scope },
      revision: existing.revision + 1,
      entries: next.entries.map((entry) => ({ ...entry })),
      updatedAt: this.now().toISOString()
    };
    this.checkpoints.set(checkpointKey(checkpoint.scope), checkpoint);
    return cloneCheckpoint(checkpoint);
  }
}

function validateScope(scope: CrawlCheckpointScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.jobId)) {
    throw new CrawlCheckpointError('CRAWL_CHECKPOINT_INVALID', 'Checkpoint tenant/job scope geçerli değil.');
  }
}

function checkpointKey(scope: CrawlCheckpointScope): string {
  return `${scope.tenantId}:${scope.jobId}`;
}

function cloneCheckpoint(checkpoint: CrawlCheckpoint): CrawlCheckpoint {
  return {
    ...checkpoint,
    scope: { ...checkpoint.scope },
    entries: checkpoint.entries.map((entry) => ({ ...entry }))
  };
}
