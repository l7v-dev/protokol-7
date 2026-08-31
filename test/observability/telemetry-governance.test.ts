import { describe, expect, it } from 'vitest';

import { TelemetryGovernanceError, TelemetryGovernanceEvaluator } from '../../src/observability/telemetry-governance.js';

const evaluator = new TelemetryGovernanceEvaluator();
const scope = { tenantId: 'tenant_1', projectId: 'project_1' };

describe('telemetry retention, access and completeness governance', () => {
  it('returns deterministic, non-destructive retention reviews for the fixed signal policy', () => {
    const active = evaluator.reviewRetention({ scope, signal: 'TRACE', capturedAt: '2026-08-01T00:00:00.000Z', reviewedAt: '2026-08-14T23:59:59.000Z' });
    const expired = evaluator.reviewRetention({ scope, signal: 'ALERT_DECISION', capturedAt: '2026-01-01T00:00:00.000Z', reviewedAt: '2026-04-02T00:00:00.000Z' });

    expect(active).toMatchObject({ retentionDays: 14, expiresAt: '2026-08-15T00:00:00.000Z', status: 'RETENTION_ACTIVE', allowsDestructiveAction: false });
    expect(expired).toMatchObject({ retentionDays: 90, status: 'RETENTION_EXPIRED', allowsDestructiveAction: false });
  });

  it('enforces role and tenant/project scope before allowing telemetry signal access', () => {
    expect(evaluator.reviewAccess({ scope, authorizationScope: scope, signal: 'TRACE', role: 'SRE_OPERATOR' })).toMatchObject({ allowed: true, reason: 'ROLE_ALLOWED' });
    expect(evaluator.reviewAccess({ scope, authorizationScope: scope, signal: 'TRACE', role: 'OBSERVABILITY_READER' })).toMatchObject({ allowed: false, reason: 'ROLE_DENIED' });
    expect(evaluator.reviewAccess({ scope, authorizationScope: { tenantId: 'tenant_2', projectId: 'project_1' }, signal: 'METRIC', role: 'OBSERVABILITY_READER' })).toMatchObject({ allowed: false, reason: 'SCOPE_MISMATCH' });
  });

  it('reports only fixed signal completeness and rejects missing, duplicate or malformed governance inputs fail-closed', () => {
    const report = evaluator.reviewCompleteness({ scope, checkedAt: '2026-08-27T00:00:00.000Z', observations: [
      { signal: 'TRACE', observed: true }, { signal: 'METRIC', observed: true }, { signal: 'STRUCTURED_LOG', observed: false }, { signal: 'ALERT_DECISION', observed: true }
    ] });
    expect(report).toMatchObject({ expectedSignalCount: 4, observedSignalCount: 3, missingSignals: ['STRUCTURED_LOG'], complete: false });
    expect(() => evaluator.reviewCompleteness({ scope, checkedAt: 'bad-time', observations: [] })).toThrow(TelemetryGovernanceError);
    expect(() => evaluator.reviewCompleteness({ scope, checkedAt: '2026-08-27T00:00:00.000Z', observations: [
      { signal: 'TRACE', observed: true }, { signal: 'TRACE', observed: true }, { signal: 'STRUCTURED_LOG', observed: true }, { signal: 'ALERT_DECISION', observed: true }
    ] })).toThrow(TelemetryGovernanceError);
    expect(() => evaluator.reviewAccess({ scope, authorizationScope: scope, signal: 'UNKNOWN' as never, role: 'SRE_OPERATOR' })).toThrow(TelemetryGovernanceError);
  });
});
