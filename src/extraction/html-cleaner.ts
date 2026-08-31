import { createHash } from 'node:crypto';

import { load } from 'cheerio';

import { HttpParseError, parseHttpResponse } from '../http/response-parser.js';
import type { HttpResponse } from '../http/http-client.js';

export type ExtractionArtifactReference = {
  artifactType: 'raw-http-response' | 'raw-browser-dom';
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageKey: string;
};

export type ExtractionScope = {
  tenantId: string;
  jobId: string;
  taskId: string;
  attemptId: string;
};

export type CleanHtmlDocument = {
  rawArtifact: ExtractionArtifactReference;
  cleanHtml: string;
  text: string;
  sourceChecksumSha256: string;
  cleanedChecksumSha256: string;
  removedElementCount: number;
  redactedValueCount: number;
};

export type HtmlCleanerErrorCode =
  | 'HTML_SOURCE_UNSUPPORTED'
  | 'RAW_ARTIFACT_REFERENCE_INVALID'
  | 'CLEANED_OUTPUT_TOO_LARGE'
  | 'HTML_CLEANER_OPTIONS_INVALID';

export class HtmlCleanerError extends Error {
  public constructor(public readonly code: HtmlCleanerErrorCode, message: string) {
    super(message);
    this.name = 'HtmlCleanerError';
  }
}

export type HtmlCleanerOptions = {
  maxSourceBytes?: number;
  maxCleanedBytes?: number;
};

export const HTML_DOM_CLEANER_EXECUTION_BOUNDARY = {
  executionMode: 'LOCAL_FIXTURE_ONLY',
  allowsTargetFetch: false,
  allowsArtifactStorageRead: false,
  allowsArtifactStorageWrite: false,
  allowsProviderCall: false,
  allowsBrowserExecution: false,
  allowsCredentialMaterial: false
} as const;

const DEFAULT_MAX_SOURCE_BYTES = 1_000_000;
const DEFAULT_MAX_CLEANED_BYTES = 750_000;
const DISCARD_SELECTOR = 'script,style,noscript,template,iframe,object,embed,svg,canvas,meta,base,link,input[type="hidden"],input[type="password"],[hidden],[aria-hidden="true"]';
const SENSITIVE_ATTRIBUTE = /authorization|cookie|credential|password|secret|token|session|api[_-]?key/i;
const SENSITIVE_INLINE = /(authorization\s*:|bearer\s+\S+|set-cookie\s*:|password\s*[=:]|api[_-]?key\s*[=:])[^\s<]*/gi;

/**
 * A data-only HTML cleaner. It never reads/writes storage itself; callers must
 * pass a tenant-scoped raw artifact reference for lineage, while the source
 * string remains transient in process memory.
 */
export class HtmlDomCleaner {
  private readonly maxSourceBytes: number;
  private readonly maxCleanedBytes: number;

  public constructor(options: HtmlCleanerOptions = {}) {
    this.maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    this.maxCleanedBytes = options.maxCleanedBytes ?? DEFAULT_MAX_CLEANED_BYTES;
    if (!Number.isInteger(this.maxSourceBytes) || this.maxSourceBytes < 1
      || !Number.isInteger(this.maxCleanedBytes) || this.maxCleanedBytes < 1) {
      throw new HtmlCleanerError('HTML_CLEANER_OPTIONS_INVALID', 'HTML cleaner limitleri pozitif integer olmalıdır.');
    }
  }

  public get executionBoundary(): typeof HTML_DOM_CLEANER_EXECUTION_BOUNDARY {
    return { ...HTML_DOM_CLEANER_EXECUTION_BOUNDARY };
  }

