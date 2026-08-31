import { createHash } from 'node:crypto';

import { DOMParser, type Element as XmlElement } from '@xmldom/xmldom';

import { canonicalizeCrawlUrl } from './url-identity.js';

export type SitemapDocumentKind = 'URLSET' | 'SITEMAP_INDEX';

export type SitemapUrlCandidate = {
  canonicalUrl: string;
  sourceKind: 'SITEMAP_URL';
  sitemapChecksumSha256: string;
  discoveryOrder: number;
  priorityHint?: number;
};

export type SitemapExtractionResult = {
  kind: SitemapDocumentKind;
  sitemapChecksumSha256: string;
  urls: ReadonlyArray<SitemapUrlCandidate>;
  childSitemapUrls: ReadonlyArray<string>;
  summary: {
    scannedLocationCount: number;
    acceptedUrlCount: number;
    acceptedChildSitemapCount: number;
    skippedInvalidCount: number;
    skippedSensitiveCount: number;
    truncated: boolean;
  };
};

export type PrioritizedCrawlCandidate = {
  candidateId: string;
  canonicalUrl: string;
  depth: number;
  discoveryOrder: number;
  sourceKind: 'SEED' | 'SITEMAP_URL' | 'LINK';
  sitemapPriorityHint?: number;
};

export type RankedCrawlCandidate = PrioritizedCrawlCandidate & {
  priority: number;
};

export class SitemapPriorityError extends Error {
  public constructor(public readonly code: 'SITEMAP_PRIORITY_INVALID', message: string) {
    super(message);
    this.name = 'SitemapPriorityError';
  }
}

const MAX_SITEMAP_BYTES = 1_000_000;
const MAX_SITEMAP_ENTRIES = 5_000;
const MAX_QUEUE_CANDIDATES = 10_000;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SENSITIVE_QUERY_KEY = /authorization|cookie|credential|password|secret|token|session|api[_-]?key/i;
const SOURCE_BASE_PRIORITY: Record<PrioritizedCrawlCandidate['sourceKind'], number> = {
  SEED: 100,
  SITEMAP_URL: 80,
  LINK: 60
};

/** Parses a caller-provided sitemap text snapshot only. It makes no network request. */
export function extractSitemapCandidates(input: { xml: string; maxEntries?: number }): SitemapExtractionResult {
  if (typeof input.xml !== 'string' || Buffer.byteLength(input.xml, 'utf8') > MAX_SITEMAP_BYTES || /<!DOCTYPE|<!ENTITY/i.test(input.xml)) {
    throw new SitemapPriorityError('SITEMAP_PRIORITY_INVALID', 'Sitemap XML güvenli ve bounded olmalıdır.');
  }
  const maxEntries = input.maxEntries ?? 1_000;
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > MAX_SITEMAP_ENTRIES) {
    throw new SitemapPriorityError('SITEMAP_PRIORITY_INVALID', 'Sitemap maxEntries 1 ila 5000 arasında olmalıdır.');
  }
  const document = new DOMParser().parseFromString(input.xml, 'application/xml');
  const rootElement = document.documentElement;
  if (document.getElementsByTagName('parsererror').length > 0 || !rootElement || !rootElement.localName) {
    throw new SitemapPriorityError('SITEMAP_PRIORITY_INVALID', 'Sitemap XML parse edilemedi.');
  }
  const root = rootElement.localName.toLowerCase();
  if (root !== 'urlset' && root !== 'sitemapindex') {
    throw new SitemapPriorityError('SITEMAP_PRIORITY_INVALID', 'Sitemap yalnız urlset veya sitemapindex olabilir.');
  }
  const sitemapChecksumSha256 = sha256(input.xml);
  const urls: SitemapUrlCandidate[] = [];
  const childSitemapUrls: string[] = [];
  let scannedLocationCount = 0;
  let skippedInvalidCount = 0;
  let skippedSensitiveCount = 0;
  let truncated = false;
  const entries = directChildren(rootElement, root === 'urlset' ? 'url' : 'sitemap');
  for (const entry of entries) {
    const location = directChildren(entry, 'loc')[0]?.textContent?.trim() ?? '';
    scannedLocationCount += 1;
    if (urls.length + childSitemapUrls.length >= maxEntries) {
      truncated = true;
      continue;
    }
    if (hasSensitiveQuery(location)) {
      skippedSensitiveCount += 1;
      continue;
    }
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeCrawlUrl(location).canonicalUrl;
    } catch {
      skippedInvalidCount += 1;
      continue;
    }
    if (root === 'sitemapindex') {
      if (!childSitemapUrls.includes(canonicalUrl)) childSitemapUrls.push(canonicalUrl);
      continue;
    }
    if (urls.some((candidate) => candidate.canonicalUrl === canonicalUrl)) continue;
    const priorityHint = parsePriority(directChildren(entry, 'priority')[0]?.textContent?.trim());
    urls.push({
      canonicalUrl,
      sourceKind: 'SITEMAP_URL',
      sitemapChecksumSha256,
      discoveryOrder: urls.length,
      ...(priorityHint === undefined ? {} : { priorityHint })
    });
  }
  return {
    kind: root === 'urlset' ? 'URLSET' : 'SITEMAP_INDEX',
    sitemapChecksumSha256,
    urls,
    childSitemapUrls,
    summary: {
      scannedLocationCount,
      acceptedUrlCount: urls.length,
      acceptedChildSitemapCount: childSitemapUrls.length,
      skippedInvalidCount,
      skippedSensitiveCount,
      truncated
    }
  };
}

