import { DOMParser, type Document } from '@xmldom/xmldom';
import { load } from 'cheerio';
import * as xpath from 'xpath';

import type { ExtractionFieldPlan, ExtractionPlan } from './plan.js';

export type ExtractionFieldStatus = 'EXTRACTED' | 'EMPTY' | 'ERROR' | 'REDACTED';

export type ExtractionFieldResult = {
  fieldId: string;
  outputKey: string;
  values: ReadonlyArray<string>;
  status: ExtractionFieldStatus;
  errorCode?: HtmlSelectorErrorCode;
};

export type HtmlExtractionResult = {
  planId: string;
  version: number;
  fingerprintSha256: string;
  fields: ReadonlyArray<ExtractionFieldResult>;
};

export type HtmlSelectorErrorCode =
  | 'EXTRACTION_SOURCE_UNSUPPORTED'
  | 'SELECTOR_KIND_UNSUPPORTED'
  | 'SELECTOR_EVALUATION_FAILED'
  | 'REQUIRED_FIELD_MISSING'
  | 'MAX_MATCHES_EXCEEDED'
  | 'UNSAFE_SELECTOR_TARGET'
  | 'HTML_SELECTOR_ENGINE_OPTIONS_INVALID';

export class HtmlSelectorError extends Error {
  public constructor(public readonly code: HtmlSelectorErrorCode, message: string) {
    super(message);
    this.name = 'HtmlSelectorError';
  }
}

export type HtmlSelectorEngineOptions = {
  maxSourceBytes?: number;
  maxMatchesPerField?: number;
};

export const HTML_SELECTOR_ENGINE_EXECUTION_BOUNDARY = {
  executionMode: 'LOCAL_FIXTURE_ONLY',
  allowsTargetFetch: false,
  allowsProviderCall: false,
  allowsBrowserExecution: false,
  allowsScriptEvaluation: false,
  allowsCredentialMaterial: false
} as const;

