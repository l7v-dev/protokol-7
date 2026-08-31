import { describe, expect, it } from 'vitest';

import { evaluateRuntimeIsolation, RuntimeIsolationError } from '../../src/security/runtime-isolation.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };
const worker = { workerPoolId: 'worker_pool_1', tenantId: 'tenant_1', maxMemoryMb: 512, maxCpuSeconds: 300, maxWallClockSeconds: 600, networkNamespace: 'ISOLATED_REFERENCE' as const, filesystem: 'EPHEMERAL_REFERENCE' as const };
const browser = { browserPoolId: 'browser_pool_1', tenantId: 'tenant_1', maxContextsPerTenant: 2, maxPagesPerContext: 3, storageState: 'EPHEMERAL_REFERENCE' as const };

describe('bounded worker/browser resource and tenant isolation reference posture', () => {
  it('returns a complete reference-ready posture without launching runtime or provisioning a sandbox', () => {
    const report = evaluateRuntimeIsolation({ scope, worker, browser });
    expect(report.status).toBe('REFERENCE_READY');
    expect(report.checks).toEqual({ workerTenantBoundary: true, browserTenantBoundary: true, workerResourceCapsBounded: true, workerIsolationReferenceConfirmed: true, browserCapacityBounded: true, browserEphemeralStateReferenceConfirmed: true });
    expect(report.missingControlIds).toEqual([]);
    expect(report).toMatchObject({ allowsRuntimeExecution: false, allowsSandboxProvisioning: false });
  });

  it('blocks scope mismatch and unconfirmed isolation references with fixed control identifiers only', () => {
    const report = evaluateRuntimeIsolation({ scope, worker: { ...worker, tenantId: 'tenant_2', networkNamespace: 'NOT_CONFIRMED' }, browser: { ...browser, tenantId: 'tenant_3', storageState: 'NOT_CONFIRMED' } });
    expect(report.status).toBe('BLOCKED');
    expect(report.missingControlIds).toEqual(['WORKER_TENANT_BOUNDARY', 'BROWSER_TENANT_BOUNDARY', 'WORKER_NETWORK_NAMESPACE', 'BROWSER_EPHEMERAL_STORAGE_STATE']);
    expect(JSON.stringify(report)).not.toContain('session');
    expect(JSON.stringify(report)).not.toContain('credential');
  });

  it('rejects unsafe identifiers, out-of-bound resource limits and unknown posture signals fail-closed', () => {
    expect(() => evaluateRuntimeIsolation({ scope: { ...scope, tenantId: 'bad tenant' }, worker, browser })).toThrow(RuntimeIsolationError);
    expect(() => evaluateRuntimeIsolation({ scope, worker: { ...worker, maxMemoryMb: 32 }, browser })).toThrow(RuntimeIsolationError);
    expect(() => evaluateRuntimeIsolation({ scope, worker: { ...worker, filesystem: 'PERSISTENT' as never }, browser })).toThrow(RuntimeIsolationError);
  });
});
