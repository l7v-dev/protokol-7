import { describe, expect, it, vi } from 'vitest';

import {
  BrowserArtifactCapturer,
  BrowserArtifactError,
  BrowserArtifactWriter,
  type BrowserCapturePage
} from '../../src/browser/artifacts.js';
import { InMemoryStorageProvider } from '../../src/storage/provider.js';

function page(): BrowserCapturePage & {
  screenshot: ReturnType<typeof vi.fn>;
  content: ReturnType<typeof vi.fn>;
  pdf: ReturnType<typeof vi.fn>;
} {
  return {
    screenshot: vi.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    content: vi.fn().mockResolvedValue('<html><body>ok</body></html>'),
    pdf: vi.fn().mockResolvedValue(Buffer.from([4, 5, 6]))
  };
}

const identity = {
  tenantId: 'tenant_1',
  jobId: 'job_1',
  taskId: 'task_1',
  attemptId: 'attempt_1'
};

describe('BrowserArtifactCapturer', () => {
  it('captures screenshot, DOM, PDF and sanitized network artifacts', async () => {
    const storage = new InMemoryStorageProvider();
    const capturer = new BrowserArtifactCapturer(new BrowserArtifactWriter(storage));
    const browserPage = page();

    const screenshot = await capturer.capture({ ...identity, page: browserPage, kind: 'screenshot', fullPage: true });
    const dom = await capturer.capture({ ...identity, page: browserPage, kind: 'dom' });
    const pdf = await capturer.capture({ ...identity, page: browserPage, kind: 'pdf' });
    const network = await capturer.capture({
      ...identity,
      page: browserPage,
      kind: 'network',
      networkEvents: [{
        method: 'get',
        url: 'https://user:password@example.com/path?token=raw#fragment',
        resourceType: 'xhr',
        status: 200,
        bodyBytes: 42
      }]
    });

    expect(screenshot).toMatchObject({ artifactType: 'screenshot', contentType: 'image/png' });
    expect(dom).toMatchObject({ artifactType: 'dom', contentType: 'text/html' });
    expect(pdf).toMatchObject({ artifactType: 'pdf', contentType: 'application/pdf' });
    expect(network).toMatchObject({ artifactType: 'network', contentType: 'application/json' });
    expect(browserPage.screenshot).toHaveBeenCalledWith({ fullPage: true });

    const networkBody = await storage.getObject(network.storageKey);
    expect(networkBody?.toString('utf8')).toContain('https://example.com/path');
    expect(networkBody?.toString('utf8')).not.toContain('password');
    expect(networkBody?.toString('utf8')).not.toContain('token=raw');
  });

  it('keeps artifacts tenant/attempt scoped and reports checksum metadata', async () => {
    const storage = new InMemoryStorageProvider();
    const writer = new BrowserArtifactWriter(storage);
    const artifact = await writer.write({
      ...identity,
      kind: 'dom',
      body: '<html />',
      contentType: 'text/html'
    });

    expect(artifact.storageKey).toBe('tenants/tenant_1/jobs/job_1/tasks/task_1/attempts/attempt_1/dom.html');
    expect(artifact.checksumSha256).toHaveLength(64);
    expect(artifact.sizeBytes).toBe(Buffer.byteLength('<html />'));
  });

  it('rejects unsupported capture APIs and bounded artifacts', async () => {
    const storage = new InMemoryStorageProvider();
    const capturer = new BrowserArtifactCapturer(new BrowserArtifactWriter(storage), 2);
    const unsupportedPage: BrowserCapturePage = {};

    await expect(capturer.capture({ ...identity, page: unsupportedPage, kind: 'pdf' })).rejects.toMatchObject({
      code: 'BROWSER_ARTIFACT_UNSUPPORTED',
      retryable: false
    });
    await expect(capturer.capture({ ...identity, page: page(), kind: 'dom' })).rejects.toMatchObject({
      code: 'BROWSER_ARTIFACT_TOO_LARGE',
      retryable: false
    });
    expect(new BrowserArtifactError('BROWSER_ARTIFACT_WRITE_FAILED', 'failed', true).name).toBe('BrowserArtifactError');
  });
});