/**
 * Calculates a deterministic selection order only. It does not enqueue, fetch,
 * mutate a persistent queue or override depth/page/policy admission controls.
 */
export function rankCrawlCandidates(candidates: ReadonlyArray<PrioritizedCrawlCandidate>): RankedCrawlCandidate[] {
  if (candidates.length > MAX_QUEUE_CANDIDATES || candidates.some((candidate) => !validCandidate(candidate))) {
    throw new SitemapPriorityError('SITEMAP_PRIORITY_INVALID', 'Priority candidate listesi geçerli değil.');
  }
  const unique = new Set<string>();
  for (const candidate of candidates) {
    if (unique.has(candidate.candidateId)) throw new SitemapPriorityError('SITEMAP_PRIORITY_INVALID', 'Priority candidate identity tekrar edemez.');
    unique.add(candidate.candidateId);
  }
  return candidates.map((candidate) => ({
    ...candidate,
    priority: SOURCE_BASE_PRIORITY[candidate.sourceKind] + (candidate.sitemapPriorityHint === undefined ? 0 : Math.round(candidate.sitemapPriorityHint * 10)) - candidate.depth * 2
  })).sort((left, right) => right.priority - left.priority || left.discoveryOrder - right.discoveryOrder || left.candidateId.localeCompare(right.candidateId));
}

function directChildren(element: XmlElement, localName: string): XmlElement[] {
  const children: XmlElement[] = [];
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== 1) continue;
    const child = node as XmlElement;
    if (child.localName?.toLowerCase() === localName) children.push(child);
  }
  return children;
}

function parsePriority(value: string | undefined): number | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function hasSensitiveQuery(value: string): boolean {
  try {
    return [...new URL(value).searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key));
  } catch {
    return false;
  }
}

function validCandidate(candidate: PrioritizedCrawlCandidate): boolean {
  return SAFE_ID.test(candidate.candidateId)
    && typeof candidate.canonicalUrl === 'string'
    && Number.isInteger(candidate.depth) && candidate.depth >= 0 && candidate.depth <= 64
    && Number.isInteger(candidate.discoveryOrder) && candidate.discoveryOrder >= 0
    && ['SEED', 'SITEMAP_URL', 'LINK'].includes(candidate.sourceKind)
    && (candidate.sitemapPriorityHint === undefined || Number.isFinite(candidate.sitemapPriorityHint) && candidate.sitemapPriorityHint >= 0 && candidate.sitemapPriorityHint <= 1);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
