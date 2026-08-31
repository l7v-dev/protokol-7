import type { ComponentOperation, ComponentTraceResult, ObservableComponent } from './component-trace-bindings.js';
import { redactSecrets } from '../security/redaction.js';

export const STRUCTURED_LOG_CONTRACT_VERSION = 'structured-log/v1' as const;

export type StructuredLogLevel = 'INFO' | 'WARN' | 'ERROR';
export type StructuredLogRoute = 'OPERATIONS' | 'SECURITY' | 'FAILURES';
export type StructuredLogEventName = 'OPERATION_COMPLETED' | 'POLICY_DECISION' | 'DEPENDENCY_FAILURE';
export type StructuredLogErrorCode = 'DEPENDENCY_UNAVAILABLE' | 'INTERNAL_ERROR' | 'POLICY_BLOCKED' | 'TIMEOUT' | 'VALIDATION_FAILED';

export type StructuredLogInput = {
  occurredAt: string;
  level: StructuredLogLevel;
  event: StructuredLogEventName;
  component: ObservableComponent;
  operation: ComponentOperation;
  outcome: ComponentTraceResult;
  scope: { tenantId: string };
  trace?: { traceId: string; spanId: string; correlationId: string };
  errorCode?: StructuredLogErrorCode;
  attributes?: unknown;
};

export type StructuredLogRecord = {
  contractVersion: typeof STRUCTURED_LOG_CONTRACT_VERSION;
  occurredAt: string;
  level: StructuredLogLevel;
  route: StructuredLogRoute;
  event: StructuredLogEventName;
  component: ObservableComponent;
  operation: ComponentOperation;
  outcome: ComponentTraceResult;
  scope: { tenantId: string };
  trace?: { traceId: string; spanId: string; correlationId: string };
  errorCode?: StructuredLogErrorCode;
  attributes: Readonly<{
    durationMs?: number;
    httpStatusCode?: number;
    recordsCount?: number;
    redactedFieldCount?: number;
    retryable?: boolean;
  }>;
  redaction: { droppedAttributeCount: number };
};

export class StructuredLogError extends Error {
  public constructor(public readonly code: 'STRUCTURED_LOG_INVALID', message: string) {
    super(message);
    this.name = 'StructuredLogError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const TRACE_ID = /^[a-f0-9]{32}$/;
const SPAN_ID = /^[a-f0-9]{16}$/;
const OPERATIONS: Readonly<Record<ObservableComponent, ReadonlyArray<ComponentOperation>>> = {
  API: ['api.request'],
  QUEUE: ['queue.publish', 'queue.consume'],
  WORKER: ['worker.execute'],
  PROXY: ['proxy.acquire', 'proxy.release'],
  EXTRACTION: ['extraction.execute'],
  STORAGE: ['storage.read', 'storage.write']
};

/**
 * Creates bounded, secret-safe records for a downstream logger. This reference
 * contract has no sink I/O, Pino patching, persistence, HTTP export or routing
 * side effects; callers may emit only the returned safe record.
 */
export class StructuredLogRouter {
  public create(input: StructuredLogInput): StructuredLogRecord {
    validateInput(input);
    const redacted = normalizeAttributes(input.attributes);
    return {
      contractVersion: STRUCTURED_LOG_CONTRACT_VERSION,
      occurredAt: input.occurredAt,
      level: input.level,
      route: selectRoute(input.outcome),
      event: input.event,
      component: input.component,
      operation: input.operation,
      outcome: input.outcome,
      scope: { tenantId: input.scope.tenantId },
      ...(input.trace === undefined ? {} : { trace: { ...input.trace } }),
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
      attributes: redacted.attributes,
      redaction: { droppedAttributeCount: redacted.droppedAttributeCount }
    };
  }
}

function validateInput(input: StructuredLogInput): void {
  if (!Number.isFinite(Date.parse(input.occurredAt))
    || !SAFE_ID.test(input.scope.tenantId)
    || !OPERATIONS[input.component]?.includes(input.operation)
    || !['INFO', 'WARN', 'ERROR'].includes(input.level)
    || !['OPERATION_COMPLETED', 'POLICY_DECISION', 'DEPENDENCY_FAILURE'].includes(input.event)
    || !['SUCCESS', 'FAILURE', 'BLOCKED'].includes(input.outcome)
    || (input.errorCode !== undefined && !['DEPENDENCY_UNAVAILABLE', 'INTERNAL_ERROR', 'POLICY_BLOCKED', 'TIMEOUT', 'VALIDATION_FAILED'].includes(input.errorCode))) throw invalid();
  if (input.outcome === 'SUCCESS' && (input.level !== 'INFO' || input.errorCode !== undefined)) throw invalid();
  if (input.outcome === 'BLOCKED' && (input.level !== 'WARN' || input.errorCode !== 'POLICY_BLOCKED')) throw invalid();
  if (input.outcome === 'FAILURE' && (input.level !== 'ERROR' || input.errorCode === undefined || input.errorCode === 'POLICY_BLOCKED')) throw invalid();
  if (input.trace !== undefined && (!TRACE_ID.test(input.trace.traceId) || !SPAN_ID.test(input.trace.spanId) || !SAFE_ID.test(input.trace.correlationId))) throw invalid();
}

function selectRoute(outcome: ComponentTraceResult): StructuredLogRoute {
  return outcome === 'SUCCESS' ? 'OPERATIONS' : outcome === 'BLOCKED' ? 'SECURITY' : 'FAILURES';
}

function normalizeAttributes(value: unknown): {
  attributes: StructuredLogRecord['attributes'];
  droppedAttributeCount: number;
} {
  if (!isRecord(value)) return { attributes: {}, droppedAttributeCount: value === undefined ? 0 : 1 };
  const redacted = redactSecrets(value);
  const safe = isRecord(redacted) ? redacted : {};
  const attributes: Record<string, number | boolean> = {};
  let droppedAttributeCount = 0;
  for (const [key, attribute] of Object.entries(safe)) {
    if (key === 'durationMs' && isIntegerWithin(attribute, 0, 300_000)) attributes.durationMs = attribute;
    else if (key === 'httpStatusCode' && isIntegerWithin(attribute, 100, 599)) attributes.httpStatusCode = attribute;
    else if (key === 'recordsCount' && isIntegerWithin(attribute, 0, 100_000)) attributes.recordsCount = attribute;
    else if (key === 'redactedFieldCount' && isIntegerWithin(attribute, 0, 10_000)) attributes.redactedFieldCount = attribute;
    else if (key === 'retryable' && typeof attribute === 'boolean') attributes.retryable = attribute;
    else droppedAttributeCount += 1;
  }
  return { attributes, droppedAttributeCount };
}

function isIntegerWithin(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(): StructuredLogError {
  return new StructuredLogError('STRUCTURED_LOG_INVALID', 'Structured log input geçerli değil.');
}
