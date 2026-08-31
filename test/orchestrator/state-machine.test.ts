import { describe, expect, it } from 'vitest';

import { OrchestrationStateRegistry } from '../../src/orchestrator/state-machine.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1' };
const registry = () => new OrchestrationStateRegistry(() => new Date('2026-08-27T00:00:00.000Z'));

describe('OrchestrationStateRegistry', () => {
  it('applies valid job/task lifecycle transitions and emits safe transition audit events', () => {
    const states = registry();
    states.initializeJob(scope);
    states.initializeTask(scope, 'task_1');
    states.transitionJob(scope, 'DISPATCH_PENDING');
    states.transitionTask(scope, 'task_1', 'CLAIMED');

    expect(states.jobStatus(scope)).toBe('DISPATCH_PENDING');
    expect(states.taskStatus(scope, 'task_1')).toBe('CLAIMED');
    expect(states.auditEvents(scope)).toEqual([
      expect.objectContaining({ entityType: 'JOB', fromStatus: 'CREATED', toStatus: 'DISPATCH_PENDING', outcome: 'TRANSITIONED', code: 'STATE_TRANSITIONED' }),
      expect.objectContaining({ entityType: 'TASK', taskId: 'task_1', fromStatus: 'PENDING', toStatus: 'CLAIMED', outcome: 'TRANSITIONED', code: 'STATE_TRANSITIONED' })
    ]);
  });

  it('rejects invalid transition but records a terminal safe audit event', () => {
    const states = registry();
    states.initializeJob(scope, 'COMPLETED');

    expect(() => states.transitionJob(scope, 'RUNNING')).toThrowError(expect.objectContaining({ code: 'INVALID_STATE_TRANSITION', statusCode: 409 }));
    expect(states.jobStatus(scope)).toBe('COMPLETED');
    expect(states.auditEvents(scope)).toEqual([expect.objectContaining({ fromStatus: 'COMPLETED', toStatus: 'RUNNING', outcome: 'REJECTED', code: 'INVALID_STATE_TRANSITION' })]);
  });

  it('isolates audit/state by tenant-job scope and rejects malformed or conflicting initialization', () => {
    const states = registry();
    states.initializeJob(scope);
    states.transitionJob(scope, 'DISPATCH_PENDING');

    expect(() => states.jobStatus({ tenantId: 'tenant_2', jobId: 'job_1' })).toThrowError(expect.objectContaining({ code: 'JOB_NOT_INITIALIZED' }));
    expect(() => states.initializeJob(scope, 'RUNNING')).toThrowError(expect.objectContaining({ code: 'JOB_ALREADY_INITIALIZED' }));
    expect(() => states.initializeTask(scope, 'bad id')).toThrowError(expect.objectContaining({ code: 'ORCHESTRATION_SCOPE_INVALID' }));
    expect(JSON.stringify(states.auditEvents(scope))).not.toContain('authorization');
  });
});
