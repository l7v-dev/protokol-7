import { createHash } from 'node:crypto';

import { assertSafeOutboundUrl } from '../security/egress-policy.js';

export type RobotsRules = {
  userAgent: string;
  allowPaths: ReadonlyArray<string>;
  disallowPaths: ReadonlyArray<string>;
  fingerprintSha256: string;
};

export type CrawlCandidatePolicy = {
  allowedHosts: ReadonlyArray<string>;
  deniedHosts?: ReadonlyArray<string>;
  allowedPathPrefixes?: ReadonlyArray<string>;
  deniedPathPrefixes?: ReadonlyArray<string>;
  allowSubdomains?: boolean;
  respectNoFollow?: boolean;
  robotsRules?: RobotsRules;
};

export type CrawlCandidateDecisionReason =
  | 'ALLOWED'
  | 'UNSAFE_TARGET'
  | 'DENYLIST_HOST'
  | 'HOST_NOT_ALLOWLISTED'
  | 'DENYLIST_PATH'
  | 'PATH_NOT_ALLOWLISTED'
  | 'NOFOLLOW'
  | 'ROBOTS_DISALLOWED';

export type CrawlCandidateDecision = {
  allowed: boolean;
  reason: CrawlCandidateDecisionReason;
  retryable: false;
  allowBypass: false;
  policyFingerprintSha256: string;
};

export class CrawlPolicyError extends Error {
  public constructor(public readonly code: 'CRAWL_POLICY_INVALID', message: string) {
    super(message);
    this.name = 'CrawlPolicyError';
  }
}

const MAX_ROBOTS_BYTES = 64_000;
const MAX_ROBOTS_RULES = 200;
const MAX_HOST_RULES = 100;
const MAX_PATH_RULES = 100;
const SAFE_HOST = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

/** Parses a bounded robots.txt text snapshot. It never makes a robots request. */
export function parseRobotsRules(input: { text: string; userAgent: string }): RobotsRules {
  if (typeof input.text !== 'string' || Buffer.byteLength(input.text, 'utf8') > MAX_ROBOTS_BYTES || !safeAgent(input.userAgent)) {
    throw new CrawlPolicyError('CRAWL_POLICY_INVALID', 'Robots input geçerli değil.');
  }
  const requestedAgent = input.userAgent.toLowerCase();
  const groups: Array<{ agents: string[]; allowPaths: string[]; disallowPaths: string[] }> = [];
  let current = { agents: [] as string[], allowPaths: [] as string[], disallowPaths: [] as string[] };
  const flush = () => {
    if (current.agents.length > 0) groups.push(current);
    current = { agents: [], allowPaths: [], disallowPaths: [] };
  };
  for (const rawLine of input.text.split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0]?.trim() ?? '';
    if (line.length === 0) continue;
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (current.allowPaths.length > 0 || current.disallowPaths.length > 0) flush();
      if (safeAgent(value)) current.agents.push(value.toLowerCase());
      continue;
    }
    if (key !== 'allow' && key !== 'disallow' || current.agents.length === 0 || value.length === 0) continue;
    const path = normalizeRobotsPath(value);
    if (key === 'allow') current.allowPaths.push(path);
    else current.disallowPaths.push(path);
    if (current.allowPaths.length + current.disallowPaths.length > MAX_ROBOTS_RULES) {
      throw new CrawlPolicyError('CRAWL_POLICY_INVALID', 'Robots rule sayısı teknik sınırı aşıyor.');
    }
  }
  flush();
  const matching = groups.filter((group) => group.agents.includes(requestedAgent) || group.agents.includes('*'));
  const rules = {
    userAgent: requestedAgent,
    allowPaths: uniqueSorted(matching.flatMap((group) => group.allowPaths)),
    disallowPaths: uniqueSorted(matching.flatMap((group) => group.disallowPaths))
  };
  return { ...rules, fingerprintSha256: fingerprint(rules) };
}

/**
 * Produces a terminal policy decision only. It never fetches a page, retries a
 * blocked candidate, changes policy, enqueues work or requests robots.txt.
 */
export function evaluateCrawlCandidate(
  input: { url: string; noFollow?: boolean },
  policy: CrawlCandidatePolicy
): CrawlCandidateDecision {
  const normalizedPolicy = normalizePolicy(policy);
  const policyFingerprintSha256 = fingerprint(normalizedPolicy);
  let candidate: URL;
  try {
    candidate = new URL(assertSafeOutboundUrl(input.url).url);
  } catch {
    return blocked('UNSAFE_TARGET', policyFingerprintSha256);
  }
  const host = candidate.hostname.toLowerCase();
  if (matchesHost(host, normalizedPolicy.deniedHosts, normalizedPolicy.allowSubdomains)) return blocked('DENYLIST_HOST', policyFingerprintSha256);
  if (!matchesHost(host, normalizedPolicy.allowedHosts, normalizedPolicy.allowSubdomains)) return blocked('HOST_NOT_ALLOWLISTED', policyFingerprintSha256);
  if (matchesPath(candidate.pathname, normalizedPolicy.deniedPathPrefixes)) return blocked('DENYLIST_PATH', policyFingerprintSha256);
  if (normalizedPolicy.allowedPathPrefixes.length > 0 && !matchesPath(candidate.pathname, normalizedPolicy.allowedPathPrefixes)) {
    return blocked('PATH_NOT_ALLOWLISTED', policyFingerprintSha256);
  }
  if (normalizedPolicy.respectNoFollow && input.noFollow === true) return blocked('NOFOLLOW', policyFingerprintSha256);
  if (normalizedPolicy.robotsRules && !isAllowedByRobots(candidate.pathname, normalizedPolicy.robotsRules)) {
    return blocked('ROBOTS_DISALLOWED', policyFingerprintSha256);
  }
  return { allowed: true, reason: 'ALLOWED', retryable: false, allowBypass: false, policyFingerprintSha256 };
}

