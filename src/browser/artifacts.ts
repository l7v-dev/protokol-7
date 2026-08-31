import type { StorageObject, StorageProvider } from '../storage/provider.js';

export type BrowserArtifactKind = 'screenshot' | 'dom' | 'pdf' | 'network';

export type BrowserArtifactInput = {
  tenantId: string;
  jobId: string;
  taskId: string;
  attemptId: string;
  kind: BrowserArtifactKind;
  body: Buffer | string;
  contentType: string;
  metadata?: Record<string, string>;
};

export type BrowserArtifactMetadata = {
  artifactType: BrowserArtifactKind;
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
};

export type BrowserCapturePage = {
  screenshot?(options?: { fullPage?: boolean }): Promise<Buffer | Uint8Array>;
  content?(): Promise<string>;
  pdf?(): Promise<Buffer | Uint8Array>;
};

export type BrowserNetworkEvent = {
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  bodyBytes?: number;
};

export class BrowserArtifactError extends Error {
  public constructor(
    public readonly code: 'BROWSER_ARTIFACT_UNSUPPORTED' | 'BROWSER_ARTIFACT_TOO_LARGE' | 'BROWSER_ARTIFACT_WRITE_FAILED',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'BrowserArtifactError';
  }
}

export class BrowserArtifactWriter {
  public constructor(
    private readonly storage: StorageProvider,
    private readonly maxArtifactBytes = 10 * 1024 * 1024
  ) {}

  public async write(input: BrowserArtifactInput): Promise<BrowserArtifactMetadata> {
    const body = Buffer.isBuffer(input.body) ? Buffer.from(input.body) : Buffer.from(input.body, 'utf8');
    if (body.byteLength > this.maxArtifactBytes) {
      throw new BrowserArtifactError(
        'BROWSER_ARTIFACT_TOO_LARGE',
        'Browser artifact izin verilen byte limitini aşıyor.',
        false
      );
    }

    const storageKey = `tenants/${input.tenantId}/jobs/${input.jobId}/tasks/${input.taskId}/attempts/${input.attemptId}/${input.kind}.${extensionFor(input.kind)}`;
    try {
      const object = await this.storage.putObject({
        key: storageKey,
        body,
        contentType: input.contentType,
        metadata: {
          artifactType: input.kind,
          tenantId: input.tenantId,
          jobId: input.jobId,
          taskId: input.taskId,
          attemptId: input.attemptId,
          ...(input.metadata ?? {})
        }
      });
      return toMetadata(object);
    } catch {
      throw new BrowserArtifactError(
        'BROWSER_ARTIFACT_WRITE_FAILED',
        'Browser artifact storage yazımı başarısız oldu.',
        true
      );
    }
  }
}

export class BrowserArtifactCapturer {
  public constructor(
    private readonly writer: BrowserArtifactWriter,
    private readonly maxArtifactBytes = 10 * 1024 * 1024
  ) {}

  public async capture(input: {
    page: BrowserCapturePage;
    tenantId: string;
    jobId: string;
    taskId: string;
    attemptId: string;
    kind: BrowserArtifactKind;
    fullPage?: boolean;
    networkEvents?: BrowserNetworkEvent[];
  }): Promise<BrowserArtifactMetadata> {
    const artifact = await this.captureBody(input);
    const artifactBytes = typeof artifact.body === 'string'
      ? Buffer.byteLength(artifact.body)
      : artifact.body.byteLength;
    if (artifactBytes > this.maxArtifactBytes) {
      throw new BrowserArtifactError(
        'BROWSER_ARTIFACT_TOO_LARGE',
        'Browser artifact capture byte limitini aşıyor.',
        false
      );
    }
    return this.writer.write({
      tenantId: input.tenantId,
      jobId: input.jobId,
      taskId: input.taskId,
      attemptId: input.attemptId,
      kind: input.kind,
      body: artifact.body,
      contentType: artifact.contentType,
      metadata: artifact.metadata
    });
  }

  private async captureBody(input: {
    page: BrowserCapturePage;
    kind: BrowserArtifactKind;
    fullPage?: boolean;
    networkEvents?: BrowserNetworkEvent[];
  }): Promise<{ body: Buffer | string; contentType: string; metadata: Record<string, string> }> {
    switch (input.kind) {
      case 'screenshot': {
        if (!input.page.screenshot) throw unsupported('screenshot');
        const body = await input.page.screenshot({ fullPage: input.fullPage ?? false });
        return { body: Buffer.from(body), contentType: 'image/png', metadata: {} };
      }
      case 'dom': {
        if (!input.page.content) throw unsupported('DOM');
        return { body: await input.page.content(), contentType: 'text/html', metadata: {} };
      }
      case 'pdf': {
        if (!input.page.pdf) throw unsupported('PDF');
        const body = await input.page.pdf();
        return { body: Buffer.from(body), contentType: 'application/pdf', metadata: {} };
      }
      case 'network': {
        const events = (input.networkEvents ?? []).map(sanitizeNetworkEvent);
        return {
          body: JSON.stringify(events),
          contentType: 'application/json',
          metadata: { eventCount: String(events.length) }
        };
      }
    }
  }
}

function sanitizeNetworkEvent(event: BrowserNetworkEvent): BrowserNetworkEvent {
  let safeUrl = event.url;
  try {
    const parsed = new URL(event.url);
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    safeUrl = parsed.toString();
  } catch {
    safeUrl = '[invalid-url]';
  }

  return {
    method: event.method.toUpperCase(),
    url: safeUrl,
    resourceType: event.resourceType,
    ...(event.status === undefined ? {} : { status: event.status }),
    ...(event.bodyBytes === undefined ? {} : { bodyBytes: event.bodyBytes })
  };
}

function toMetadata(object: StorageObject): BrowserArtifactMetadata {
  return {
    artifactType: object.metadata.artifactType as BrowserArtifactKind,
    storageKey: object.key,
    contentType: object.contentType,
    sizeBytes: object.sizeBytes,
    checksumSha256: object.checksumSha256
  };
}

function extensionFor(kind: BrowserArtifactKind): string {
  switch (kind) {
    case 'screenshot': return 'png';
    case 'dom': return 'html';
    case 'pdf': return 'pdf';
    case 'network': return 'json';
  }
}

function unsupported(kind: string): BrowserArtifactError {
  return new BrowserArtifactError(
    'BROWSER_ARTIFACT_UNSUPPORTED',
    `${kind} artifact browser adapter tarafından desteklenmiyor.`,
    false
  );
}

