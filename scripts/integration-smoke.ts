import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { Database } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrator.js';
import { OutboxRepository } from '../src/database/repositories/outbox-repository.js';
import { TaskRepository } from '../src/database/repositories/task-repository.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { OutboxPublisher } from '../src/queue/outbox-publisher.js';
import { MockWorker } from '../src/workers/mock-worker.js';

type JsonBody = {
  data?: {
    id?: unknown;
    attributes?: {
      status?: unknown;
    };
  };
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

function bodyOf(response: { json(): unknown }): JsonBody {
  return response.json() as JsonBody;
}

function assertStatus(response: { statusCode: number; body: string }, expected: number, label: string): JsonBody {
  if (response.statusCode !== expected) {
    throw new Error(`${label} expected HTTP ${expected}, received ${response.statusCode}: ${response.body}`);
  }
  return bodyOf(response);
}

function requiredId(body: JsonBody, label: string): string {
  const id = body.data?.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`${label} response did not contain data.id.`);
  }
  return id;
}

function isDependencyConnectionError(error: unknown): boolean {
  if (error instanceof AggregateError) {
    return error.errors.some((item) => isDependencyConnectionError(item));
  }
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(code)) {
      return true;
    }
  }
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes('econnrefused')
    || message.includes('connect timeout')
    || message.includes('connection terminated unexpectedly')
    || message.includes('enotfound');
}

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    AUTH_MODE: 'test',
    LOG_LEVEL: 'silent',
    QUEUE_PREFIX: `scraping:integration:${process.pid}`
  });
  const migrationDirectory = resolve(process.cwd(), 'src/database/migrations');
  const migrationDatabase = new Database(config);

  try {
    await migrationDatabase.healthCheck();
    const migrations = await runMigrations(migrationDatabase, migrationDirectory);
    console.log(`[integration] migrations applied: ${migrations.map((item) => item.version).join(', ') || 'none'}`);
  } finally {
    await migrationDatabase.close();
  }

  const app = buildApp(config);
  await app.ready();
  const outbox = new OutboxRepository(app.database);
  const tasks = new TaskRepository(app.database);
  const publisher = new OutboxPublisher(outbox, app.queueRuntime, {
    serviceName: 'integration-outbox-publisher',
    serviceVersion: '0.1.0',
    retryDelayMs: 100
  });
  const orchestrator = new Orchestrator(tasks, app.queueRuntime, {
    serviceName: 'integration-orchestrator',
    serviceVersion: '0.1.0',
    concurrency: 1
  });
  const mockWorker = new MockWorker(app.queueRuntime, 'integration-mock-worker', '0.1.0');
  const suffix = `${Date.now()}_${process.pid}`;

  try {
    const projectBody = assertStatus(await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: {
        name: `Integration Project ${suffix}`,
        description: 'M1 real dependency smoke test'
      }
    }), 201, 'project create');
    const projectId = requiredId(projectBody, 'project create');

    const targetBody = assertStatus(await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/targets`,
      payload: {
        name: `Integration Target ${suffix}`,
        seedUrl: 'https://example.com'
      }
    }), 201, 'target create');
    const targetId = requiredId(targetBody, 'target create');

    const schemaBody = assertStatus(await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/schemas`,
      payload: {
        name: `Integration Schema ${suffix}`,
        version: 1,
        fields: {
          title: { type: 'string' }
        },
        additionalProperties: false
      }
    }), 201, 'schema create');
    const schemaId = requiredId(schemaBody, 'schema create');

    const publishedSchemaBody = assertStatus(await app.inject({
      method: 'POST',
      url: `/api/v1/schemas/${schemaId}/publish`
    }), 200, 'schema publish');
    if (publishedSchemaBody.data?.attributes?.status !== 'PUBLISHED') {
      throw new Error('schema publish did not return PUBLISHED status.');
    }

    const idempotencyKey = `integration-job-${suffix}`;
    const jobBody = assertStatus(await app.inject({
      method: 'POST',
      url: '/api/v1/jobs',
      headers: { 'idempotency-key': idempotencyKey },
      payload: {
        projectId,
        targetId,
        schemaId,
        input: { source: 'integration-smoke' }
      }
    }), 202, 'job create');
    const jobId = requiredId(jobBody, 'job create');

    orchestrator.start();
    mockWorker.start(1);

    let finalStatus: unknown;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await publisher.publishBatch(50);
      const currentJob = assertStatus(await app.inject({
        method: 'GET',
        url: `/api/v1/jobs/${jobId}`
      }), 200, 'job read');
      finalStatus = currentJob.data?.attributes?.status;
      if (finalStatus === 'COMPLETED') {
        break;
      }
      await delay(100);
    }

    if (finalStatus !== 'COMPLETED') {
      throw new Error(`integration job did not reach COMPLETED; final status: ${String(finalStatus)}`);
    }

    console.log(`[integration] PASS API -> DB -> outbox -> queue -> orchestrator -> mock worker -> COMPLETED (${jobId})`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  if (isDependencyConnectionError(error)) {
    if (process.env.INTEGRATION_REQUIRED === 'true') {
      console.error('[integration] FAIL dependency unavailable.');
      process.exitCode = 1;
    } else {
      console.warn('[integration] SKIPPED dependency unavailable.');
    }
    return;
  }

  console.error('[integration] FAIL', error);
  process.exitCode = 1;
});
