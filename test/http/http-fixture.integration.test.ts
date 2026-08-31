import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMessageEnvelope, type MessageEnvelope } from '../../src/queue/contracts.js';
import type { SafeOutboundUrl } from '../../src/security/egress-policy.js';
import { HttpClient, type HttpRequestPlan } from '../../src/http/http-client.js';
import { HttpArtifactWriter, parseHttpResponse } from '../../src/http/response-parser.js';
import { InMemoryStorageProvider } from '../../src/storage/provider.js';
import { HttpWorker, type HttpWorkerTaskPayload } from '../../src/workers/http-worker.js';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (request.url === '/json' && request.method === 'GET') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"items":[{"id":1}]}');
        return;
      }
      if (request.url === '/echo' && request.method === 'POST') {
        response.writeHead(201, { 'content-type': 'text/plain' });
        response.end(body);
        return;
      }
      if (request.url === '/redirect') {
        response.writeHead(302, { location: '/json' });
        response.end();
        return;
      }
      if (request.url === '/large') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('x'.repeat(2_048));
        return;
      }
      if (request.url === '/rate-limited') {
        response.writeHead(429, { 'retry-after': '2' });
        response.end('slow down');
        return;
      }
      response.writeHead(404);
      response.end('not found');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function allowFixtureUrl(rawUrl: string): SafeOutboundUrl {
  const url = new URL(rawUrl);
  return {
    url: url.toString(),
    protocol: url.protocol === 'http:' ? 'http:' : 'https:',
    hostname: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  };
}

function plan(path: string, overrides: Partial<HttpRequestPlan> = {}): HttpRequestPlan {
  const url = `${baseUrl}${path}`;
  const port = Number(new URL(baseUrl).port);
  return {
    tenantId: 'tenant_fixture',
    projectId: 'project_fixture',
    targetId: 'target_fixture',
    jobId: 'job_fixture',
    runId: 'run_fixture',
    taskId: 'task_fixture',
    attemptId: 'attempt_fixture',
    method: 'GET',
    url,
    allowedHosts: ['127.0.0.1'],
    allowedPorts: [port],
    allowedMethods: ['GET', 'POST'],
    allowedHeaderNames: ['accept'],
    allowCookies: false,
    allowDirectAccess: true,
    allowRedirects: true,
    maxRedirects: 2,
    timeout: { connectMs: 500, responseMs: 500, totalMs: 2_000 },
    limits: { requestBodyBytes: 4_096, responseBytes: 4_096, decompressedBytes: 4_096 },
    correlationId: 'corr_fixture',
    traceId: 'trace_fixture',
    ...overrides
  };
}

describe('HTTP fixture integration', () => {
  it('executes real GET and parses JSON response', async () => {
    const client = new HttpClient({ outboundUrlValidator: allowFixtureUrl });
    const result = await client.execute(plan('/json'));

    expect(result).toMatchObject({ status: 200, contentType: 'application/json' });
    expect(parseHttpResponse(result)).toMatchObject({
      kind: 'json',
      fieldCount: 1,
      recordCount: 1
    });
  });

  it('executes real POST, follows an allowlisted redirect and applies response limit', async () => {
    const client = new HttpClient({ outboundUrlValidator: allowFixtureUrl });
    const post = await client.execute(plan('/echo', { method: 'POST', body: 'payload' }));
    expect(post).toMatchObject({ status: 201, body: 'payload' });

    const redirected = await client.execute(plan('/redirect'));
    expect(redirected).toMatchObject({ status: 200, redirectCount: 1, contentType: 'application/json' });

    await expect(client.execute(plan('/large', {
      limits: { requestBodyBytes: 4_096, responseBytes: 128, decompressedBytes: 4_096 }
    }))).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE', retryable: false });
  });

  it('classifies real 429 Retry-After response and completes HTTP worker artifact flow', async () => {
    const client = new HttpClient({ outboundUrlValidator: allowFixtureUrl });
    const rateLimited = await client.execute(plan('/rate-limited'));
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers['retry-after']).toBe('2');

    const add = async (...args: unknown[]): Promise<string> => {
      void args;
      return 'fixture_result';
    };
    const storage = new InMemoryStorageProvider();
    const worker = new HttpWorker({ add } as never, {
      client,
      artifactWriter: new HttpArtifactWriter(storage)
    });
    const message = createMessageEnvelope<HttpWorkerTaskPayload>({
      messageId: 'fixture_execute',
      messageType: 'task.execute',
      schemaVersion: 1,
      tenantId: 'tenant_fixture',
      projectId: 'project_fixture',
      jobId: 'job_fixture',
      runId: 'run_fixture',
      taskId: 'task_fixture',
      attemptId: 'attempt_fixture',
      correlationId: 'corr_fixture',
      traceId: 'trace_fixture',
      producer: { service: 'fixture-orchestrator', version: '0.1.0' },
      payload: { taskType: 'HTTP_FETCH', payload: plan('/json') }
    });
    await worker.process({ data: message } as { data: MessageEnvelope<HttpWorkerTaskPayload> });

    const artifact = await storage.headObject(
      'tenants/tenant_fixture/jobs/job_fixture/tasks/task_fixture/attempts/attempt_fixture/response.body'
    );
    expect(artifact).not.toBeNull();
    expect(artifact?.checksumSha256).toHaveLength(64);
  });
});
