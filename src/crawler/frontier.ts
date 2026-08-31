import { createHash } from 'node:crypto';

import { canonicalizeCrawlUrl } from './url-identity.js';

export type CrawlStateStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type CrawlFrontierStatus = 'QUEUED' | 'CLAIMED' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export type CrawlState = {
  tenantId: string;
  projectId: string;
  jobId: string;
  partitionCount: number;
  status: CrawlStateStatus;
  createdAt: string;
};

export type CrawlFrontierEntry = {
  tenantId: string;
  projectId: string;
  jobId: string;
  entryId: string;
  url: string;
  depth: number;
  partition: number;
  queueKey: string;
  status: CrawlFrontierStatus;
  parentEntryId?: string;
  claimedBy?: string;
  enqueuedAt: string;
  completedAt?: string;
};

export type CrawlFrontierErrorCode =
  | 'CRAWL_FRONTIER_INVALID'
  | 'CRAWL_FRONTIER_NOT_FOUND'
  | 'CRAWL_FRONTIER_CONFLICT'
  | 'CRAWL_FRONTIER_STATE_INVALID';

export class CrawlFrontierError extends Error {
  public constructor(public readonly code: CrawlFrontierErrorCode, message: string) {
    super(message);
    this.name = 'CrawlFrontierError';
  }
}

export type CreateCrawlInput = {
  tenantId: string;
  projectId: string;
  jobId: string;
  partitionCount?: number;
};

export type EnqueueCrawlUrlInput = {
  tenantId: string;
  projectId: string;
  jobId: string;
  url: string;
  depth: number;
  parentEntryId?: string;
};

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_PARTITIONS = 128;
const MAX_FRONTIER_ENTRIES = 10_000;
const MAX_URL_LENGTH = 4_096;
const MAX_DEPTH_TECHNICAL_BOUND = 64;

/**
 * Process-local frontier reference contract. It does not fetch URLs, invoke a
 * queue, canonicalize URLs or persist crawl state; later crawler tasks own
 * those external and policy-bound responsibilities.
 */
export class CrawlFrontierRegistry {
  private readonly crawls = new Map<string, CrawlState>();
  private readonly entries = new Map<string, CrawlFrontierEntry[]>();

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public create(input: CreateCrawlInput): CrawlState {
    validateScope(input);
    const key = crawlKey(input.tenantId, input.jobId);
    const existing = this.crawls.get(key);
    if (existing) {
      if (existing.projectId !== input.projectId || existing.partitionCount !== (input.partitionCount ?? existing.partitionCount)) {
        throw new CrawlFrontierError('CRAWL_FRONTIER_CONFLICT', 'Crawl state farklı project veya partition sayısıyla yeniden oluşturulamaz.');
      }
      return { ...existing };
    }
    const partitionCount = input.partitionCount ?? 8;
    if (!Number.isInteger(partitionCount) || partitionCount < 1 || partitionCount > MAX_PARTITIONS) {
      throw new CrawlFrontierError('CRAWL_FRONTIER_INVALID', 'Crawl partition sayısı 1 ila 128 arasında olmalıdır.');
    }
    const state: CrawlState = {
      tenantId: input.tenantId,
      projectId: input.projectId,
      jobId: input.jobId,
      partitionCount,
      status: 'ACTIVE',
      createdAt: this.now().toISOString()
    };
    this.crawls.set(key, state);
    this.entries.set(key, []);
    return { ...state };
  }

