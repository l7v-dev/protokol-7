import { createHash } from 'node:crypto';

import { assertSafeOutboundUrl } from '../security/egress-policy.js';

export type UrlCanonicalizationOptions = {
  ignoredQueryParamNames?: ReadonlyArray<string>;
};

export type CanonicalUrl = {
  canonicalUrl: string;
  fingerprintSha256: string;
};

export class UrlIdentityError extends Error {
  public constructor(public readonly code: 'URL_IDENTITY_INVALID', message: string) {
    super(message);
    this.name = 'UrlIdentityError';
  }
}

const MAX_IGNORED_QUERY_PARAMS = 50;
const SAFE_QUERY_PARAM = /^[A-Za-z0-9._~-]{1,128}$/;

/**
 * Produces a conservative crawl identity. It normalizes only web-standard
 * equivalences and explicitly configured query keys; it never fetches a URL.
 */
export function canonicalizeCrawlUrl(rawUrl: string, options: UrlCanonicalizationOptions = {}): CanonicalUrl {
  const ignored = normalizedIgnoredQueryParams(options.ignoredQueryParamNames ?? []);
  let parsed: URL;
  try {
    parsed = new URL(assertSafeOutboundUrl(rawUrl).url);
  } catch {
    throw new UrlIdentityError('URL_IDENTITY_INVALID', 'Canonical URL güvenli HTTP(S) hedefi olmalıdır.');
  }
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
    parsed.port = '';
  }
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !ignored.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  parsed.search = '';
  for (const [key, value] of params) parsed.searchParams.append(key, value);
  const canonicalUrl = parsed.toString();
  return { canonicalUrl, fingerprintSha256: sha256(canonicalUrl) };
}

function normalizedIgnoredQueryParams(values: ReadonlyArray<string>): Set<string> {
  if (values.length > MAX_IGNORED_QUERY_PARAMS || values.some((value) => !SAFE_QUERY_PARAM.test(value))) {
    throw new UrlIdentityError('URL_IDENTITY_INVALID', 'Ignored query parameter tanımı geçerli değil.');
  }
  return new Set(values.map((value) => value.toLowerCase()));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
