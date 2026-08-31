import { describe, expect, it, vi } from 'vitest';

import {
  createMessageEnvelope,
  type MessageEnvelope
} from '../../src/queue/contracts.js';
import { HttpClient, type HttpRequestPlan } from '../../src/http/http-client.js';
import { HttpAccessPlanner } from '../../src/http/access-plan.js';
import { HttpReliabilityController } from '../../src/http/reliability.js';
import { HttpArtifactWriter } from '../../src/http/response-parser.js';
import { InMemoryStorageProvider } from '../../src/storage/provider.js';
import { HttpWorker, type HttpWorkerTaskPayload } from '../../src/workers/http-worker.js';

function plan(): HttpRequestPlan {
  return {
    tenantId: 'wrong-tenant-in-payload',
    projectId: 'project_1',
    targetId: 'target_1',
    jobId: 'job_1',
    runId: 'run_1',
    taskId: 'task_1',
    attemptId: 'attempt_1',
    method: 'GET',
    url: 'https://example.com/data',
    allowedHosts: ['example.com'],
    allowedPorts: [443],
    allowedMethods: ['GET'],
    allowedHeaderNames: [],
    allowCookies: false,
    allowRedirects: true,
    maxRedirects: 2,
    timeout: { connectMs: 100, responseMs: 100, totalMs: 500 },
    limits: { requestBodyBytes: 1024, responseBytes: 1024, decompressedBytes: 1024 },
    correlationId: 'wrong-correlation-in-payload',
    traceId: 'wrong-trace-in-payload'
  };
}

function message(): MessageEnvelope<HttpWorkerTaskPayload> {
  return createMessageEnvelope({
    messageId: 'execute_1',
    messageType: 'task.execute',
    schemaVersion: 1,
    tenantId: 'tenant_1',
    projectId: 'project_1',
    jobId: 'job_1',
    runId: 'run_1',
    taskId: 'task_1',
    attemptId: 'attempt_1',
    correlationId: 'corr_1',
    traceId: 'trace_1',
    producer: { service: 'orchestrator', version: '0.1.0' },
    payload: { taskType: 'HTTP_FETCH', payload: plan() }
  });
}

