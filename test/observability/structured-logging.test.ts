import { describe, expect, it } from 'vitest';

import { StructuredLogError, StructuredLogRouter } from '../../src/observability/structured-logging.js';

const router = new StructuredLogRouter();
const trace = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), correlationId: 'correlation_1' };
const base = {
  occurredAt: '2026-08-27T00:00:00.000Z', component: 'WORKER' as const, operation: 'worker.execute' as const,
  scope: { tenantId: 'tenant_1' }, trace
};

describe('structured log schema, redaction and routing', () => {
  it('projects safe structured records onto deterministic operational, security and failure routes', () => {
    const success = router.create({ ...base, level: 'INFO', event: 'OPERATION_COMPLETED', outcome: 'SUCCESS', attributes: { durationMs: 123, retryable: false } });
    const blocked = router.create({ ...base, level: 'WARN', event: 'POLICY_DECISION', outcome: 'BLOCKED', errorCode: 'POLICY_BLOCKED' });
    const failure = router.create({ ...base, level: 'ERROR', event: 'DEPENDENCY_FAILURE', outcome: 'FAILURE', errorCode: 'TIMEOUT', attributes: { httpStatusCode: 504 } });

    expect(success).toMatchObject({ route: 'OPERATIONS', attributes: { durationMs: 123, retryable: false }, trace });
    expect(blocked).toMatchObject({ route: 'SECURITY', errorCode: 'POLICY_BLOCKED' });
    expect(failure).toMatchObject({ route: 'FAILURES', errorCode: 'TIMEOUT', attributes: { httpStatusCode: 504 } });
  });

  it('drops arbitrary and secret-bearing attributes instead of exposing their keys or values', () => {
    const record = router.create({
      ...base, level: 'INFO', event: 'OPERATION_COMPLETED', outcome: 'SUCCESS',
      attributes: { durationMs: 5, authorization: 'Bearer raw-secret', cookie: 'sid=raw-cookie', payload: { token: 'raw-token' }, targetUrl: 'https://private.example/path' }
    });

    expect(record.attributes).toEqual({ durationMs: 5 });
    expect(record.redaction.droppedAttributeCount).toBe(4);
    expect(JSON.stringify(record)).not.toContain('raw-secret');
    expect(JSON.stringify(record)).not.toContain('raw-cookie');
    expect(JSON.stringify(record)).not.toContain('raw-token');
    expect(JSON.stringify(record)).not.toContain('private.example');
  });

  it('rejects malformed scope/trace, invalid component operations and outcome-severity-code conflicts fail-closed', () => {
    expect(() => router.create({ ...base, level: 'INFO', event: 'OPERATION_COMPLETED', outcome: 'SUCCESS', operation: 'storage.write' as never })).toThrow(StructuredLogError);
    expect(() => router.create({ ...base, scope: { tenantId: 'bad tenant' }, level: 'INFO', event: 'OPERATION_COMPLETED', outcome: 'SUCCESS' })).toThrow(StructuredLogError);
    expect(() => router.create({ ...base, trace: { ...trace, traceId: 'bad' }, level: 'INFO', event: 'OPERATION_COMPLETED', outcome: 'SUCCESS' })).toThrow(StructuredLogError);
    expect(() => router.create({ ...base, level: 'ERROR', event: 'OPERATION_COMPLETED', outcome: 'SUCCESS' })).toThrow(StructuredLogError);
    expect(() => router.create({ ...base, level: 'WARN', event: 'POLICY_DECISION', outcome: 'BLOCKED', errorCode: 'TIMEOUT' })).toThrow(StructuredLogError);
  });
});
