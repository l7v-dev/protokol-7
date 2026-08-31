import { describe, expect, it } from 'vitest';

import { ComponentTraceBindingError, ComponentTraceBindings } from '../../src/observability/component-trace-bindings.js';
import { TraceContextRegistry } from '../../src/observability/trace-context.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };

describe('component trace bindings', () => {
  it('binds all supported component surfaces to one safe trace/correlation lineage', () => {
    const bindings = new ComponentTraceBindings(new TraceContextRegistry());
    const api = bindings.start({ component: 'API', operation: 'api.request', scope, correlationId: 'corr_1', startedAt: '2026-08-27T00:00:00.000Z' });
    const queuePublish = bindings.start({ component: 'QUEUE', operation: 'queue.publish', scope, correlationId: 'corr_1', parent: api.context, startedAt: '2026-08-27T00:00:01.000Z' });
    const queueConsume = bindings.start({ component: 'QUEUE', operation: 'queue.consume', scope, correlationId: 'corr_1', parent: queuePublish.context, startedAt: '2026-08-27T00:00:02.000Z' });
    const worker = bindings.start({ component: 'WORKER', operation: 'worker.execute', scope, correlationId: 'corr_1', parent: queueConsume.context, startedAt: '2026-08-27T00:00:03.000Z' });
    const proxy = bindings.start({ component: 'PROXY', operation: 'proxy.acquire', scope, correlationId: 'corr_1', parent: worker.context, startedAt: '2026-08-27T00:00:04.000Z' });
    const extraction = bindings.start({ component: 'EXTRACTION', operation: 'extraction.execute', scope, correlationId: 'corr_1', parent: proxy.context, startedAt: '2026-08-27T00:00:05.000Z' });
    const storage = bindings.start({ component: 'STORAGE', operation: 'storage.write', scope, correlationId: 'corr_1', parent: extraction.context, startedAt: '2026-08-27T00:00:06.000Z' });

    for (const binding of [api, queuePublish, queueConsume, worker, proxy, extraction, storage]) {
      expect(binding.context).toMatchObject({ traceId: api.context.traceId, correlationId: 'corr_1', tenantId: 'tenant_1' });
    }
    expect(storage.context.parentSpanId).toBe(extraction.context.spanId);
  });

  it('emits only allowlisted component/operation/outcome attributes when a binding completes', () => {
    const bindings = new ComponentTraceBindings(new TraceContextRegistry());
    const binding = bindings.start({ component: 'WORKER', operation: 'worker.execute', scope, correlationId: 'corr_1', startedAt: '2026-08-27T00:00:00.000Z' });
    const span = bindings.end(binding, '2026-08-27T00:00:10.000Z', 'FAILURE');

    expect(span).toMatchObject({ name: 'worker.execute', status: 'ERROR', durationMs: 10000, attributes: [{ key: 'component', value: 'worker' }, { key: 'operation.name', value: 'worker.execute' }, { key: 'outcome', value: 'FAILURE' }] });
    expect(JSON.stringify(span)).not.toContain('payload');
  });

  it('rejects component-operation mismatch, parent scope mismatch and unknown result fail-closed', () => {
    const registry = new TraceContextRegistry();
    const bindings = new ComponentTraceBindings(registry);
    const api = bindings.start({ component: 'API', operation: 'api.request', scope, correlationId: 'corr_1', startedAt: '2026-08-27T00:00:00.000Z' });

    expect(() => bindings.start({ component: 'API', operation: 'queue.publish', scope, correlationId: 'corr_1', startedAt: '2026-08-27T00:00:01.000Z' })).toThrow(ComponentTraceBindingError);
    expect(() => bindings.start({ component: 'QUEUE', operation: 'queue.publish', scope: { ...scope, tenantId: 'tenant_2' }, correlationId: 'corr_1', parent: api.context, startedAt: '2026-08-27T00:00:01.000Z' })).toThrowError(expect.objectContaining({ code: 'TRACE_BINDING_SCOPE_MISMATCH' }));
    expect(() => bindings.end(api, '2026-08-27T00:00:01.000Z', 'RETRY' as never)).toThrow(ComponentTraceBindingError);
  });
});
