export type CrawlLimitsPolicy = {
  maxDepth: number;
  maxPages: number;
  maxPaginationSteps: number;
};

export type CrawlLimitReason = 'ALLOWED' | 'DEPTH_LIMIT_REACHED' | 'PAGE_LIMIT_REACHED' | 'PAGINATION_LIMIT_REACHED' | 'DUPLICATE_CANDIDATE';

export type CrawlLimitDecision = {
  allowed: boolean;
  reason: CrawlLimitReason;
  nextState: CrawlLimitState;
};

export type CrawlLimitState = {
  admittedPageCount: number;
  admittedCandidateIds: ReadonlyArray<string>;
  paginationStepsByChain: Readonly<Record<string, number>>;
};

export type CrawlLimitCandidate = {
  candidateId: string;
  depth: number;
  pagination?: { chainId: string; step: number };
};

export class CrawlLimitPolicyError extends Error {
  public constructor(public readonly code: 'CRAWL_LIMIT_POLICY_INVALID', message: string) {
    super(message);
    this.name = 'CrawlLimitPolicyError';
  }
}

const MAX_CONFIGURED_DEPTH = 64;
const MAX_CONFIGURED_PAGES = 100_000;
const MAX_CONFIGURED_PAGINATION_STEPS = 10_000;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Stateless admission decision for a caller-owned crawl snapshot. It does not
 * mutate frontier state, fetch pages, infer pagination or enqueue work.
 */
export function admitCrawlCandidate(
  state: CrawlLimitState,
  candidate: CrawlLimitCandidate,
  policy: CrawlLimitsPolicy
): CrawlLimitDecision {
  validatePolicy(policy);
  validateState(state);
  validateCandidate(candidate);
  const existing = new Set(state.admittedCandidateIds);
  if (existing.has(candidate.candidateId)) return decision(false, 'DUPLICATE_CANDIDATE', state);
  if (candidate.depth > policy.maxDepth) return decision(false, 'DEPTH_LIMIT_REACHED', state);
  if (state.admittedPageCount >= policy.maxPages) return decision(false, 'PAGE_LIMIT_REACHED', state);
  const pagination = candidate.pagination;
  if (pagination) {
    const currentStep = state.paginationStepsByChain[pagination.chainId] ?? 0;
    if (pagination.step <= currentStep || pagination.step > policy.maxPaginationSteps) {
      return decision(false, 'PAGINATION_LIMIT_REACHED', state);
    }
  }
  return decision(true, 'ALLOWED', {
    admittedPageCount: state.admittedPageCount + 1,
    admittedCandidateIds: [...state.admittedCandidateIds, candidate.candidateId],
    paginationStepsByChain: {
      ...state.paginationStepsByChain,
      ...(pagination === undefined ? {} : { [pagination.chainId]: pagination.step })
    }
  });
}

export function createCrawlLimitState(): CrawlLimitState {
  return { admittedPageCount: 0, admittedCandidateIds: [], paginationStepsByChain: {} };
}

function validatePolicy(policy: CrawlLimitsPolicy): void {
  if (!Number.isInteger(policy.maxDepth) || policy.maxDepth < 0 || policy.maxDepth > MAX_CONFIGURED_DEPTH
    || !Number.isInteger(policy.maxPages) || policy.maxPages < 1 || policy.maxPages > MAX_CONFIGURED_PAGES
    || !Number.isInteger(policy.maxPaginationSteps) || policy.maxPaginationSteps < 0 || policy.maxPaginationSteps > MAX_CONFIGURED_PAGINATION_STEPS) {
    throw new CrawlLimitPolicyError('CRAWL_LIMIT_POLICY_INVALID', 'Crawler limit policy kabul edilen sınırlar içinde olmalıdır.');
  }
}

function validateState(state: CrawlLimitState): void {
  if (!Number.isInteger(state.admittedPageCount) || state.admittedPageCount < 0 || state.admittedPageCount !== state.admittedCandidateIds.length
    || new Set(state.admittedCandidateIds).size !== state.admittedCandidateIds.length
    || state.admittedCandidateIds.some((candidateId) => !SAFE_ID.test(candidateId))) {
    throw new CrawlLimitPolicyError('CRAWL_LIMIT_POLICY_INVALID', 'Crawl limit state geçerli değil.');
  }
  for (const [chainId, step] of Object.entries(state.paginationStepsByChain)) {
    if (!SAFE_ID.test(chainId) || !Number.isInteger(step) || step < 1 || step > MAX_CONFIGURED_PAGINATION_STEPS) {
      throw new CrawlLimitPolicyError('CRAWL_LIMIT_POLICY_INVALID', 'Pagination state geçerli değil.');
    }
  }
}

function validateCandidate(candidate: CrawlLimitCandidate): void {
  if (!SAFE_ID.test(candidate.candidateId) || !Number.isInteger(candidate.depth) || candidate.depth < 0 || candidate.depth > MAX_CONFIGURED_DEPTH) {
    throw new CrawlLimitPolicyError('CRAWL_LIMIT_POLICY_INVALID', 'Crawler candidate geçerli değil.');
  }
  if (candidate.pagination && (!SAFE_ID.test(candidate.pagination.chainId) || !Number.isInteger(candidate.pagination.step) || candidate.pagination.step < 1)) {
    throw new CrawlLimitPolicyError('CRAWL_LIMIT_POLICY_INVALID', 'Pagination candidate geçerli değil.');
  }
}

function decision(allowed: boolean, reason: CrawlLimitReason, nextState: CrawlLimitState): CrawlLimitDecision {
  return {
    allowed,
    reason,
    nextState: {
      admittedPageCount: nextState.admittedPageCount,
      admittedCandidateIds: [...nextState.admittedCandidateIds],
      paginationStepsByChain: { ...nextState.paginationStepsByChain }
    }
  };
}
