import { CrawlCheckpointRegistry } from '../src/crawler/checkpoint.js';
import { admitCrawlCandidate, createCrawlLimitState } from '../src/crawler/crawl-limits.js';
import { evaluateCrawlCandidate, parseRobotsRules } from '../src/crawler/crawl-policy.js';
import { CrawlFrontierRegistry } from '../src/crawler/frontier.js';
import { discoverLinks } from '../src/crawler/link-discovery.js';
import { rankCrawlCandidates } from '../src/crawler/sitemap-priority.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`CRAWLER_GATE_ASSERTION_FAILED: ${message}`);
}

const scope = { tenantId: 'tenant_gate', jobId: 'job_gate', taskId: 'task_gate', attemptId: 'attempt_gate' };
const document = { cleanHtml: '<main><a href="/catalog?page=1">Catalog</a><a href="/next" rel="nofollow">Next</a><a href="http://127.0.0.1/private">Private</a></main>', cleanedChecksumSha256: 'a'.repeat(64) };

// Discovery: no DOM/raw value output, parent provenance and unsafe candidate skip.
const discovered = discoverLinks({ scope, baseUrl: 'https://example.com/root', document });
assert(discovered.links.length === 2, 'Clean HTML candidates bulunamadı.');
assert(discovered.links[0]?.parentTaskId === scope.taskId, 'Parent task provenance kayboldu.');
assert(discovered.summary.skippedUnsafeCount === 1, 'Unsafe candidate fail-closed skip edilmedi.');

// Canonical frontier dedupe: host case/default port/fragment varyasyonları tek entry olur.
const frontier = new CrawlFrontierRegistry(() => new Date('2026-08-27T00:00:00.000Z'));
frontier.create({ tenantId: scope.tenantId, projectId: 'project_gate', jobId: scope.jobId, partitionCount: 4 });
const first = frontier.enqueue({ tenantId: scope.tenantId, projectId: 'project_gate', jobId: scope.jobId, url: discovered.links[0]!.resolvedUrl, depth: 0 });
const duplicate = frontier.enqueue({ tenantId: scope.tenantId, projectId: 'project_gate', jobId: scope.jobId, url: 'https://EXAMPLE.com:443/catalog?page=1#anchor', depth: 0 });
assert(first.entryId === duplicate.entryId && frontier.list({ tenantId: scope.tenantId, jobId: scope.jobId }).length === 1, 'Canonical dedupe tek frontier entry üretmedi.');

// Policy: robots and nofollow produce terminal/no-bypass blocks.
const robotsRules = parseRobotsRules({ userAgent: 'scraping-platform', text: 'User-agent: *\nDisallow: /blocked\n' });
const blocked = evaluateCrawlCandidate({ url: 'https://example.com/blocked' }, { allowedHosts: ['example.com'], robotsRules });
const noFollow = evaluateCrawlCandidate({ url: discovered.links[1]!.resolvedUrl, noFollow: true }, { allowedHosts: ['example.com'], robotsRules, respectNoFollow: true });
assert(!blocked.allowed && blocked.reason === 'ROBOTS_DISALLOWED' && !blocked.retryable && !blocked.allowBypass, 'Robots block terminal/no-bypass değil.');
assert(!noFollow.allowed && noFollow.reason === 'NOFOLLOW', 'Nofollow candidate block edilmedi.');

// Limit: bounded admission prevents growth beyond configured page/depth/pagination rules.
const admitted = admitCrawlCandidate(createCrawlLimitState(), { candidateId: first.entryId, depth: 0, pagination: { chainId: 'catalog', step: 1 } }, { maxDepth: 1, maxPages: 1, maxPaginationSteps: 1 });
const pageLimited = admitCrawlCandidate(admitted.nextState, { candidateId: 'entry_second', depth: 1 }, { maxDepth: 1, maxPages: 1, maxPaginationSteps: 1 });
assert(admitted.allowed && !pageLimited.allowed && pageLimited.reason === 'PAGE_LIMIT_REACHED', 'Page limit fail-closed uygulanmadı.');

// Priority: source/depth ordering is deterministic, but cannot override policy/limits.
const ranked = rankCrawlCandidates([
  { candidateId: 'link_1', canonicalUrl: 'https://example.com/link', sourceKind: 'LINK', depth: 0, discoveryOrder: 1 },
  { candidateId: 'seed_1', canonicalUrl: 'https://example.com/seed', sourceKind: 'SEED', depth: 0, discoveryOrder: 0 }
]);
assert(ranked.map((candidate) => candidate.candidateId).join(',') === 'seed_1,link_1', 'Priority order deterministic değil.');

// Recovery: paused claimed work returns to pending; committed work remains terminal.
const checkpoints = new CrawlCheckpointRegistry(() => new Date('2026-08-27T00:00:00.000Z'));
checkpoints.initialize({ tenantId: scope.tenantId, jobId: scope.jobId }, ['checkpoint_1', 'checkpoint_2']);
const claim = checkpoints.claim({ tenantId: scope.tenantId, jobId: scope.jobId }, 'worker_gate');
assert(claim?.entryId === 'checkpoint_1', 'Checkpoint claim üretilemedi.');
checkpoints.pause({ tenantId: scope.tenantId, jobId: scope.jobId });
const resumed = checkpoints.resume({ tenantId: scope.tenantId, jobId: scope.jobId });
assert(resumed.entries[0]?.status === 'PENDING', 'Paused claimed work resume sırasında pending olmadı.');

console.log('Crawler gate smoke: PASS (deterministic, no network/DB/queue/storage side effects)');