function normalizePolicy(policy: CrawlCandidatePolicy): Required<Omit<CrawlCandidatePolicy, 'robotsRules'>> & Pick<CrawlCandidatePolicy, 'robotsRules'> {
  const allowedHosts = normalizeHosts(policy.allowedHosts, 'allowedHosts');
  const deniedHosts = normalizeHosts(policy.deniedHosts ?? [], 'deniedHosts');
  const allowedPathPrefixes = normalizePaths(policy.allowedPathPrefixes ?? [], 'allowedPathPrefixes');
  const deniedPathPrefixes = normalizePaths(policy.deniedPathPrefixes ?? [], 'deniedPathPrefixes');
  if (allowedHosts.length === 0) throw new CrawlPolicyError('CRAWL_POLICY_INVALID', 'Crawler policy en az bir allowed host içermelidir.');
  if (typeof policy.allowSubdomains !== 'undefined' && typeof policy.allowSubdomains !== 'boolean'
    || typeof policy.respectNoFollow !== 'undefined' && typeof policy.respectNoFollow !== 'boolean') {
    throw new CrawlPolicyError('CRAWL_POLICY_INVALID', 'Crawler policy boolean alanları geçerli değil.');
  }
  if (policy.robotsRules) validateRobotsRules(policy.robotsRules);
  return {
    allowedHosts,
    deniedHosts,
    allowedPathPrefixes,
    deniedPathPrefixes,
    allowSubdomains: policy.allowSubdomains ?? false,
    respectNoFollow: policy.respectNoFollow ?? true,
    ...(policy.robotsRules === undefined ? {} : { robotsRules: { ...policy.robotsRules, allowPaths: [...policy.robotsRules.allowPaths], disallowPaths: [...policy.robotsRules.disallowPaths] } })
  };
}

function normalizeHosts(values: ReadonlyArray<string>, label: string): string[] {
  if (values.length > MAX_HOST_RULES || values.some((value) => typeof value !== 'string' || !SAFE_HOST.test(value))) {
    throw new CrawlPolicyError('CRAWL_POLICY_INVALID', `${label} host kuralları geçerli değil.`);
  }
  return uniqueSorted(values.map((value) => value.toLowerCase()));
}

function normalizePaths(values: ReadonlyArray<string>, label: string): string[] {
  if (values.length > MAX_PATH_RULES) throw new CrawlPolicyError('CRAWL_POLICY_INVALID', `${label} path kuralı sayısı geçerli değil.`);
  try {
    return uniqueSorted(values.map(normalizeRobotsPath));
  } catch {
    throw new CrawlPolicyError('CRAWL_POLICY_INVALID', `${label} path kuralları geçerli değil.`);
  }
}

function validateRobotsRules(rules: RobotsRules): void {
  if (!safeAgent(rules.userAgent) || !/^[a-f0-9]{64}$/i.test(rules.fingerprintSha256)) {
    throw new CrawlPolicyError('CRAWL_POLICY_INVALID', 'Robots rules geçerli değil.');
  }
  normalizePaths(rules.allowPaths, 'robots allow');
  normalizePaths(rules.disallowPaths, 'robots disallow');
}

function isAllowedByRobots(pathname: string, rules: RobotsRules): boolean {
  const allowedLength = longestMatchingPrefix(pathname, rules.allowPaths);
  const disallowedLength = longestMatchingPrefix(pathname, rules.disallowPaths);
  return allowedLength >= disallowedLength;
}

function longestMatchingPrefix(pathname: string, prefixes: ReadonlyArray<string>): number {
  return prefixes.filter((prefix) => pathname.startsWith(prefix)).reduce((longest, prefix) => Math.max(longest, prefix.length), -1);
}

function matchesHost(host: string, rules: ReadonlyArray<string>, allowSubdomains: boolean): boolean {
  return rules.some((rule) => host === rule || allowSubdomains && host.endsWith(`.${rule}`));
}

function matchesPath(pathname: string, prefixes: ReadonlyArray<string>): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

function blocked(reason: Exclude<CrawlCandidateDecisionReason, 'ALLOWED'>, policyFingerprintSha256: string): CrawlCandidateDecision {
  return { allowed: false, reason, retryable: false, allowBypass: false, policyFingerprintSha256 };
}

function normalizeRobotsPath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1_024 || !value.startsWith('/') || /[\r\n\0]/.test(value)) {
    throw new CrawlPolicyError('CRAWL_POLICY_INVALID', 'Robots path kuralı geçerli değil.');
  }
  return value;
}

function safeAgent(value: string): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$|^\*$/.test(value);
}

function uniqueSorted(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
