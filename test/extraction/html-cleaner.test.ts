import { describe, expect, it } from 'vitest';

import { HTML_DOM_CLEANER_EXECUTION_BOUNDARY, HtmlCleanerError, HtmlDomCleaner, HtmlParsePipeline } from '../../src/extraction/html-cleaner.js';
import type { ExtractionArtifactReference, ExtractionScope, HtmlCleanerErrorCode } from '../../src/extraction/html-cleaner.js';

const scope: ExtractionScope = { tenantId: 'tenant_1', jobId: 'job_1', taskId: 'task_1', attemptId: 'attempt_1' };
const artifact: ExtractionArtifactReference = {
  artifactType: 'raw-http-response',
  contentType: 'text/html',
  sizeBytes: 512,
  checksumSha256: 'a'.repeat(64),
  storageKey: 'tenants/tenant_1/jobs/job_1/tasks/task_1/attempts/attempt_1/response.body'
};

const source = `
  <html><head><script>window.exfiltrate = true</script></head><body>
  <nav>irrelevant navigation</nav><article id="product" onclick="steal()">
    <h1> Trail Jacket </h1><p class="description"> Waterproof &amp; breathable </p>
    <span class="token">Bearer must-not-leak</span><input type="hidden" value="private" />
    <a href="javascript:alert(1)">invalid</a></article><iframe src="https://bad.example"></iframe>
  </body></html>`;

function expectCleanerError(action: () => unknown, code: HtmlCleanerErrorCode): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(HtmlCleanerError);
    expect((error as HtmlCleanerError).code).toBe(code);
    return;
  }
  throw new Error(`Expected cleaner error ${code}.`);
}

describe('HtmlDomCleaner', () => {
  it('declares a local-fixture execution boundary and rejects unsafe cleaner limits before processing artifacts', () => {
    const cleaner = new HtmlDomCleaner();
    expect(cleaner.executionBoundary).toEqual(HTML_DOM_CLEANER_EXECUTION_BOUNDARY);
    expect(cleaner.executionBoundary).not.toBe(HTML_DOM_CLEANER_EXECUTION_BOUNDARY);
    expectCleanerError(() => new HtmlDomCleaner({ maxSourceBytes: 0 }), 'HTML_CLEANER_OPTIONS_INVALID');
    expectCleanerError(() => new HtmlDomCleaner({ maxCleanedBytes: 1.5 }), 'HTML_CLEANER_OPTIONS_INVALID');
  });

  it('removes executable/hidden/sensitive DOM content while retaining useful extraction content and raw lineage', () => {
    const result = new HtmlDomCleaner().clean({ scope, rawArtifact: artifact, html: source });

    expect(result.rawArtifact).toEqual(artifact);
    expect(result.cleanHtml).toContain('Trail Jacket');
    expect(result.cleanHtml).toContain('Waterproof');
    expect(result.cleanHtml).not.toContain('<script');
    expect(result.cleanHtml).not.toContain('<iframe');
    expect(result.cleanHtml).not.toContain('type="hidden"');
    expect(result.cleanHtml).not.toContain('Bearer');
    expect(result.cleanHtml).not.toContain('onclick=');
    expect(result.cleanHtml).not.toContain('javascript:');
    expect(result.cleanHtml).not.toContain('class="token"');
    expect(result.text).toContain('Trail Jacket');
    expect(result.sourceChecksumSha256).toHaveLength(64);
    expect(result.cleanedChecksumSha256).toHaveLength(64);
    expect(result.removedElementCount).toBeGreaterThan(3);
  });

  it('validates artifact tenant/attempt lineage and applies source/output bounds', () => {
    const cleaner = new HtmlDomCleaner({ maxSourceBytes: 600, maxCleanedBytes: 80 });
    expectCleanerError(
      () => cleaner.clean({ scope, rawArtifact: { ...artifact, storageKey: artifact.storageKey.replace('tenant_1', 'tenant_2') }, html: source }),
      'RAW_ARTIFACT_REFERENCE_INVALID'
    );
    expectCleanerError(() => cleaner.clean({ scope, rawArtifact: artifact, html: source }), 'CLEANED_OUTPUT_TOO_LARGE');
    expectCleanerError(
      () => new HtmlDomCleaner({ maxSourceBytes: 10 }).clean({ scope, rawArtifact: artifact, html: source }),
      'HTML_SOURCE_UNSUPPORTED'
    );
  });

  it('only accepts HTML through the parse pipeline and retains no raw response field', () => {
    const pipeline = new HtmlParsePipeline();
    const result = pipeline.prepare({ scope, rawArtifact: artifact, response: { contentType: 'text/html', body: source } });
    expect(result).not.toHaveProperty('rawHtml');
    expect(result.rawArtifact.storageKey).toBe(artifact.storageKey);
    expectCleanerError(
      () => pipeline.prepare({ scope, rawArtifact: artifact, response: { contentType: 'application/json', body: '{}' } }),
      'HTML_SOURCE_UNSUPPORTED'
    );
  });
});
