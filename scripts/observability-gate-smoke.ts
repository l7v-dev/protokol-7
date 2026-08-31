import assert from 'node:assert/strict';

import { runSyntheticObservabilityAcceptanceDrill } from '../src/observability/acceptance-gate.js';

const result = runSyntheticObservabilityAcceptanceDrill({
  tenantId: 'tenant_observability_gate', projectId: 'project_observability_gate', jobId: 'job_observability_gate', taskId: 'task_observability_gate', attemptId: 'attempt_observability_gate'
}, '2026-08-27T00:00:00.000Z');

assert.equal(result.status, 'PASS');
assert.equal(result.incident?.ruleId, 'WORKER_FAILURE_RATE_HIGH');
assert.equal(result.incident?.onCallRoute, 'WORKER_PRIMARY');
assert.equal(result.incident?.runbookId, 'worker-recovery-v1');
assert.equal(result.allowNotificationDispatch, false);
assert.equal(result.allowAutomaticRemediation, false);
console.log(JSON.stringify({
  gate: 'P13-T08', status: result.status, checks: result.checks, incident: result.incident,
  note: 'deterministic process-local synthetic drill; no actual incident, alert dispatch, on-call contact, remediation, telemetry sink, database, queue, storage, provider or network side effect'
}, null, 2));
