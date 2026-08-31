import assert from 'node:assert/strict';

import { runSyntheticCostAttributionAcceptanceDrill } from '../src/finops/acceptance-gate.js';

const result = runSyntheticCostAttributionAcceptanceDrill({
  tenantId: 'tenant_cost_gate', projectId: 'project_cost_gate', jobId: 'job_cost_gate', taskId: 'task_cost_gate', attemptId: 'attempt_cost_gate'
}, '2026-08-27T00:00:00.000Z');

assert.equal(result.status, 'PASS');
assert.equal(result.evidence.totalCostMicros, 1_400);
assert.equal(result.evidence.costPerPublishedRecordMicros, 700);
assert.equal(result.evidence.budgetStatus, 'BLOCKED');
assert.equal(result.evidence.reconciliationStatus, 'RECONCILED');
assert.equal(result.allowExternalExport, false);
assert.equal(result.allowBillingOrPayment, false);
assert.equal(result.allowAutomaticStop, false);
console.log(JSON.stringify({
  gate: 'P14-T08', status: result.status, checks: result.checks, evidence: result.evidence,
  note: 'deterministic process-local synthetic cost attribution drill; no live usage collection, provider tariff import, external finance export, accounting close, alert dispatch, automatic stop, billing, payment, database, queue, storage, provider or network side effect'
}, null, 2));
