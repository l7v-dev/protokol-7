import { randomBytes } from 'node:crypto';

export const TRACE_CONTEXT_CONTRACT_VERSION = 'trace-context/v1' as const;

export type TraceScope = {
  tenantId: string;
  jobId?: string;
  taskId?: string;
  attemptId?: string;
};

export type TraceContext = TraceScope & {
  contractVersion: typeof TRACE_CONTEXT_CONTRACT_VERSION;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  correlationId: string;
  traceFlags: '01';
};

export type TraceCarrier = {
  traceparent: string;
  'x-correlation-id': string;
};

export type TraceAttribute = {
  key: 'service.name' | 'component' | 'operation.name' | 'outcome' | 'error.code' | 'retryable';
  value: string | boolean;
};

export type SafeTraceSpan = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  correlationId: string;
  tenantId: string;
  jobId?: string;
  taskId?: string;
  attemptId?: string;
  name: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'OPEN' | 'OK' | 'ERROR';
  attributes: ReadonlyArray<TraceAttribute>;
};

export class TraceContextError extends Error {
  public constructor(public readonly code: 'TRACE_CONTEXT_INVALID' | 'TRACE_CONTEXT_SCOPE_MISMATCH' | 'TRACE_CONTEXT_CONFLICT' | 'TRACE_CONTEXT_NOT_FOUND', message: string) {
    super(message);
    this.name = 'TraceContextError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TRACE_ID = /^[a-f0-9]{32}$/;
const SPAN_ID = /^[a-f0-9]{16}$/;
const SPAN_NAME = /^[a-z][a-z0-9_.-]{0,127}$/;
const MAX_SPANS_PER_TENANT = 10_000;
const MAX_ATTRIBUTES = 6;

/**
 * In-memory reference for OpenTelemetry-style context propagation. It creates
 * safe trace metadata only; it does not initialize an SDK, export spans, emit
 * arbitrary headers, or inspect payloads, URLs, credentials, or raw errors.
 */
export class TraceContextRegistry {
  private readonly spans = new Map<string, SafeTraceSpan>();
  private readonly tenantSpanCounts = new Map<string, number>();

  public startRoot(scope: TraceScope, correlationId: string, name: string, startedAt: string, attributes: ReadonlyArray<TraceAttribute> = []): TraceContext {
    validateScope(scope);
    validateId(correlationId);
    validateSpanInput(name, startedAt, attributes);
    const context: TraceContext = {
      contractVersion: TRACE_CONTEXT_CONTRACT_VERSION,
      ...scope,
      traceId: randomHex(16),
      spanId: randomHex(8),
      correlationId,
      traceFlags: '01'
    };
    this.storeOpenSpan(context, name, startedAt, attributes);
    return cloneContext(context);
  }

  public startChild(parent: TraceContext, name: string, startedAt: string, attributes: ReadonlyArray<TraceAttribute> = []): TraceContext {
    validateContext(parent);
    validateSpanInput(name, startedAt, attributes);
    this.requireSpan(parent, parent.spanId);
    const context: TraceContext = { ...parent, parentSpanId: parent.spanId, spanId: randomHex(8) };
    this.storeOpenSpan(context, name, startedAt, attributes);
    return cloneContext(context);
  }

  public end(context: TraceContext, endedAt: string, status: 'OK' | 'ERROR', attributes: ReadonlyArray<TraceAttribute> = []): SafeTraceSpan {
    validateContext(context);
    if (!['OK', 'ERROR'].includes(status) || !isTime(endedAt)) throw invalid();
    validateAttributes(attributes);
    const stored = this.requireSpan(context, context.spanId);
    if (stored.status !== 'OPEN') {
      if (stored.status === status && stored.endedAt === endedAt && sameAttributes(stored.attributes, [...stored.attributes, ...attributes])) return cloneSpan(stored);
      throw new TraceContextError('TRACE_CONTEXT_CONFLICT', 'Tamamlanan span farklı içerikle tekrar sonlandırılamaz.');
    }
    const durationMs = Date.parse(endedAt) - Date.parse(stored.startedAt);
    if (durationMs < 0) throw invalid();
    const mergedAttributes = mergeAttributes(stored.attributes, attributes);
    const completed: SafeTraceSpan = { ...stored, status, endedAt, durationMs, attributes: mergedAttributes };
    this.spans.set(spanKey(context), completed);
    return cloneSpan(completed);
  }

  public carrier(context: TraceContext): TraceCarrier {
    validateContext(context);
    this.requireSpan(context, context.spanId);
    return { traceparent: `00-${context.traceId}-${context.spanId}-${context.traceFlags}`, 'x-correlation-id': context.correlationId };
  }

  public get(scope: TraceScope, traceId: string, spanId: string): SafeTraceSpan | null {
    validateScope(scope);
    validateTraceId(traceId);
    validateSpanId(spanId);
    const span = this.spans.get(`${traceId}:${spanId}`);
    if (!span) return null;
    if (!sameScope(span, scope)) throw new TraceContextError('TRACE_CONTEXT_SCOPE_MISMATCH', 'Trace span tenant/job scope ile eşleşmiyor.');
    return cloneSpan(span);
  }

  private storeOpenSpan(context: TraceContext, name: string, startedAt: string, attributes: ReadonlyArray<TraceAttribute>): void {
    const used = this.tenantSpanCounts.get(context.tenantId) ?? 0;
    if (used >= MAX_SPANS_PER_TENANT) throw new TraceContextError('TRACE_CONTEXT_CONFLICT', 'Tenant trace span limiti aşıldı.');
    const key = spanKey(context);
    if (this.spans.has(key)) throw new TraceContextError('TRACE_CONTEXT_CONFLICT', 'Trace span kimliği çakıştı.');
    this.spans.set(key, {
      traceId: context.traceId,
      spanId: context.spanId,
      ...(context.parentSpanId === undefined ? {} : { parentSpanId: context.parentSpanId }),
      correlationId: context.correlationId,
      tenantId: context.tenantId,
      ...(context.jobId === undefined ? {} : { jobId: context.jobId }),
      ...(context.taskId === undefined ? {} : { taskId: context.taskId }),
      ...(context.attemptId === undefined ? {} : { attemptId: context.attemptId }),
      name,
      startedAt,
      status: 'OPEN',
      attributes: mergeAttributes([], attributes)
    });
    this.tenantSpanCounts.set(context.tenantId, used + 1);
  }

  private requireSpan(context: TraceContext, spanId: string): SafeTraceSpan {
    const span = this.spans.get(`${context.traceId}:${spanId}`);
    if (!span) throw new TraceContextError('TRACE_CONTEXT_NOT_FOUND', 'Trace span bulunamadı.');
    if (!sameScope(span, context)) throw new TraceContextError('TRACE_CONTEXT_SCOPE_MISMATCH', 'Trace span tenant/job scope ile eşleşmiyor.');
    return span;
  }
}

function validateContext(context: TraceContext): void {
  if (context.contractVersion !== TRACE_CONTEXT_CONTRACT_VERSION || !validateScopeBoolean(context) || !TRACE_ID.test(context.traceId) || !SPAN_ID.test(context.spanId)
    || (context.parentSpanId !== undefined && !SPAN_ID.test(context.parentSpanId)) || !SAFE_ID.test(context.correlationId) || context.traceFlags !== '01') throw invalid();
}

function validateScope(scope: TraceScope): void {
  if (!validateScopeBoolean(scope)) throw invalid();
}

function validateScopeBoolean(scope: TraceScope): boolean {
  return SAFE_ID.test(scope.tenantId)
    && (scope.jobId === undefined || SAFE_ID.test(scope.jobId))
    && (scope.taskId === undefined || SAFE_ID.test(scope.taskId))
    && (scope.attemptId === undefined || SAFE_ID.test(scope.attemptId));
}

function validateSpanInput(name: string, startedAt: string, attributes: ReadonlyArray<TraceAttribute>): void {
  if (!SPAN_NAME.test(name) || !isTime(startedAt)) throw invalid();
  validateAttributes(attributes);
}

function validateAttributes(attributes: ReadonlyArray<TraceAttribute>): void {
  if (attributes.length > MAX_ATTRIBUTES || new Set(attributes.map((attribute) => attribute.key)).size !== attributes.length) throw invalid();
  for (const attribute of attributes) {
    if (!['service.name', 'component', 'operation.name', 'outcome', 'error.code', 'retryable'].includes(attribute.key)
      || (typeof attribute.value !== 'string' && typeof attribute.value !== 'boolean')
      || (typeof attribute.value === 'string' && (!SAFE_ID.test(attribute.value) || attribute.value.length > 128))) throw invalid();
  }
}

function mergeAttributes(existing: ReadonlyArray<TraceAttribute>, extra: ReadonlyArray<TraceAttribute>): ReadonlyArray<TraceAttribute> {
  const merged = [...existing, ...extra];
  if (merged.length > MAX_ATTRIBUTES || new Set(merged.map((attribute) => attribute.key)).size !== merged.length) throw invalid();
  return merged.map((attribute) => ({ ...attribute }));
}

function sameAttributes(left: ReadonlyArray<TraceAttribute>, right: ReadonlyArray<TraceAttribute>): boolean {
  return left.length === right.length && left.every((item, index) => item.key === right[index]?.key && item.value === right[index]?.value);
}

function sameScope(span: SafeTraceSpan, scope: TraceScope): boolean {
  return span.tenantId === scope.tenantId && span.jobId === scope.jobId && span.taskId === scope.taskId && span.attemptId === scope.attemptId;
}

function spanKey(context: Pick<TraceContext, 'traceId' | 'spanId'>): string {
  return `${context.traceId}:${context.spanId}`;
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw invalid();
}

function validateTraceId(value: string): void {
  if (!TRACE_ID.test(value)) throw invalid();
}

function validateSpanId(value: string): void {
  if (!SPAN_ID.test(value)) throw invalid();
}

function isTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function cloneContext(context: TraceContext): TraceContext {
  return { ...context };
}

function cloneSpan(span: SafeTraceSpan): SafeTraceSpan {
  return { ...span, attributes: span.attributes.map((attribute) => ({ ...attribute })) };
}

function invalid(): TraceContextError {
  return new TraceContextError('TRACE_CONTEXT_INVALID', 'Trace context veya instrumentation input geçerli değil.');
}