describe('HttpWorker', () => {
  it('executes HTTP_FETCH and emits a correlated success result', async () => {
    const add = vi.fn().mockResolvedValue('result_1');
    const client = new HttpClient({
      fetchImplementation: vi.fn().mockResolvedValue(new Response('ok', {
        status: 200,
        headers: { 'content-type': 'text/plain' }
      }))
    });
    const storage = new InMemoryStorageProvider();
    const worker = new HttpWorker({ add } as never, {
      client,
      artifactWriter: new HttpArtifactWriter(storage)
    });

    await worker.process({ data: message() } as never);

    expect(add).toHaveBeenCalledWith('task.results', expect.objectContaining({
      messageType: 'task.succeeded',
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      correlationId: 'corr_1',
      traceId: 'trace_1',
      causationId: 'execute_1'
    }));
    const resultEnvelope = add.mock.calls[0]?.[1] as MessageEnvelope<Record<string, unknown>>;
    expect(resultEnvelope.payload).toMatchObject({
      resultRef: {
        status: 200,
        bodyBytes: 2,
        parse: { kind: 'text', recordCount: 1 },
        artifact: {
          storageKey: 'tenants/tenant_1/jobs/job_1/tasks/task_1/attempts/attempt_1/response.body'
        }
      }
    });
    expect(resultEnvelope.payload).not.toHaveProperty('resultRef.body');
  });

  it('turns policy failure into a terminal task.failed result without retry', async () => {
    const add = vi.fn().mockResolvedValue('result_2');
    const client = new HttpClient({
      fetchImplementation: vi.fn(),
    });
    const worker = new HttpWorker({ add } as never, { client });

    await worker.process({
      data: {
        ...message(),
        payload: {
          taskType: 'HTTP_FETCH',
          payload: {
            ...plan(),
            url: 'http://127.0.0.1/internal',
            allowedHosts: ['example.com', '127.0.0.1'],
            allowedPorts: [80, 443]
          }
        }
      }
    } as never);

    expect(add).toHaveBeenCalledWith('task.results', expect.objectContaining({
      messageType: 'task.failed',
      payload: {
        errorCode: 'PRIVATE_TARGET_BLOCKED',
        retryable: false
      }
    }));
  });

  it('emits bounded Retry-After delay metadata for retryable responses', async () => {
    const add = vi.fn().mockResolvedValue('result_retry');
    const client = new HttpClient({
      fetchImplementation: vi.fn().mockResolvedValue(new Response('', {
        status: 429,
        headers: { 'retry-after': '2' }
      }))
    });
    const worker = new HttpWorker({ add } as never, {
      client,
      reliability: new HttpReliabilityController({ retryDelay: { random: () => 0 } })
    });

    await worker.process({
      data: {
        ...message(),
        payload: {
          taskType: 'HTTP_FETCH',
          payload: {
            ...plan(),
            retryAttempt: 1,
            retryBudget: { maxRetries: 1 }
          }
        }
      }
    } as never);

    expect(add).toHaveBeenCalledWith('task.results', expect.objectContaining({
      messageType: 'task.failed',
      payload: {
        errorCode: 'HTTP_RATE_LIMITED',
        retryable: true,
        retryBudgetRemaining: 0,
        retryDelayMs: 2_000,
        retryDelaySource: 'RETRY_AFTER'
      }
    }));
  });

  it('emits a bounded proxy rotation recommendation without executing it', async () => {
    const add = vi.fn().mockResolvedValue('result_escalation');
    const client = new HttpClient({
      fetchImplementation: vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    });
    const worker = new HttpWorker({ add } as never, { client });

    await worker.process({
      data: {
        ...message(),
        payload: {
          taskType: 'HTTP_FETCH',
          payload: {
            ...plan(),
            retryBudget: { maxRetries: 1 },
            allowProxyRotation: true,
            escalationBudget: { maxEscalations: 1 }
          }
        }
      }
    } as never);

    expect(add).toHaveBeenCalledWith('task.results', expect.objectContaining({
      messageType: 'task.failed',
      payload: expect.objectContaining({
        errorCode: 'HTTP_SERVER_ERROR',
        retryable: true,
        strategyEscalation: {
          action: 'ROTATE_PROXY',
          reason: 'TRANSIENT_PROXY_ROTATION',
          consumesBudget: true,
          budgetRemaining: 0
        }
      })
    }));
  });

  it('terminates the next retry when the job/task retry budget is exhausted', async () => {
    const add = vi.fn().mockResolvedValue('result_budget');
    const client = new HttpClient({
      fetchImplementation: vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    });
    const worker = new HttpWorker({ add } as never, {
      client,
      reliability: new HttpReliabilityController({ retryDelay: { random: () => 0 } })
    });
    const data = {
      ...message(),
      payload: {
        taskType: 'HTTP_FETCH' as const,
        payload: { ...plan(), retryBudget: { maxRetries: 1 } }
      }
    };

    await worker.process({ data } as never);
    await worker.process({ data } as never);

    expect((add.mock.calls[0]?.[1] as MessageEnvelope<Record<string, unknown>>).payload).toMatchObject({
      errorCode: 'HTTP_SERVER_ERROR',
      retryable: true,
      retryBudgetRemaining: 0
    });
    expect((add.mock.calls[1]?.[1] as MessageEnvelope<Record<string, unknown>>).payload).toEqual({
      errorCode: 'RETRY_BUDGET_EXCEEDED',
      retryable: false
    });
  });

  it('emits a terminal proxy-unavailable failure when direct access is disabled', async () => {
    const add = vi.fn().mockResolvedValue('result_proxy');
    const client = new HttpClient({ fetchImplementation: vi.fn() });
    const worker = new HttpWorker({ add } as never, {
      client,
      accessPlanner: new HttpAccessPlanner()
    });

    await worker.process({
      data: {
        ...message(),
        payload: {
          taskType: 'HTTP_FETCH',
          payload: { ...plan(), allowDirectAccess: false, requireProxy: false }
        }
      }
    } as never);

    expect(add).toHaveBeenCalledWith('task.results', expect.objectContaining({
      messageType: 'task.failed',
      payload: { errorCode: 'PROXY_REQUIRED_UNAVAILABLE', retryable: false }
    }));
  });

  it('does not process a non-HTTP task', async () => {
    const add = vi.fn();
    const worker = new HttpWorker({ add } as never, {
      client: new HttpClient({ fetchImplementation: vi.fn() })
    });
    const input = message();
    const result = await worker.process({
      data: { ...input, payload: { taskType: 'BROWSER_FETCH', payload: plan() } }
    } as never);

    expect(result).toBe('execute_1');
    expect(add).not.toHaveBeenCalled();
  });
});
