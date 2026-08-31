import { describe, expect, it, vi } from 'vitest';

import {
  HttpClient,
  type HttpRequestPlan
} from '../../src/http/http-client.js';

function plan(overrides: Partial<HttpRequestPlan> = {}): HttpRequestPlan {
  return {
    tenantId: 'tenant_1',
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
    allowedMethods: ['GET', 'POST'],
    allowedHeaderNames: ['accept', 'x-requested-with'],
    allowCookies: false,
    allowRedirects: true,
    maxRedirects: 2,
    timeout: {
      connectMs: 100,
      responseMs: 100,
      totalMs: 500
    },
    limits: {
      requestBodyBytes: 1024,
      responseBytes: 1024,
      decompressedBytes: 1024
    },
    correlationId: 'corr_1',
    traceId: 'trace_1',
    ...overrides
  };
}

describe('HttpClient', () => {
  it('executes a bounded GET and returns only safe response headers', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        etag: '"safe"',
        'set-cookie': 'session=raw-secret'
      }
    }));
    const client = new HttpClient({ fetchImplementation });

    const result = await client.execute(plan({ headers: { accept: 'application/json' } }));

    expect(result).toMatchObject({
      status: 200,
      statusClass: '2xx',
      contentType: 'application/json',
      body: '{"ok":true}',
      redirectCount: 0
    });
    expect(result.headers).toMatchObject({ etag: '"safe"' });
    expect(result.headers).not.toHaveProperty('set-cookie');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.com/data',
      expect.objectContaining({ method: 'GET', redirect: 'manual' })
    );
  });

  it('supports POST with an auth reference without exposing the raw value in the plan', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(new Response('created', { status: 201 }));
    const resolveAuthReference = vi.fn().mockResolvedValue('Bearer raw-secret');
    const client = new HttpClient({ fetchImplementation, resolveAuthReference });

    await client.execute(plan({
      method: 'POST',
      body: '{"name":"item"}',
      allowedHeaderNames: ['authorization'],
      authReferences: [{ referenceId: 'auth_1', kind: 'HEADER', headerName: 'authorization' }]
    }));

    expect(resolveAuthReference).toHaveBeenCalledWith({
      referenceId: 'auth_1',
      kind: 'HEADER',
      headerName: 'authorization'
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://example.com/data',
      expect.objectContaining({ headers: { authorization: 'Bearer raw-secret' } })
    );
  });

  it('rejects raw sensitive headers and disallowed cookies', async () => {
    const client = new HttpClient({
      fetchImplementation: vi.fn()
    });

    await expect(client.execute(plan({
      headers: { authorization: 'Bearer raw-secret' },
      allowedHeaderNames: ['authorization']
    }))).rejects.toMatchObject({ code: 'RAW_SECRET_NOT_ALLOWED' });

    await expect(client.execute(plan({
      authReferences: [{ referenceId: 'cookie_1', kind: 'COOKIE' }],
      allowCookies: false
    }))).rejects.toMatchObject({ code: 'COOKIE_NOT_ALLOWED' });
  });

  it('revalidates each redirect against host policy and changes POST 303 to GET', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 303,
        headers: { location: 'https://example.com/next' }
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const client = new HttpClient({ fetchImplementation });

    const result = await client.execute(plan({
      method: 'POST',
      body: 'payload'
    }));

    expect(result.redirectCount).toBe(1);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://example.com/next',
      expect.objectContaining({ method: 'GET', redirect: 'manual' })
    );

    const unsafeRedirectFetch = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/internal' }
    }));
    await expect(new HttpClient({ fetchImplementation: unsafeRedirectFetch }).execute(plan())).rejects.toMatchObject({
      code: 'TARGET_HOST_NOT_ALLOWED'
    });
  });

  it('rejects malformed redirects and ports outside the target policy', async () => {
    const malformedRedirect = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://[invalid' }
    }));
    await expect(new HttpClient({ fetchImplementation: malformedRedirect }).execute(plan())).rejects.toMatchObject({
      code: 'REDIRECT_URL_INVALID',
      retryable: false
    });

    await expect(new HttpClient({ fetchImplementation: vi.fn() }).execute(plan({
      url: 'https://example.com:8443/data'
    }))).rejects.toMatchObject({
      code: 'TARGET_PORT_NOT_ALLOWED',
      retryable: false
    });
  });

  it('rejects response bodies over the configured limit', async () => {
    const client = new HttpClient({
      fetchImplementation: vi.fn().mockResolvedValue(new Response('123456789', { status: 200 }))
    });

    await expect(client.execute(plan({
      limits: {
        requestBodyBytes: 1024,
        responseBytes: 4,
        decompressedBytes: 1024
      }
    }))).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE', retryable: false });
  });

  it('rejects request bodies over the configured limit and invalid header values', async () => {
    const client = new HttpClient({ fetchImplementation: vi.fn() });

    await expect(client.execute(plan({
      method: 'POST',
      body: '123456789',
      limits: { requestBodyBytes: 4, responseBytes: 1024, decompressedBytes: 1024 }
    }))).rejects.toMatchObject({ code: 'REQUEST_BODY_TOO_LARGE', retryable: false });

    await expect(client.execute(plan({
      headers: { accept: 'application/json\nraw' }
    }))).rejects.toMatchObject({ code: 'HEADER_VALUE_INVALID', retryable: false });
  });

  it('maps transport rejection to a retryable dependency error', async () => {
    const client = new HttpClient({
      fetchImplementation: vi.fn().mockRejectedValue(new Error('socket reset'))
    });

    await expect(client.execute(plan())).rejects.toMatchObject({
      code: 'HTTP_REQUEST_FAILED',
      retryable: true,
      category: 'DEPENDENCY'
    });
  });
});
