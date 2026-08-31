import { createHash } from 'node:crypto';

import { load } from 'cheerio';

import type { CleanHtmlDocument, ExtractionScope } from '../extraction/html-cleaner.js';
import { assertSafeOutboundUrl } from '../security/egress-policy.js';

export type DiscoveredLink = {
  resolvedUrl: string;
  sourceKind: 'HTML_ANCHOR';
  sourceChecksumSha256: string;
  parentTaskId: string;
  parentAttemptId: string;
  discoveryOrder: number;
  noFollow: boolean;
};

export type LinkDiscoveryResult = {
  sourceChecksumSha256: string;
  parentTaskId: string;
  parentAttemptId: string;
  links: ReadonlyArray<DiscoveredLink>;
  summary: {
    scannedAnchorCount: number;
    discoveredCount: number;
    skippedMalformedCount: number;
    skippedUnsafeCount: number;
    skippedSensitiveCount: number;
    skippedUnsupportedCount: number;
    truncated: boolean;
  };
};

export type LinkDiscoveryInput = {
  scope: ExtractionScope;
  baseUrl: string;
  document: Pick<CleanHtmlDocument, 'cleanHtml' | 'cleanedChecksumSha256'>;
  maxLinks?: number;
};

export class LinkDiscoveryError extends Error {
  public constructor(public readonly code: 'LINK_DISCOVERY_INVALID', message: string) {
    super(message);
    this.name = 'LinkDiscoveryError';
  }
}

const MAX_LINKS = 1_000;
const SENSITIVE_QUERY_KEY = /authorization|cookie|credential|password|secret|token|session|api[_-]?key/i;

/**
 * Extracts candidates from already-cleaned transient HTML only. It makes no
 * network request, does not enqueue a frontier entry and exposes no raw DOM.
 */
export function discoverLinks(input: LinkDiscoveryInput): LinkDiscoveryResult {
  assertScope(input.scope);
  const baseUrl = safeUrl(input.baseUrl);
  if (!/^[a-f0-9]{64}$/i.test(input.document.cleanedChecksumSha256)) {
    throw new LinkDiscoveryError('LINK_DISCOVERY_INVALID', 'Clean HTML source checksum geçerli değil.');
  }
  if (typeof input.document.cleanHtml !== 'string' || Buffer.byteLength(input.document.cleanHtml, 'utf8') > 750_000) {
    throw new LinkDiscoveryError('LINK_DISCOVERY_INVALID', 'Clean HTML discovery input limitini aşıyor.');
  }
  const maxLinks = input.maxLinks ?? 100;
  if (!Number.isInteger(maxLinks) || maxLinks < 1 || maxLinks > MAX_LINKS) {
    throw new LinkDiscoveryError('LINK_DISCOVERY_INVALID', 'maxLinks 1 ila 1000 arasında olmalıdır.');
  }

  const links: DiscoveredLink[] = [];
  let scannedAnchorCount = 0;
  let skippedMalformedCount = 0;
  let skippedUnsafeCount = 0;
  let skippedSensitiveCount = 0;
  let skippedUnsupportedCount = 0;
  let truncated = false;
  const $ = load(input.document.cleanHtml);
  $('a[href]').each((_index, element) => {
    scannedAnchorCount += 1;
    if (links.length >= maxLinks) {
      truncated = true;
      return;
    }
    const href = $(element).attr('href')?.trim() ?? '';
    if (href.length === 0 || /^(javascript:|data:|mailto:|tel:|#)/i.test(href)) {
      skippedUnsupportedCount += 1;
      return;
    }
    let resolved: string;
    try {
      resolved = new URL(href, baseUrl).toString();
    } catch {
      skippedMalformedCount += 1;
      return;
    }
    if (hasSensitiveQuery(resolved)) {
      skippedSensitiveCount += 1;
      return;
    }
    try {
      safeUrl(resolved);
    } catch {
      skippedUnsafeCount += 1;
      return;
    }
    links.push({
      resolvedUrl: resolved,
      sourceKind: 'HTML_ANCHOR',
      sourceChecksumSha256: input.document.cleanedChecksumSha256,
      parentTaskId: input.scope.taskId,
      parentAttemptId: input.scope.attemptId,
      discoveryOrder: links.length,
      noFollow: $(element).attr('rel')?.split(/\s+/).some((token) => token.toLowerCase() === 'nofollow') ?? false
    });
  });
  return {
    sourceChecksumSha256: input.document.cleanedChecksumSha256,
    parentTaskId: input.scope.taskId,
    parentAttemptId: input.scope.attemptId,
    links,
    summary: {
      scannedAnchorCount,
      discoveredCount: links.length,
      skippedMalformedCount,
      skippedUnsafeCount,
      skippedSensitiveCount,
      skippedUnsupportedCount,
      truncated
    }
  };
}

function safeUrl(value: string): string {
  try {
    return assertSafeOutboundUrl(value).url;
  } catch {
    throw new LinkDiscoveryError('LINK_DISCOVERY_INVALID', 'URL güvenli HTTP(S) hedefi olmalıdır.');
  }
}

function hasSensitiveQuery(value: string): boolean {
  const query = new URL(value).searchParams;
  return [...query.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key));
}

function assertScope(scope: ExtractionScope): void {
  if (Object.values(scope).some((value) => !/^[A-Za-z0-9._:-]{1,128}$/.test(value))) {
    throw new LinkDiscoveryError('LINK_DISCOVERY_INVALID', 'Link discovery scope geçerli değil.');
  }
}

export function linkDiscoveryFingerprint(result: LinkDiscoveryResult): string {
  return createHash('sha256').update(JSON.stringify({
    sourceChecksumSha256: result.sourceChecksumSha256,
    parentTaskId: result.parentTaskId,
    parentAttemptId: result.parentAttemptId,
    links: result.links.map((link) => ({ resolvedUrl: link.resolvedUrl, noFollow: link.noFollow, discoveryOrder: link.discoveryOrder }))
  })).digest('hex');
}
