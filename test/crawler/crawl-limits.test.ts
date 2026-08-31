import { describe, expect, it } from 'vitest';

import { admitCrawlCandidate, CrawlLimitPolicyError, createCrawlLimitState } from '../../src/crawler/crawl-limits.js';

const policy = { maxDepth: 2, maxPages: 2, maxPaginationSteps: 3 };

describe('crawler limit policy', () => {
  it('admits bounded candidates and returns a new deterministic caller-owned state', () => {
    const initial = createCrawlLimitState();
    const first = admitCrawlCandidate(initial, { candidateId: 'entry_1', depth: 0 }, policy);
    const second = admitCrawlCandidate(first.nextState, { candidateId: 'entry_2', depth: 1, pagination: { chainId: 'catalog', step: 1 } }, policy);

    expect(initial).toEqual(createCrawlLimitState());
    expect(first).toMatchObject({ allowed: true, reason: 'ALLOWED', nextState: { admittedPageCount: 1 } });
    expect(second).toMatchObject({ allowed: true, reason: 'ALLOWED', nextState: { admittedPageCount: 2, paginationStepsByChain: { catalog: 1 } } });
  });

  it('fails closed at duplicate, depth, page and non-monotonic/excessive pagination boundaries', () => {
    const state = { admittedPageCount: 1, admittedCandidateIds: ['entry_1'], paginationStepsByChain: { catalog: 2 } };

    expect(admitCrawlCandidate(state, { candidateId: 'entry_1', depth: 0 }, policy).reason).toBe('DUPLICATE_CANDIDATE');
    expect(admitCrawlCandidate(state, { candidateId: 'entry_2', depth: 3 }, policy).reason).toBe('DEPTH_LIMIT_REACHED');
    expect(admitCrawlCandidate(state, { candidateId: 'entry_2', depth: 1, pagination: { chainId: 'catalog', step: 2 } }, policy).reason).toBe('PAGINATION_LIMIT_REACHED');
    expect(admitCrawlCandidate({ ...state, admittedPageCount: 2, admittedCandidateIds: ['entry_1', 'entry_2'] }, { candidateId: 'entry_3', depth: 1 }, policy).reason).toBe('PAGE_LIMIT_REACHED');
  });

  it('rejects malformed policy, candidate and caller state without side effects', () => {
    expect(() => admitCrawlCandidate(createCrawlLimitState(), { candidateId: 'entry_1', depth: 0 }, { ...policy, maxPages: 0 })).toThrow(CrawlLimitPolicyError);
    expect(() => admitCrawlCandidate(createCrawlLimitState(), { candidateId: 'bad id', depth: 0 }, policy)).toThrow(CrawlLimitPolicyError);
    expect(() => admitCrawlCandidate({ admittedPageCount: 2, admittedCandidateIds: ['entry_1'], paginationStepsByChain: {} }, { candidateId: 'entry_2', depth: 0 }, policy)).toThrow(CrawlLimitPolicyError);
  });
});
