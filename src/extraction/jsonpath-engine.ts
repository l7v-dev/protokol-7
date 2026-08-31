import { JSONPath } from 'jsonpath-plus';

import type { ExtractionFieldPlan, ExtractionPlan } from './plan.js';

export type JsonPathFieldStatus = 'EXTRACTED' | 'EMPTY' | 'ERROR' | 'REDACTED';

export type JsonPathFieldResult = {
  fieldId: string;
  outputKey: string;
  values: ReadonlyArray<string>;
  status: JsonPathFieldStatus;
  errorCode?: JsonPathSelectorErrorCode;
};

export type JsonPathExtractionResult = {
  planId: string;
  version: number;
  fingerprintSha256: string;
  fields: ReadonlyArray<JsonPathFieldResult>;
};

export type JsonPathSelectorErrorCode =
  | 'EXTRACTION_SOURCE_UNSUPPORTED'
  | 'SELECTOR_KIND_UNSUPPORTED'
  | 'UNSAFE_JSONPATH'
  | 'SELECTOR_EVALUATION_FAILED'
  | 'REQUIRED_FIELD_MISSING'
  | 'MAX_MATCHES_EXCEEDED'
  | 'JSONPATH_SELECTOR_ENGINE_OPTIONS_INVALID';

export class JsonPathSelectorError extends Error {
  public constructor(public readonly code: JsonPathSelectorErrorCode, message: string) {
    super(message);
    this.name = 'JsonPathSelectorError';
  }
}

export type JsonPathSelectorEngineOptions = {
  maxSourceBytes?: number;
  maxMatchesPerField?: number;
};

export const JSONPATH_SELECTOR_ENGINE_EXECUTION_BOUNDARY = {
  executionMode: 'LOCAL_FIXTURE_ONLY',
  allowsApiFetch: false,
  allowsTargetFetch: false,
  allowsProviderCall: false,
  allowsBrowserExecution: false,
  allowsScriptEvaluation: false,
  allowsCredentialMaterial: false
} as const;

const DEFAULT_MAX_SOURCE_BYTES = 1_000_000;
const DEFAULT_MAX_MATCHES_PER_FIELD = 100;
const SAFE_JSONPATH = /^\$(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\[['"][A-Za-z_$][A-Za-z0-9_$.-]*['"]\]|\[\d+\]|\[\*\])*$/;
const SENSITIVE_SELECTOR_TARGET = /authorization|cookie|credential|password|secret|token|session/i;
const SENSITIVE_VALUE = /authorization\s*:|bearer\s+\S+|set-cookie|password\s*[=:]|api[_-]?key\s*[=:]/i;
type JsonPathInput = null | boolean | number | string | object | unknown[];

/**
 * Data-only JSONPath evaluator restricted to property/index/wildcard navigation.
 * It neither fetches an API nor evaluates filter/script expressions.
 */
export class JsonPathSelectorEngine {
  private readonly maxSourceBytes: number;
  private readonly maxMatchesPerField: number;

  public constructor(options: JsonPathSelectorEngineOptions = {}) {
    this.maxSourceBytes = options.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES;
    this.maxMatchesPerField = options.maxMatchesPerField ?? DEFAULT_MAX_MATCHES_PER_FIELD;
    if (!Number.isInteger(this.maxSourceBytes) || this.maxSourceBytes < 1
      || !Number.isInteger(this.maxMatchesPerField) || this.maxMatchesPerField < 1) {
      throw new JsonPathSelectorError('JSONPATH_SELECTOR_ENGINE_OPTIONS_INVALID', 'JSONPath selector engine limitleri pozitif integer olmalıdır.');
    }
  }

  public get executionBoundary(): typeof JSONPATH_SELECTOR_ENGINE_EXECUTION_BOUNDARY {
    return { ...JSONPATH_SELECTOR_ENGINE_EXECUTION_BOUNDARY };
  }

  public extract(plan: ExtractionPlan, source: unknown): JsonPathExtractionResult {
    if (plan.sourceKind !== 'JSON') {
      throw new JsonPathSelectorError('EXTRACTION_SOURCE_UNSUPPORTED', 'JSONPath selector engine yalnız JSON plan kabul eder.');
    }
    assertJsonSize(source, this.maxSourceBytes);
    return {
      planId: plan.planId,
      version: plan.version,
      fingerprintSha256: plan.fingerprintSha256,
      fields: plan.fields.map((field) => this.extractField(field, source))
    };
  }

  private extractField(field: ExtractionFieldPlan, source: JsonPathInput): JsonPathFieldResult {
    if (field.selectorKind !== 'JSONPATH') return errorResult(field, 'SELECTOR_KIND_UNSUPPORTED');
    if (!SAFE_JSONPATH.test(field.selector) || SENSITIVE_SELECTOR_TARGET.test(field.selector)) {
      return errorResult(field, 'UNSAFE_JSONPATH');
    }
    try {
      const values = JSONPath<unknown[]>({ path: field.selector, json: source, wrap: true, autostart: true as const, eval: false })
        .map(toSafeValue)
        .filter((value): value is string => value !== null);
      if (values.length > this.maxMatchesPerField) return errorResult(field, 'MAX_MATCHES_EXCEEDED');
      if (values.length === 0 && field.required) return errorResult(field, 'REQUIRED_FIELD_MISSING');
      const bounded = field.multiple ? values : values.slice(0, 1);
      const redacted = bounded.some((value) => SENSITIVE_VALUE.test(value));
      return {
        fieldId: field.fieldId,
        outputKey: field.outputKey,
        values: redacted ? bounded.map((value) => SENSITIVE_VALUE.test(value) ? '[REDACTED]' : value) : bounded,
        status: redacted ? 'REDACTED' : bounded.length === 0 ? 'EMPTY' : 'EXTRACTED'
      };
    } catch {
      return errorResult(field, 'SELECTOR_EVALUATION_FAILED');
    }
  }
}

function assertJsonSize(source: unknown, maxSourceBytes: number): asserts source is JsonPathInput {
  if (source !== null
    && typeof source !== 'string'
    && typeof source !== 'number'
    && typeof source !== 'boolean'
    && typeof source !== 'object') {
    throw new JsonPathSelectorError('EXTRACTION_SOURCE_UNSUPPORTED', 'JSON source türü desteklenmiyor.');
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(source);
  } catch {
    throw new JsonPathSelectorError('EXTRACTION_SOURCE_UNSUPPORTED', 'JSON source serialize edilemedi.');
  }
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > maxSourceBytes) {
    throw new JsonPathSelectorError('EXTRACTION_SOURCE_UNSUPPORTED', 'JSON source boyutu extraction limitini aşıyor.');
  }
}

function toSafeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || containsSensitiveKey(value) || SENSITIVE_VALUE.test(serialized)) return '[REDACTED]';
    return serialized;
  } catch {
    return null;
  }
}

function containsSensitiveKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  return Object.entries(value).some(([key, child]) => SENSITIVE_SELECTOR_TARGET.test(key) || containsSensitiveKey(child));
}

function errorResult(field: ExtractionFieldPlan, errorCode: JsonPathSelectorErrorCode): JsonPathFieldResult {
  return { fieldId: field.fieldId, outputKey: field.outputKey, values: [], status: 'ERROR', errorCode };
}