  public clean(input: { scope: ExtractionScope; rawArtifact: ExtractionArtifactReference; html: string }): CleanHtmlDocument {
    assertScope(input.scope);
    assertArtifactReference(input.scope, input.rawArtifact);
    if (Buffer.byteLength(input.html, 'utf8') > this.maxSourceBytes) {
      throw new HtmlCleanerError('HTML_SOURCE_UNSUPPORTED', 'HTML source boyutu cleaner limitini aşıyor.');
    }

    const $ = load(input.html);
    const discarded = $(DISCARD_SELECTOR);
    const removedElementCount = discarded.length;
    discarded.remove();
    let attributeRemoved = 0;
    let sensitiveElementRemoved = 0;
    $('*').each((_index, element) => {
      const attributes: Record<string, string> = 'attribs' in element && element.attribs ? element.attribs : {};
      const hasSensitiveAttribute = Object.entries(attributes).some(([name, value]) => SENSITIVE_ATTRIBUTE.test(name) || SENSITIVE_ATTRIBUTE.test(value));
      if (hasSensitiveAttribute) {
        $(element).remove();
        sensitiveElementRemoved += 1;
        return;
      }
      for (const name of Object.keys(attributes)) {
        if (/^on/i.test(name) || name === 'srcdoc' || (name === 'href' && /^javascript:/i.test(attributes[name] ?? ''))) {
          $(element).removeAttr(name);
          attributeRemoved += 1;
        }
      }
    });

    const body = $('body');
    const bodyHtml = body.html() ?? '';
    const redactedValueCount = (bodyHtml.match(SENSITIVE_INLINE) ?? []).length;
    const cleanHtml = bodyHtml.replace(SENSITIVE_INLINE, '[REDACTED]');
    if (Buffer.byteLength(cleanHtml, 'utf8') > this.maxCleanedBytes) {
      throw new HtmlCleanerError('CLEANED_OUTPUT_TOO_LARGE', 'Temizlenmiş HTML boyutu cleaner limitini aşıyor.');
    }
    const text = load(cleanHtml).text().replace(/\s+/g, ' ').trim();
    return {
      rawArtifact: { ...input.rawArtifact },
      cleanHtml,
      text,
      sourceChecksumSha256: sha256(input.html),
      cleanedChecksumSha256: sha256(cleanHtml),
      removedElementCount: removedElementCount + sensitiveElementRemoved + attributeRemoved,
      redactedValueCount
    };
  }
}

/** Converts an HTTP HTML response into a cleaner input while preserving only its artifact reference. */
export class HtmlParsePipeline {
  public constructor(private readonly cleaner: HtmlDomCleaner = new HtmlDomCleaner()) {}

  public prepare(input: {
    scope: ExtractionScope;
    rawArtifact: ExtractionArtifactReference;
    response: Pick<HttpResponse, 'contentType' | 'body'>;
  }): CleanHtmlDocument {
    try {
      const parsed = parseHttpResponse(input.response);
      if (parsed.kind !== 'html' || typeof parsed.value !== 'string') {
        throw new HtmlCleanerError('HTML_SOURCE_UNSUPPORTED', 'Extraction cleaner yalnız HTML response kabul eder.');
      }
      return this.cleaner.clean({ scope: input.scope, rawArtifact: input.rawArtifact, html: parsed.value });
    } catch (error) {
      if (error instanceof HtmlCleanerError) throw error;
      if (error instanceof HttpParseError) {
        throw new HtmlCleanerError('HTML_SOURCE_UNSUPPORTED', 'Extraction cleaner desteklenmeyen response türünü reddetti.');
      }
      throw error;
    }
  }
}

function assertScope(scope: ExtractionScope): void {
  for (const value of Object.values(scope)) {
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
      throw new HtmlCleanerError('RAW_ARTIFACT_REFERENCE_INVALID', 'Extraction scope geçerli değil.');
    }
  }
}

function assertArtifactReference(scope: ExtractionScope, artifact: ExtractionArtifactReference): void {
  if (!['raw-http-response', 'raw-browser-dom'].includes(artifact.artifactType)
    || !/^[a-f0-9]{64}$/i.test(artifact.checksumSha256)
    || !Number.isInteger(artifact.sizeBytes)
    || artifact.sizeBytes < 0
    || artifact.contentType.length === 0) {
    throw new HtmlCleanerError('RAW_ARTIFACT_REFERENCE_INVALID', 'Raw artifact reference geçerli değil.');
  }
  const prefix = `tenants/${scope.tenantId}/jobs/${scope.jobId}/tasks/${scope.taskId}/attempts/${scope.attemptId}/`;
  if (!artifact.storageKey.startsWith(prefix) || /authorization|cookie|credential|password|secret|token|session/i.test(artifact.storageKey)) {
    throw new HtmlCleanerError('RAW_ARTIFACT_REFERENCE_INVALID', 'Raw artifact reference scope dışı veya güvenli değil.');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
