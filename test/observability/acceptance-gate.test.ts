import { describe, expect, it } from 'vitest';

import { ObservabilityAcceptanceError, runSyntheticObservabilityAcceptanceDrill } from '../../src/observability/acceptance-gate.js';

const scope = { tenantId: 'tenant_gate', projectId: 'project_gate', jobId: 'job_gate', taskId: 'task_gate', attemptId: 'attempt_gate' };
const at = '2026-08-27T00:00:00.000Z';

describe('observability acceptance and synthetic incident drill', () => {
  it('passes the deterministic synthetic worker failure drill with trace, metric, redaction, alert and governance evidence', () => {
    const result = runSyntheticObservabilityAcceptanceDrill(scope, at);

    expect(result).toMatchObject({
      status: 'PASS', checks: { traceLineageComplete: true, metricProjectionComplete: true, structuredLogRedacted: true, alertTriggered: true, governanceComplete: true },
      incident: { ruleId: 'WORKER_FAILURE_RATE_HIGH', severity: 'CRITICAL', onCallRoute: 'WORKER_PRIMARY', runbookId: 'worker-recovery-v1' },
      allowNotificationDispatch: false, allowAutomaticRemediation: false
    });
  });

  it('does not expose synthetic secret values, contacts, raw payloads or dispatch authority in the acceptance result', () => {
    const serialized = JSON.stringify(runSyntheticObservabilityAcceptanceDrill(scope, at));
    expect(serialized).not.toContain('synthetic-secret-not-emitted');
    expect(serialized).not.toContain('synthetic-token-not-emitted');
    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('authorization');
    expect(serialized).not.toContain('contact');
  });

  it('rejects malformed scope and time inputs fail-closed', () => {
    expect(() => runSyntheticObservabilityAcceptanceDrill({ ...scope, tenantId: 'bad tenant' }, at)).toThrow(ObservabilityAcceptanceError);
    expect(() => runSyntheticObservabilityAcceptanceDrill(scope, 'bad-time')).toThrow(ObservabilityAcceptanceError);
  });
});
