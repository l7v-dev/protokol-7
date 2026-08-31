import { describe, expect, it } from 'vitest';

import { HtmlDomCleaner } from '../../src/extraction/html-cleaner.js';
import { discoverLinks, LinkDiscoveryError, linkDiscoveryFingerprint } from '../../src/crawler/link-discovery.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };
const checksum = 'a'.repeat(64);

function cleanedDocument() {
  return new HtmlDomCleaner().clean({
    scope,
    rawArtifact: {
      artifactType: 'raw-http-response',
      contentType: 'text/html',
      sizeBytes: 500,
      checksumSha256: checksum,
      storageKey: 'tenants/tenant_1/jobs/job_1/tasks/task_1/attempts/attempt_1/raw.html'
    },
    html: `
      <main>
        <a href="/catalog?page=1">Catalog</a>
        <a href="https://example.com/next" rel="nofollow external">Next</a>
        <a href="javascript:alert(1)">Script</a>
        <a href="mailto:ops@example.com">Email</a>
        <a href="http://127.0.0.1:8080/private">Private</a>
        <a href="/offer?token=private-token">Sensitive</a>
      </main>
      <script>window.location = 'https://not-discovered.example';</script>`
  });
}

describe('discoverLinks', () => {
  it('discovers clean HTML anchors with parent task provenance and no network side effect', () => {
    const document = cleanedDocument();
    const result = discoverLinks({ scope, baseUrl: 'https://example.com/root', document });

    expect(result.links).toEqual([
      expect.objectContaining({ resolvedUrl: 'https://example.com/catalog?page=1', parentTaskId: 'task_1', parentAttemptId: 'attempt_1', discoveryOrder: 0, noFollow: false }),
      expect.objectContaining({ resolvedUrl: 'https://example.com/next', sourceKind: 'HTML_ANCHOR', discoveryOrder: 1, noFollow: true })
    ]);
    expect(result.summary).toMatchObject({ scannedAnchorCount: 4, discoveredCount: 2, skippedUnsafeCount: 1, skippedSensitiveCount: 0, skippedUnsupportedCount: 1 });
    expect(JSON.stringify(result)).not.toContain('private-token');
    expect(JSON.stringify(result)).not.toContain('not-discovered.example');
    expect(linkDiscoveryFingerprint(result)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('bounds accepted candidates deterministically while retaining safe count evidence', () => {
    const document = cleanedDocument();
    const result = discoverLinks({ scope, baseUrl: 'https://example.com/root', document, maxLinks: 1 });

    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.resolvedUrl).toBe('https://example.com/catalog?page=1');
    expect(result.summary).toMatchObject({ discoveredCount: 1, truncated: true });
  });

  it('rejects unsafe base URL, invalid checksum and invalid discovery limits', () => {
    const document = cleanedDocument();
    expect(() => discoverLinks({ scope, baseUrl: 'http://127.0.0.1:8080', document })).toThrow(LinkDiscoveryError);
    expect(() => discoverLinks({ scope, baseUrl: 'https://example.com', document: { ...document, cleanedChecksumSha256: 'bad' } })).toThrow(LinkDiscoveryError);
    expect(() => discoverLinks({ scope, baseUrl: 'https://example.com', document, maxLinks: 0 })).toThrow(LinkDiscoveryError);
  });
});
