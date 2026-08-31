import { describe, expect, it } from 'vitest';

import { TraceContextError, TraceContextRegistry } from '../../src/observability/trace-context.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };

describe('OpenTelemetry-style trace context and instrumentation contract', () => {
  it('propagates root/child trace identity in W3C carrier form and preserves tenant/job correlation', () => {
    const registry = new TraceContextRegistry();
    const root = registry.startRoot(scope, 'correlation_1', 'http.request', '2026-08-27T00:00:00.000Z', [{ key: 'service.name', value: 'api' }]);
    const child = registry.startChild(root, 'queue.publish', '2026-08-27T00:00:01.000Z', [{ key: 'component', value: 'queue' }]);
    const carrier = registry.carrier(child);

    expect(root.traceId).toMatch(/^[a-f0-9]{32}$/);
    expect(child).toMatchObject({ traceId: root.traceId, parentSpanId: root.spanId, correlationId: 'correlation_1', tenantId: 'tenant_1', jobId: 'job_1' });
    expect(carrier).toEqual({ traceparent: expect.stringMatching(/^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/), 'x-correlation-id': 'correlation_1' });
  });

  it('records bounded allowlisted attributes and immutable, safe completed span projection', () => {
    const registry = new TraceContextRegistry();
    const root = registry.startRoot(scope, 'correlation_1', 'worker.execute', '2026-08-27T00:00:00.000Z', [{ key: 'operation.name', value: 'extract' }]);
    const completed = registry.end(root, '2026-08-27T00:00:15.000Z', 'ERROR', [{ key: 'error.code', value: 'HTTP_TIMEOUT' }, { key: 'retryable', value: true }]);
    const fetched = registry.get(scope, root.traceId, root.spanId);

    expect(completed).toMatchObject({ status: 'ERROR', durationMs: 15000, tenantId: 'tenant_1', attributes: [{ key: 'operation.name', value: 'extract' }, { key: 'error.code', value: 'HTTP_TIMEOUT' }, { key: 'retryable', value: true }] });
    expect(fetched).toEqual(completed);
    expect(JSON.stringify(completed)).not.toContain('authorization');
  });

  it('rejects malformed/sensitive attributes, scope mismatch, time reversal and conflicting span end fail-closed', () => {
    const registry = new TraceContextRegistry();
    expect(() => registry.startRoot(scope, 'correlation_1', 'invalid name', '2026-08-27T00:00:00.000Z')).toThrow(TraceContextError);
    const root = registry.startRoot(scope, 'correlation_1', 'http.request', '2026-08-27T00:00:00.000Z');
    expect(() => registry.end(root, '2026-08-26T00:00:00.000Z', 'ERROR')).toThrow(TraceContextError);
    registry.end(root, '2026-08-27T00:00:01.000Z', 'OK');
    expect(() => registry.end(root, '2026-08-27T00:00:02.000Z', 'OK')).toThrowError(expect.objectContaining({ code: 'TRACE_CONTEXT_CONFLICT' }));
    expect(() => registry.get({ ...scope, tenantId: 'tenant_2' }, root.traceId, root.spanId)).toThrowError(expect.objectContaining({ code: 'TRACE_CONTEXT_SCOPE_MISMATCH' }));
    expect(() => registry.startRoot(scope, 'correlation_2', 'http.request', '2026-08-27T00:00:00.000Z', [{ key: 'authorization' as 'component', value: 'Bearer_secret' }])).toThrow(TraceContextError);
  });
});