const DEFAULT_MAX_SOURCE_BYTES = 1_000_000;
const DEFAULT_MAX_MATCHES_PER_FIELD = 100;
const SENSITIVE_OUTPUT_KEY = /authorization|cookie|password|secret|token|session/i;
const SENSITIVE_VALUE = /authorization\s*:|bearer\s+\S+|set-cookie|password\s*[=:]|api[_-]?key\s*[=:]/i;
const UNSAFE_TARGET = /(^|\s)(script|style|noscript|iframe|object|embed)(\s|$|[.#[:])/i;

/**
 * Bounded, data-only HTML selector runner. It has no network, browser,
 * script evaluation, raw artifact persistence or queue side effects.
 */
export class HtmlSelectorEngine {
  private readonly maxSourceBytes: number;
  private readonly maxMatchesPerField: number;

  public constructor(options: HtmlSelectorEngineOptions = {}) {
    this.maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    this.maxMatchesPerField = options.maxMatchesPerField ?? DEFAULT_MAX_MATCHES_PER_FIELD;
    if (!Number.isInteger(this.maxSourceBytes) || this.maxSourceBytes < 1
      || !Number.isInteger(this.maxMatchesPerField) || this.maxMatchesPerField < 1) {
      throw new HtmlSelectorError('HTML_SELECTOR_ENGINE_OPTIONS_INVALID', 'HTML selector engine limitleri pozitif integer olmalıdır.');
    }
  }

  public get executionBoundary(): typeof HTML_SELECTOR_ENGINE_EXECUTION_BOUNDARY {
    return { ...HTML_SELECTOR_ENGINE_EXECUTION_BOUNDARY };
  }

  public extract(plan: ExtractionPlan, source: string): HtmlExtractionResult {
    if (plan.sourceKind !== 'HTML') {
      throw new HtmlSelectorError('EXTRACTION_SOURCE_UNSUPPORTED', 'HTML selector engine yalnız HTML plan kabul eder.');
    }
    if (Buffer.byteLength(source, 'utf8') > this.maxSourceBytes) {
      throw new HtmlSelectorError('EXTRACTION_SOURCE_UNSUPPORTED', 'HTML source boyutu extraction limitini aşıyor.');
    }
    const css = load(source);
    const document = new DOMParser().parseFromString(source, 'application/xml');
    return {
      planId: plan.planId,
      version: plan.version,
      fingerprintSha256: plan.fingerprintSha256,
      fields: plan.fields.map((field) => this.extractField(field, css, document))
    };
  }

  private extractField(field: ExtractionFieldPlan, css: ReturnType<typeof load>, document: Document): ExtractionFieldResult {
    if (SENSITIVE_OUTPUT_KEY.test(field.outputKey) || UNSAFE_TARGET.test(field.selector)) {
      return errorResult(field, 'UNSAFE_SELECTOR_TARGET');
    }
    try {
      const values = field.selectorKind === 'CSS'
        ? this.extractCss(css, field)
        : field.selectorKind === 'XPATH'
          ? this.extractXpath(document, field)
          : null;
      if (values === null) return errorResult(field, 'SELECTOR_KIND_UNSUPPORTED');
      if (values.length > this.maxMatchesPerField) return errorResult(field, 'MAX_MATCHES_EXCEEDED');
      const normalized = values.map(normalizeText).filter((value) => value.length > 0);
      if (normalized.length === 0 && field.required) return errorResult(field, 'REQUIRED_FIELD_MISSING');
      const bounded = field.multiple ? normalized : normalized.slice(0, 1);
      const redacted = redactSensitiveValue(bounded);
      return {
        fieldId: field.fieldId,
        outputKey: field.outputKey,
        values: redacted.values,
        status: redacted.redacted ? 'REDACTED' : bounded.length === 0 ? 'EMPTY' : 'EXTRACTED'
      };
    } catch {
      return errorResult(field, 'SELECTOR_EVALUATION_FAILED');
    }
  }

  private extractCss(css: ReturnType<typeof load>, field: ExtractionFieldPlan): string[] {
    const { selector, attribute } = parseSelector(field.selector);
    return css(selector).toArray().map((node) => attribute ? css(node).attr(attribute) ?? '' : css(node).text());
  }

  private extractXpath(document: Document, field: ExtractionFieldPlan): string[] {
    const { selector, attribute } = parseSelector(field.selector);
    const selected = xpath.select(selector, document);
    if (typeof selected === 'string' || typeof selected === 'number' || typeof selected === 'boolean') {
      return [String(selected)];
    }
    if (!Array.isArray(selected)) return [];
    return selected.map((node) => xpathNodeValue(node, attribute));
  }
}

function parseSelector(input: string): { selector: string; attribute?: string } {
  const marker = '::attr(';
  const markerIndex = input.lastIndexOf(marker);
  if (markerIndex === -1) return { selector: input };
  if (!input.endsWith(')')) throw new HtmlSelectorError('SELECTOR_EVALUATION_FAILED', 'Selector attribute syntax geçersiz.');
  const selector = input.slice(0, markerIndex).trim();
  const attribute = input.slice(markerIndex + marker.length, -1).trim();
  if (!selector || !/^[A-Za-z_:][-A-Za-z0-9_:.]*$/.test(attribute)) {
    throw new HtmlSelectorError('SELECTOR_EVALUATION_FAILED', 'Selector attribute syntax geçersiz.');
  }
  return { selector, attribute };
}

function xpathNodeValue(value: unknown, attribute?: string): string {
  if (!value || typeof value !== 'object') return '';
  const node = value as { textContent?: string | null; nodeValue?: string | null; getAttribute?: (name: string) => string | null };
  if (attribute && typeof node.getAttribute === 'function') return node.getAttribute(attribute) ?? '';
  return node.textContent ?? node.nodeValue ?? '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function redactSensitiveValue(values: ReadonlyArray<string>): { values: string[]; redacted: boolean } {
  const redacted = values.some((value) => SENSITIVE_VALUE.test(value));
  return { values: redacted ? values.map((value) => SENSITIVE_VALUE.test(value) ? '[REDACTED]' : value) : [...values], redacted };
}

function errorResult(field: ExtractionFieldPlan, errorCode: HtmlSelectorErrorCode): ExtractionFieldResult {
  return { fieldId: field.fieldId, outputKey: field.outputKey, values: [], status: 'ERROR', errorCode };
}
