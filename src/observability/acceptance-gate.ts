import { AlertRuleEvaluator } from './alerting.js';
import { ComponentTraceBindings } from './component-trace-bindings.js';
import { OperationalMetricsRegistry } from './operational-metrics.js';
import { StructuredLogRouter } from './structured-logging.js';
import { TelemetryGovernanceEvaluator } from './telemetry-governance.js';
import { TraceContextRegistry } from './trace-context.js';

export const OBSERVABILITY_ACCEPTANCE_CONTRACT_VERSION = 'observability-acceptance/v1' as const;

export type ObservabilityAcceptanceScope = { tenantId: string; projectId: string; jobId: string; taskId: string; attemptId: string };

export type ObservabilityAcceptanceResult = {
  contractVersion: typeof OBSERVABILITY_ACCEPTANCE_CONTRACT_VERSION;
  scope: ObservabilityAcceptanceScope;
  executedAt: string;
  status: 'PASS' | 'FAIL';
  checks: {
    traceLineageComplete: boolean;
    metricProjectionComplete: boolean;
    structuredLogRedacted: boolean;
    alertTriggered: boolean;
    governanceComplete: boolean;
  };
  incident: {
    ruleId: 'WORKER_FAILURE_RATE_HIGH';
    severity: 'CRITICAL';
    onCallRoute: 'WORKER_PRIMARY';
    runbookId: 'worker-recovery-v1';
  } | null;
  allowNotificationDispatch: false;
  allowAutomaticRemediation: false;
};

export class ObservabilityAcceptanceError extends Error {
  public constructor(public readonly code: 'OBSERVABILITY_ACCEPTANCE_INVALID', message: string) {
    super(message);
    this.name = 'ObservabilityAcceptanceError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Runs a synthetic, process-local acceptance drill over the Phase 13 reference
 * contracts. It neither performs a real incident nor emits alerts, writes to
 * telemetry sinks, dispatches remediation, accesses services, or carries raw
 * request, target, payload, credential, token, cookie or error content.
 */
export function runSyntheticObservabilityAcceptanceDrill(scope: ObservabilityAcceptanceScope, executedAt: string): ObservabilityAcceptanceResult {
  validate(scope, executedAt);
  const traces = new TraceContextRegistry();
  const bindings = new ComponentTraceBindings(traces);
  const traceScope = { tenantId: scope.tenantId, jobId: scope.jobId, taskId: scope.taskId, attemptId: scope.attemptId };
  const api = bindings.start({ component: 'API', operation: 'api.request', scope: traceScope, correlationId: 'acceptance_drill', startedAt: executedAt });
  const worker = bindings.start({ component: 'WORKER', operation: 'worker.execute', scope: traceScope, correlationId: 'acceptance_drill', startedAt: executedAt, parent: api.context });
  const workerSpan = bindings.end(worker, executedAt, 'FAILURE');
  const apiSpan = bindings.end(api, executedAt, 'SUCCESS');
  const traceLineageComplete = workerSpan.traceId === apiSpan.traceId && workerSpan.parentSpanId === apiSpan.spanId && workerSpan.correlationId === apiSpan.correlationId;

  const metrics = new OperationalMetricsRegistry();
  const metricScope = { tenantId: scope.tenantId, projectId: scope.projectId };
  metrics.record(metricScope, { category: 'WORKER', metric: 'TASK', outcome: 'SUCCEEDED', occurredAt: executedAt });
  metrics.record(metricScope, { category: 'WORKER', metric: 'TASK', outcome: 'SUCCEEDED', occurredAt: executedAt });
  metrics.record(metricScope, { category: 'WORKER', metric: 'TASK', outcome: 'SUCCEEDED', occurredAt: executedAt });
  metrics.record(metricScope, { category: 'WORKER', metric: 'TASK', outcome: 'SUCCEEDED', occurredAt: executedAt });
  metrics.record(metricScope, { category: 'WORKER', metric: 'TASK', outcome: 'FAILED', occurredAt: executedAt });
  const metricSnapshot = metrics.snapshot(metricScope);
  const metricProjectionComplete = metricSnapshot.counters.workerTasksSucceededTotal === 4 && metricSnapshot.counters.workerTasksFailedTotal === 1;

  const log = new StructuredLogRouter().create({
    occurredAt: executedAt, level: 'ERROR', event: 'DEPENDENCY_FAILURE', component: 'WORKER', operation: 'worker.execute', outcome: 'FAILURE',
    scope: { tenantId: scope.tenantId }, trace: { traceId: worker.context.traceId, spanId: worker.context.spanId, correlationId: worker.context.correlationId }, errorCode: 'TIMEOUT',
    attributes: { durationMs: 1000, authorization: 'synthetic-secret-not-emitted', payload: { token: 'synthetic-token-not-emitted' } }
  });
  const serializedLog = JSON.stringify(log);
  const structuredLogRedacted = log.redaction.droppedAttributeCount === 2
    && !serializedLog.includes('synthetic-secret-not-emitted') && !serializedLog.includes('synthetic-token-not-emitted');

  const alert = new AlertRuleEvaluator().evaluate(metricSnapshot, executedAt).find((candidate) => candidate.ruleId === 'WORKER_FAILURE_RATE_HIGH');
  const alertTriggered = alert?.triggered === true && alert.severity === 'CRITICAL' && alert.onCallRoute === 'WORKER_PRIMARY' && alert.runbookId === 'worker-recovery-v1';

  const governance = new TelemetryGovernanceEvaluator();
  const completeness = governance.reviewCompleteness({ scope: metricScope, checkedAt: executedAt, observations: [
    { signal: 'TRACE', observed: traceLineageComplete }, { signal: 'METRIC', observed: metricProjectionComplete },
    { signal: 'STRUCTURED_LOG', observed: structuredLogRedacted }, { signal: 'ALERT_DECISION', observed: alertTriggered }
  ] });
  const access = governance.reviewAccess({ scope: metricScope, authorizationScope: metricScope, signal: 'ALERT_DECISION', role: 'SRE_OPERATOR' });
  const governanceComplete = completeness.complete && access.allowed;
  const incident = alertTriggered ? { ruleId: 'WORKER_FAILURE_RATE_HIGH' as const, severity: 'CRITICAL' as const, onCallRoute: 'WORKER_PRIMARY' as const, runbookId: 'worker-recovery-v1' as const } : null;
  const status = traceLineageComplete && metricProjectionComplete && structuredLogRedacted && alertTriggered && governanceComplete ? 'PASS' : 'FAIL';
  return {
    contractVersion: OBSERVABILITY_ACCEPTANCE_CONTRACT_VERSION, scope: { ...scope }, executedAt, status,
    checks: { traceLineageComplete, metricProjectionComplete, structuredLogRedacted, alertTriggered, governanceComplete },
    incident, allowNotificationDispatch: false, allowAutomaticRemediation: false
  };
}

function validate(scope: ObservabilityAcceptanceScope, executedAt: string): void {
  if (!Object.values(scope).every((value) => SAFE_ID.test(value)) || !Number.isFinite(Date.parse(executedAt))) {
    throw new ObservabilityAcceptanceError('OBSERVABILITY_ACCEPTANCE_INVALID', 'Observability acceptance drill input geçerli değil.');
  }
}
