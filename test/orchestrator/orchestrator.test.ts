import { describe, expect, it, vi } from 'vitest';

import type { TaskRepository } from '../../src/database/repositories/task-repository.js';
import { createMessageEnvelope } from '../../src/queue/contracts.js';
import type { QueueRuntime } from '../../src/queue/runtime.js';
import { Orchestrator } from '../../src/orchestrator/orchestrator.js';
import { executeMockTask } from '../../src/workers/mock-worker.js';

describe('orchestrator and mock worker', () => {
  it('plans one initial HTTP task per job command', async () => {
    const planInitialTask = vi.fn().mockResolvedValue({ id: 'task_job_1_initial' });
    const tasks = { planInitialTask } as unknown as TaskRepository;
    const queue = {} as QueueRuntime;
    const orchestrator = new Orchestrator(tasks, queue, {
      serviceName: 'orchestrator',
      serviceVersion: '0.1.0'
    });
    const message = createMessageEnvelope({
      messageType: 'job.create',
      schemaVersion: 1,
      tenantId: 'tenant_1',
      projectId: 'project_1',
      jobId: 'job_1',
      correlationId: 'corr_1',
      traceId: 'trace_1',
      producer: { service: 'api', version: '0.1.0' },
      payload: {
        jobId: 'job_1',
        projectId: 'project_1',
        targetId: 'target_1',
        schemaId: 'schema_1',
        triggerType: 'API',
        input: { url: 'https://example.com' }
      }
    });

    const taskId = await orchestrator.handleJobCommand({ data: message } as never);

    expect(taskId).toBe('task_job_1_initial');
    expect(planInitialTask).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task_job_1_initial',
      attemptId: 'attempt_job_1_initial_1',
      tenantId: 'tenant_1',
      taskType: 'HTTP_FETCH'
    }));
  });

  it('handles a task success result through the orchestrator-owned repository', async () => {
    const markSucceeded = vi.fn().mockResolvedValue({ id: 'task_1' });
    const tasks = { markSucceeded } as unknown as TaskRepository;
    const orchestrator = new Orchestrator(tasks, {} as QueueRuntime, {
      serviceName: 'orchestrator',
      serviceVersion: '0.1.0'
    });
    const message = createMessageEnvelope({
      messageType: 'task.succeeded',
      schemaVersion: 1,
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      correlationId: 'corr_1',
      traceId: 'trace_1',
      producer: { service: 'mock-worker', version: '0.1.0' },
      payload: { resultRef: { kind: 'mock-result' } }
    });

    const result = await orchestrator.handleTaskResult({ data: message } as never);

    expect(result).toBe('task_1');
    expect(markSucceeded).toHaveBeenCalledWith('tenant_1', 'task_1', 'attempt_1', { kind: 'mock-result' });
  });

  it('does not access the network and produces deterministic mock result metadata', () => {
    const success = executeMockTask({
      taskType: 'HTTP_FETCH',
      payload: { url: 'https://example.com' }
    });
    const failure = executeMockTask({
      taskType: 'HTTP_FETCH',
      payload: { simulateFailure: true }
    });

    expect(success.status).toBe('SUCCEEDED');
    expect(success.resultRef).toMatchObject({ kind: 'mock-result', recordCount: 1 });
    expect(failure).toMatchObject({ status: 'FAILED', errorCode: 'MOCK_TASK_FAILURE', retryable: true });
  });
});
