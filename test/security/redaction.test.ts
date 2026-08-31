import { describe, expect, it } from 'vitest';

import { redactSecrets } from '../../src/security/redaction.js';


describe('secret redaction', () => {
  it('redacts credentials, session material and token-like keys recursively', () => {
    const sanitized = redactSecrets({
      Authorization: 'Bearer raw-access-token',
      Cookie: 'sid=raw-cookie',
      token: 'raw-token',
      session: 'raw-session',
      clientSecret: 'raw-client-secret',
      nested: {
        password: 'raw-password',
        apiKey: 'raw-api-key',
        safeValue: 'keep-me'
      },
      array: [{ secret: 'raw-secret' }, { name: 'safe-name' }]
    });

    expect(sanitized).toEqual({
      Authorization: '[REDACTED]',
      Cookie: '[REDACTED]',
      token: '[REDACTED]',
      session: '[REDACTED]',
      clientSecret: '[REDACTED]',
      nested: {
        password: '[REDACTED]',
        apiKey: '[REDACTED]',
        safeValue: 'keep-me'
      },
      array: [{ secret: '[REDACTED]' }, { name: 'safe-name' }]
    });
  });

  it('retains safe primitive values and redacts sensitive array values', () => {
    expect(redactSecrets({
      count: 3,
      enabled: true,
      empty: null,
      tags: ['public', 'safe'],
      sessions: ['raw-session-a', 'raw-session-b']
    })).toEqual({
      count: 3,
      enabled: true,
      empty: null,
      tags: ['public', 'safe'],
      sessions: '[REDACTED]'
    });
  });
});
