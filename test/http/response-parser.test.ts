import { describe, expect, it, vi } from 'vitest';

import {
  HttpArtifactWriter,
  HttpParseError,
  parseHttpResponse
} from '../../src/http/response-parser.js';
import { InMemoryStorageProvider } from '../../src/storage/provider.js';


describe('HTTP response parser', () => {
  it('parses JSON and reports deterministic field/record counts', () => {
    expect(parseHttpResponse({
      contentType: 'application/json',
      body: '[{"name":"one"},{"name":"two"}]'
    })).toEqual({
      kind: 'json',
      value: [{ name: 'one' }, { name: 'two' }],
      fieldCount: 2,
      recordCount: 2
    });
  });

  it('accepts HTML and plain text content types', () => {
    expect(parseHttpResponse({ contentType: 'text/html', body: '<h1>Title</h1>' })).toMatchObject({
      kind: 'html',
      value: '<h1>Title</h1>',
      recordCount: 1
    });
    expect(parseHttpResponse({ contentType: 'text/plain', body: 'plain' })).toMatchObject({
      kind: 'text',
      value: 'plain'
    });
  });

  it('rejects unsupported content and malformed JSON as terminal parse errors', () => {
    expect(() => parseHttpResponse({ contentType: 'application/xml', body: '<xml />' })).toThrowError(
      expect.objectContaining({ code: 'UNSUPPORTED_CONTENT_TYPE' })
    );
    expect(() => parseHttpResponse({ contentType: 'application/json', body: '{invalid' })).toThrowError(
      expect.objectContaining({ code: 'INVALID_JSON_RESPONSE' })
    );
    expect(new HttpParseError('INVALID_JSON_RESPONSE', 'bad').name).toBe('HttpParseError');
  });

  it('writes raw response artifacts with tenant-scoped key and checksum metadata', async () => {
    const storage = new InMemoryStorageProvider();
    const writer = new HttpArtifactWriter(storage);
    const artifact = await writer.write({
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      response: { contentType: 'application/json', body: '{"ok":true}' }
    });

    expect(artifact).toMatchObject({
      artifactType: 'raw-http-response',
      contentType: 'application/json',
      storageKey: 'tenants/tenant_1/jobs/job_1/tasks/task_1/attempts/attempt_1/response.body'
    });
    expect(artifact.checksumSha256).toHaveLength(64);
    expect(await storage.headObject(artifact.storageKey)).toMatchObject({
      sizeBytes: Buffer.byteLength('{"ok":true}')
    });
  });

  it('does not write an artifact until the storage provider call succeeds', async () => {
    const putObject = vi.fn().mockRejectedValue(new Error('storage unavailable'));
    const writer = new HttpArtifactWriter({
      putObject,
      getObject: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn()
    });

    await expect(writer.write({
      tenantId: 'tenant_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1',
      response: { contentType: 'text/plain', body: 'hello' }
    })).rejects.toThrow('storage unavailable');
    expect(putObject).toHaveBeenCalledOnce();
  });
});
