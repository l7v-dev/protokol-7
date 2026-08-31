import assert from 'node:assert/strict';

import { runSyntheticSecurityAcceptanceReview } from '../src/security/acceptance-gate.js';

const result = runSyntheticSecurityAcceptanceReview({
  tenantId: 'tenant_security_gate', projectId: 'project_security_gate', jobId: 'job_security_gate', taskId: 'task_security_gate', attemptId: 'attempt_security_gate'
}, '2026-08-27T00:00:00.000Z');

assert.equal(result.status, 'CONDITIONAL_REVIEW_REQUIRED');
assert.equal(Object.values(result.checks).every(Boolean), true);
assert.deepEqual(result.externalEvidenceRequired, ['VULNERABILITY_SCAN_REQUIRED', 'PENETRATION_REMEDIATION_REQUIRED', 'PRODUCTION_GO_LIVE_APPROVAL_REQUIRED']);
assert.equal(result.allowsVulnerabilityScanExecution, false);
assert.equal(result.allowsPenetrationTestExecution, false);
assert.equal(result.allowsAutomaticRemediation, false);
assert.equal(result.allowsGoLive, false);
console.log(JSON.stringify({
  gate: 'P15-T08', status: result.status, checks: result.checks, externalEvidenceRequired: result.externalEvidenceRequired,
  note: 'deterministic process-local synthetic security acceptance review; no vulnerability scan, penetration test, target probing, exploit, remediation, network dispatch, production control mutation or go-live approval'
}, null, 2));
