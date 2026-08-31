const SECRET_KEYS = new Set([
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'password',
  'secret',
  'setcookie',
  'session',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey'
]);

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      isSecretKey(key) ? '[REDACTED]' : redactSecrets(child)
    ])
  );
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_]/g, '');
  return SECRET_KEYS.has(normalized)
    || normalized.includes('authorization')
    || normalized.includes('cookie')
    || normalized.includes('credential')
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('session')
    || normalized.includes('token');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
