import { isIP } from 'node:net';

import { ApiError } from '../shared/http.js';

export type SafeOutboundUrl = {
  url: string;
  protocol: 'http:' | 'https:';
  hostname: string;
  port: number;
};

export function assertSafeOutboundUrl(rawUrl: string, allowedHosts: string[] = []): SafeOutboundUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw policyError('TARGET_URL_INVALID', 'Target URL geçerli değil.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw policyError('TARGET_PROTOCOL_NOT_ALLOWED', 'Yalnızca HTTP ve HTTPS hedefleri desteklenir.');
  }

  if (parsed.username || parsed.password) {
    throw policyError('TARGET_CREDENTIALS_IN_URL', 'URL içinde kullanıcı adı veya parola kullanılamaz.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  const normalizedAllowedHosts = allowedHosts.map((host) => host.toLowerCase().replace(/^\[|\]$/g, ''));

  if (normalizedAllowedHosts.length > 0 && !normalizedAllowedHosts.includes(hostname)) {
    throw policyError('TARGET_HOST_NOT_ALLOWED', 'Target host allowlist içinde değil.');
  }

  if (isPrivateHostname(hostname)) {
    throw policyError('PRIVATE_TARGET_BLOCKED', 'Private, loopback veya link-local hedeflere erişim engellendi.');
  }

  return {
    url: parsed.toString(),
    protocol: parsed.protocol === 'http:' ? 'http:' : 'https:',
    hostname,
    port
  };
}

export function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === 'metadata.google.internal'
  ) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const octets = normalized.split('.').map(Number);
    const first = octets[0] ?? -1;
    const second = octets[1] ?? -1;
    return first === 10
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || first === 127
      || (first === 169 && second === 254)
      || first === 0;
  }

  if (ipVersion === 6) {
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice('::ffff:'.length);
      if (mapped.includes('.')) {
        return isPrivateHostname(mapped);
      }

      const groups = mapped.split(':');
      if (groups.length === 2 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
        const high = Number.parseInt(groups[0] ?? '0', 16);
        const low = Number.parseInt(groups[1] ?? '0', 16);
        const ipv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
        return isPrivateHostname(ipv4);
      }
    }

    return normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe80:');
  }

  return false;
}

function policyError(code: string, message: string): ApiError {
  return new ApiError({
    statusCode: 422,
    code,
    category: 'POLICY',
    message,
    retryable: false
  });
}
