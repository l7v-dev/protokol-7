import type { StorageObject, StorageProvider } from '../storage/provider.js';
import type { HttpResponse } from './http-client.js';

export type ParsedHttpResponse = {
  kind: 'json' | 'html' | 'text';
  value: unknown;
  fieldCount: number;
  recordCount: number;
};

export class HttpParseError extends Error {
  public constructor(
    public readonly code: 'UNSUPPORTED_CONTENT_TYPE' | 'INVALID_JSON_RESPONSE',
    message: string
  ) {
    super(message);
    this.name = 'HttpParseError';
  }
}

export function parseHttpResponse(response: Pick<HttpResponse, 'contentType' | 'body'>): ParsedHttpResponse {
  const contentType = response.contentType?.toLowerCase() ?? null;

  if (contentType === 'application/json') {
    try {
      const value: unknown = JSON.parse(response.body);
      return {
        kind: 'json',
        value,
        fieldCount: countFields(value),
        recordCount: Array.isArray(value) ? value.length : 1
      };
    } catch {
      throw new HttpParseError('INVALID_JSON_RESPONSE', 'JSON response parse edilemedi.');
    }
  }

  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    return {
      kind: 'html',
      value: response.body,
      fieldCount: 0,
      recordCount: 1
    };
  }

  if (contentType === 'text/plain') {
    return {
      kind: 'text',
      value: response.body,
      fieldCount: 0,
      recordCount: 1
    };
  }

  throw new HttpParseError(
    'UNSUPPORTED_CONTENT_TYPE',
    `Content-Type ${contentType ?? 'missing'} desteklenmiyor.`
  );
}

export type HttpArtifactMetadata = {
  artifactType: 'raw-http-response';
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageKey: string;
};

export class HttpArtifactWriter {
  public constructor(private readonly storage: StorageProvider) {}

  public async write(input: {
    tenantId: string;
    jobId: string;
    taskId: string;
    attemptId: string;
    response: Pick<HttpResponse, 'contentType' | 'body'>;
  }): Promise<HttpArtifactMetadata> {
    const body = Buffer.from(input.response.body, 'utf8');
    const storageKey = `tenants/${input.tenantId}/jobs/${input.jobId}/tasks/${input.taskId}/attempts/${input.attemptId}/response.body`;
    const object = await this.storage.putObject({
      key: storageKey,
      body,
      contentType: input.response.contentType ?? 'application/octet-stream',
      metadata: {
        artifactType: 'raw-http-response',
        tenantId: input.tenantId,
        jobId: input.jobId,
        taskId: input.taskId,
        attemptId: input.attemptId
      }
    });

    return toArtifactMetadata(object);
  }
}

function toArtifactMetadata(object: StorageObject): HttpArtifactMetadata {
  return {
    artifactType: 'raw-http-response',
    contentType: object.contentType,
    sizeBytes: object.sizeBytes,
    checksumSha256: object.checksumSha256,
    storageKey: object.key
  };
}

function countFields(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countFields(item), 0);
  }
  if (typeof value !== 'object' || value === null) {
    return 0;
  }
  return Object.keys(value).length;
}
