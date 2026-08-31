import type { SafeTraceSpan, TraceContext, TraceContextRegistry, TraceScope } from './trace-context.js';

export type ObservableComponent = 'API' | 'QUEUE' | 'WORKER' | 'PROXY' | 'EXTRACTION' | 'STORAGE';

export type ComponentOperation =
  | 'api.request'
  | 'queue.publish'
  | 'queue.consume'
  | 'worker.execute'
  | 'proxy.acquire'
  | 'proxy.release'
  | 'extraction.execute'
  | 'storage.read'
  | 'storage.write';

export type ComponentTraceBindingRequest = {
  component: ObservableComponent;
  operation: ComponentOperation;
  scope: TraceScope;
  correlationId: string;
  startedAt: string;
  parent?: TraceContext;
};

export type ComponentTraceBinding = {
  component: ObservableComponent;
  operation: ComponentOperation;
  context: TraceContext;
};

export type ComponentTraceResult = 'SUCCESS' | 'FAILURE' | 'BLOCKED';

export class ComponentTraceBindingError extends Error {
  public constructor(public readonly code: 'TRACE_BINDING_INVALID' | 'TRACE_BINDING_SCOPE_MISMATCH', message: string) {
    super(message);
    this.name = 'ComponentTraceBindingError';
  }
}

const OPERATIONS: Readonly<Record<ObservableComponent, ReadonlyArray<ComponentOperation>>> = {
  API: ['api.request'],
  QUEUE: ['queue.publish', 'queue.consume'],
  WORKER: ['worker.execute'],
  PROXY: ['proxy.acquire', 'proxy.release'],
  EXTRACTION: ['extraction.execute'],
  STORAGE: ['storage.read', 'storage.write']
};

/**
 * Component-aware adapter over TraceContextRegistry. It maps only known
 * operation names to safe attributes; it does not patch callers, read raw
 * payloads, export telemetry, enqueue messages, or access external services.
 */
export class ComponentTraceBindings {
  public constructor(private readonly traces: TraceContextRegistry) {}

  public start(request: ComponentTraceBindingRequest): ComponentTraceBinding {
    validateRequest(request);
    if (request.parent !== undefined && !sameScope(request.scope, request.parent)) {
      throw new ComponentTraceBindingError('TRACE_BINDING_SCOPE_MISMATCH', 'Parent trace component binding scope ile eşleşmiyor.');
    }
    const name = request.operation;
    const attributes = [{ key: 'component' as const, value: request.component.toLowerCase() }, { key: 'operation.name' as const, value: request.operation }];
    const context = request.parent === undefined
      ? this.traces.startRoot(request.scope, request.correlationId, name, request.startedAt, attributes)
      : this.traces.startChild(request.parent, name, request.startedAt, attributes);
    return { component: request.component, operation: request.operation, context };
  }

  public end(binding: ComponentTraceBinding, endedAt: string, result: ComponentTraceResult): SafeTraceSpan {
    validateBinding(binding);
    if (!['SUCCESS', 'FAILURE', 'BLOCKED'].includes(result)) throw invalid();
    return this.traces.end(binding.context, endedAt, result === 'SUCCESS' ? 'OK' : 'ERROR', [
      { key: 'outcome', value: result }
    ]);
  }
}

function validateRequest(request: ComponentTraceBindingRequest): void {
  if (!OPERATIONS[request.component]?.includes(request.operation) || !request.correlationId || !Number.isFinite(Date.parse(request.startedAt))) throw invalid();
}

function validateBinding(binding: ComponentTraceBinding): void {
  if (!OPERATIONS[binding.component]?.includes(binding.operation) || binding.context === undefined) throw invalid();
}

function sameScope(left: TraceScope, right: TraceScope): boolean {
  return left.tenantId === right.tenantId && left.jobId === right.jobId && left.taskId === right.taskId && left.attemptId === right.attemptId;
}

function invalid(): ComponentTraceBindingError {
  return new ComponentTraceBindingError('TRACE_BINDING_INVALID', 'Component trace binding input geçerli değil.');
}
