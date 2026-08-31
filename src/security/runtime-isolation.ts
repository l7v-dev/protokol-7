export const RUNTIME_ISOLATION_CONTRACT_VERSION = 'runtime-isolation/v1' as const;

export type IsolationControlId = 'WORKER_TENANT_BOUNDARY' | 'BROWSER_TENANT_BOUNDARY' | 'WORKER_MEMORY_CAP' | 'WORKER_CPU_CAP' | 'WORKER_WALL_CLOCK_CAP' | 'WORKER_NETWORK_NAMESPACE' | 'WORKER_EPHEMERAL_FILESYSTEM' | 'BROWSER_CONTEXT_CAP' | 'BROWSER_PAGE_CAP' | 'BROWSER_EPHEMERAL_STORAGE_STATE';
export type RuntimeIsolationScope = { tenantId: string; projectId: string; jobId: string; taskId: string; attemptId: string };
export type RuntimeIsolationReport = {
  contractVersion: typeof RUNTIME_ISOLATION_CONTRACT_VERSION;
  scope: RuntimeIsolationScope;
  status: 'REFERENCE_READY' | 'BLOCKED';
  checks: { workerTenantBoundary: boolean; browserTenantBoundary: boolean; workerResourceCapsBounded: boolean; workerIsolationReferenceConfirmed: boolean; browserCapacityBounded: boolean; browserEphemeralStateReferenceConfirmed: boolean };
  missingControlIds: ReadonlyArray<IsolationControlId>;
  allowsRuntimeExecution: false;
  allowsSandboxProvisioning: false;
};

export class RuntimeIsolationError extends Error {
  public constructor(public readonly code: 'RUNTIME_ISOLATION_INVALID', message: string) {
    super(message);
    this.name = 'RuntimeIsolationError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Pure reference-posture evaluator for tenant-scoped workers and browser
 * contexts. It accepts safe IDs, bounded numeric limits and closed posture
 * signals only; it never launches a worker/browser, creates a namespace,
 * applies cgroup/container limits, reads session state or provisions a sandbox.
 */
export function evaluateRuntimeIsolation(input: { scope: RuntimeIsolationScope; worker: { workerPoolId: string; tenantId: string; maxMemoryMb: number; maxCpuSeconds: number; maxWallClockSeconds: number; networkNamespace: 'ISOLATED_REFERENCE' | 'NOT_CONFIRMED'; filesystem: 'EPHEMERAL_REFERENCE' | 'NOT_CONFIRMED' }; browser: { browserPoolId: string; tenantId: string; maxContextsPerTenant: number; maxPagesPerContext: number; storageState: 'EPHEMERAL_REFERENCE' | 'NOT_CONFIRMED' } }): RuntimeIsolationReport {
  validate(input);
  const checks = {
    workerTenantBoundary: input.worker.tenantId === input.scope.tenantId,
    browserTenantBoundary: input.browser.tenantId === input.scope.tenantId,
    workerResourceCapsBounded: true,
    workerIsolationReferenceConfirmed: input.worker.networkNamespace === 'ISOLATED_REFERENCE' && input.worker.filesystem === 'EPHEMERAL_REFERENCE',
    browserCapacityBounded: true,
    browserEphemeralStateReferenceConfirmed: input.browser.storageState === 'EPHEMERAL_REFERENCE'
  };
  const missingControlIds: IsolationControlId[] = [
    ...(checks.workerTenantBoundary ? [] : ['WORKER_TENANT_BOUNDARY' as const]),
    ...(checks.browserTenantBoundary ? [] : ['BROWSER_TENANT_BOUNDARY' as const]),
    ...(checks.workerResourceCapsBounded ? [] : ['WORKER_MEMORY_CAP' as const, 'WORKER_CPU_CAP' as const, 'WORKER_WALL_CLOCK_CAP' as const]),
    ...(input.worker.networkNamespace === 'ISOLATED_REFERENCE' ? [] : ['WORKER_NETWORK_NAMESPACE' as const]),
    ...(input.worker.filesystem === 'EPHEMERAL_REFERENCE' ? [] : ['WORKER_EPHEMERAL_FILESYSTEM' as const]),
    ...(checks.browserCapacityBounded ? [] : ['BROWSER_CONTEXT_CAP' as const, 'BROWSER_PAGE_CAP' as const]),
    ...(checks.browserEphemeralStateReferenceConfirmed ? [] : ['BROWSER_EPHEMERAL_STORAGE_STATE' as const])
  ];
  return { contractVersion: RUNTIME_ISOLATION_CONTRACT_VERSION, scope: { ...input.scope }, status: missingControlIds.length === 0 ? 'REFERENCE_READY' : 'BLOCKED', checks, missingControlIds, allowsRuntimeExecution: false, allowsSandboxProvisioning: false };
}

function validate(input: { scope: RuntimeIsolationScope; worker: { workerPoolId: string; tenantId: string; maxMemoryMb: number; maxCpuSeconds: number; maxWallClockSeconds: number; networkNamespace: string; filesystem: string }; browser: { browserPoolId: string; tenantId: string; maxContextsPerTenant: number; maxPagesPerContext: number; storageState: string } }): void {
  if (!Object.values(input.scope).every((value) => SAFE_ID.test(value)) || !SAFE_ID.test(input.worker.workerPoolId) || !SAFE_ID.test(input.worker.tenantId) || !SAFE_ID.test(input.browser.browserPoolId) || !SAFE_ID.test(input.browser.tenantId)
    || !within(input.worker.maxMemoryMb, 64, 16_384) || !within(input.worker.maxCpuSeconds, 1, 86_400) || !within(input.worker.maxWallClockSeconds, 1, 86_400)
    || !within(input.browser.maxContextsPerTenant, 1, 100) || !within(input.browser.maxPagesPerContext, 1, 100)
    || !['ISOLATED_REFERENCE', 'NOT_CONFIRMED'].includes(input.worker.networkNamespace) || !['EPHEMERAL_REFERENCE', 'NOT_CONFIRMED'].includes(input.worker.filesystem) || !['EPHEMERAL_REFERENCE', 'NOT_CONFIRMED'].includes(input.browser.storageState)) throw invalid();
}

function within(value: number, minimum: number, maximum: number): boolean {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function invalid(): RuntimeIsolationError {
  return new RuntimeIsolationError('RUNTIME_ISOLATION_INVALID', 'Runtime isolation input geçerli değil.');
}