  public enqueue(input: EnqueueCrawlUrlInput): CrawlFrontierEntry {
    validateScope(input);
    const state = this.requireCrawl(input.tenantId, input.jobId);
    if (state.projectId !== input.projectId || state.status !== 'ACTIVE') {
      throw new CrawlFrontierError('CRAWL_FRONTIER_STATE_INVALID', 'Crawl active state veya project scope ile uyuşmuyor.');
    }
    validateUrlLength(input.url);
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeCrawlUrl(input.url).canonicalUrl;
    } catch {
      throw new CrawlFrontierError('CRAWL_FRONTIER_INVALID', 'Crawl URL güvenli HTTP(S) hedefi olmalıdır.');
    }
    if (!Number.isInteger(input.depth) || input.depth < 0 || input.depth > MAX_DEPTH_TECHNICAL_BOUND) {
      throw new CrawlFrontierError('CRAWL_FRONTIER_INVALID', 'Crawl depth teknik sınır içinde olmalıdır.');
    }
    const key = crawlKey(input.tenantId, input.jobId);
    const entries = this.entries.get(key) ?? [];
    if (entries.length >= MAX_FRONTIER_ENTRIES) {
      throw new CrawlFrontierError('CRAWL_FRONTIER_STATE_INVALID', 'Crawl frontier teknik kapasite sınırına ulaştı.');
    }
    if (input.parentEntryId && !entries.some((entry) => entry.entryId === input.parentEntryId)) {
      throw new CrawlFrontierError('CRAWL_FRONTIER_NOT_FOUND', 'Parent frontier entry aynı crawl scope içinde bulunamadı.');
    }
    const existing = entries.find((entry) => entry.url === canonicalUrl);
    if (existing) return cloneEntry(existing);
    const partition = partitionFor(state, canonicalUrl);
    const entry: CrawlFrontierEntry = {
      tenantId: state.tenantId,
      projectId: state.projectId,
      jobId: state.jobId,
      entryId: `frontier_${sha256(`${state.tenantId}:${state.jobId}:${canonicalUrl}`).slice(0, 32)}`,
      url: canonicalUrl,
      depth: input.depth,
      partition,
      queueKey: `crawl:${state.tenantId}:${state.jobId}:p${partition}`,
      status: 'QUEUED',
      ...(input.parentEntryId === undefined ? {} : { parentEntryId: input.parentEntryId }),
      enqueuedAt: this.now().toISOString()
    };
    this.entries.set(key, [...entries, entry]);
    return cloneEntry(entry);
  }

  public claimNext(input: { tenantId: string; jobId: string; workerId: string; partition?: number }): CrawlFrontierEntry | undefined {
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.jobId, 'jobId');
    assertIdentifier(input.workerId, 'workerId');
    const state = this.requireCrawl(input.tenantId, input.jobId);
    if (state.status !== 'ACTIVE') return undefined;
    if (input.partition !== undefined && (!Number.isInteger(input.partition) || input.partition < 0 || input.partition >= state.partitionCount)) {
      throw new CrawlFrontierError('CRAWL_FRONTIER_INVALID', 'Crawl partition geçerli değil.');
    }
    const key = crawlKey(input.tenantId, input.jobId);
    const entries = this.entries.get(key) ?? [];
    const index = entries.findIndex((entry) => entry.status === 'QUEUED' && (input.partition === undefined || entry.partition === input.partition));
    if (index === -1) return undefined;
    const selected = entries[index]!;
    const claimed: CrawlFrontierEntry = { ...selected, status: 'CLAIMED', claimedBy: input.workerId };
    const next = [...entries];
    next[index] = claimed;
    this.entries.set(key, next);
    return cloneEntry(claimed);
  }

  public complete(input: { tenantId: string; jobId: string; entryId: string; workerId: string; succeeded: boolean }): CrawlFrontierEntry {
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.jobId, 'jobId');
    assertIdentifier(input.entryId, 'entryId');
    assertIdentifier(input.workerId, 'workerId');
    const key = crawlKey(input.tenantId, input.jobId);
    const entries = this.entries.get(key);
    const index = entries?.findIndex((entry) => entry.entryId === input.entryId) ?? -1;
    if (!entries || index === -1) throw new CrawlFrontierError('CRAWL_FRONTIER_NOT_FOUND', 'Frontier entry bulunamadı.');
    const current = entries[index]!;
    if (current.status !== 'CLAIMED' || current.claimedBy !== input.workerId) {
      throw new CrawlFrontierError('CRAWL_FRONTIER_STATE_INVALID', 'Yalnızca entry sahibi worker claimed frontier entry tamamlayabilir.');
    }
    const completed: CrawlFrontierEntry = {
      ...current,
      status: input.succeeded ? 'SUCCEEDED' : 'FAILED',
      completedAt: this.now().toISOString()
    };
    const next = [...entries];
    next[index] = completed;
    this.entries.set(key, next);
    return cloneEntry(completed);
  }

  public list(input: { tenantId: string; jobId: string }): CrawlFrontierEntry[] {
    assertIdentifier(input.tenantId, 'tenantId');
    assertIdentifier(input.jobId, 'jobId');
    this.requireCrawl(input.tenantId, input.jobId);
    return (this.entries.get(crawlKey(input.tenantId, input.jobId)) ?? []).map(cloneEntry);
  }

  private requireCrawl(tenantId: string, jobId: string): CrawlState {
    const state = this.crawls.get(crawlKey(tenantId, jobId));
    if (!state) throw new CrawlFrontierError('CRAWL_FRONTIER_NOT_FOUND', 'Crawl state bulunamadı.');
    return state;
  }
}

function validateScope(input: Pick<CreateCrawlInput, 'tenantId' | 'projectId' | 'jobId'>): void {
  assertIdentifier(input.tenantId, 'tenantId');
  assertIdentifier(input.projectId, 'projectId');
  assertIdentifier(input.jobId, 'jobId');
}

function validateUrlLength(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL_LENGTH) {
    throw new CrawlFrontierError('CRAWL_FRONTIER_INVALID', 'Crawl URL kabul edilen uzunlukta olmalıdır.');
  }
}

function assertIdentifier(value: string, name: string): void {
  if (!SAFE_IDENTIFIER.test(value)) throw new CrawlFrontierError('CRAWL_FRONTIER_INVALID', `${name} güvenli identifier biçiminde olmalıdır.`);
}

function partitionFor(state: CrawlState, url: string): number {
  const value = Number.parseInt(sha256(`${state.tenantId}:${state.jobId}:${url}`).slice(0, 8), 16);
  return value % state.partitionCount;
}

function crawlKey(tenantId: string, jobId: string): string {
  return `${tenantId}:${jobId}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cloneEntry(entry: CrawlFrontierEntry): CrawlFrontierEntry {
  return { ...entry };
}
