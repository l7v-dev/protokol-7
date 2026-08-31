import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createMessageEnvelope } from '../src/queue/contracts.js';
import { executeMockTask } from '../src/workers/mock-worker.js';

describe('backend M1 smoke path', () => {
  it('propagates request correlation and exposes liveness/readiness', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));

    const live = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'smoke-request-1' }
    });
    const ready = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
      headers: { 'x-request-id': 'smoke-request-2' }
    });

    expect(live.statusCode).toBe(200);
    expect(live.headers['x-request-id']).toBe('smoke-request-1');
    expect(ready.statusCode).toBe(200);
    expect(ready.headers['x-request-id']).toBe('smoke-request-2');

    await app.close();
  });

  it('enforces policy before attempting persistence or external access', async () => {
    const app = buildApp(loadConfig({ NODE_ENV: 'test' }));

    const target = await app.inject({
      method: 'POST',
      url: '/api/v1/projects/project_1/targets',
      payload: {
        name: 'metadata-target',
        seedUrl: 'http://169.254.169.254/latest/meta-data'
      }
    });
    const job = await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      payload: {
        projectId: 'project_1',
        targetId: 'target_1',
        schemaId: 'schema_1'
      }
    });

    expect(target.statusCode).toBe(422);
    expect(target.json()).toMatchObject({ error: { category: 'POLICY' } });
    expect(job.statusCode).toBe(400);
    expect(job.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });

    await app.close();
  });

  it('keeps the task execute/result message chain correlated', () => {
    const execute = createMessageEnvelope({
      messageId: 'message_smoke_1',
      messageType: 'task.execute',
      schemaVersion: 1,
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      correlationId: 'corr_smoke_1',
      traceId: 'trace_smoke_1',
      producer: { service: 'orchestrator', version: '0.1.0' },
      payload: { taskType: 'HTTP_FETCH', payload: { url: 'https://example.com' } }
    });
    const result = executeMockTask(execute.payload);

    expect(execute.correlationId).toBe('corr_smoke_1');
    expect(result.status).toBe('SUCCEEDED');
    expect(result.resultRef).toMatchObject({ kind: 'mock-result' });
  });
});
