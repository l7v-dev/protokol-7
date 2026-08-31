import type { ExtractionTransform, ExtractionTransformKind } from './plan.js';

export type NormalizationStep = {
  kind: ExtractionTransformKind;
  input: string;
  output: string;
};

export type NormalizedExtractionValue = {
  rawValue: string;
  normalizedValue: string;
  steps: ReadonlyArray<NormalizationStep>;
  redacted: boolean;
};

export type NormalizationResult = {
  values: ReadonlyArray<NormalizedExtractionValue>;
  transformFingerprint: string;
};

export type ExtractionNormalizerOptions = {
  maxValues?: number;
  maxValueBytes?: number;
};

export class NormalizationError extends Error {
  public constructor(public readonly code: 'NORMALIZATION_TRANSFORM_INVALID' | 'NORMALIZATION_VALUE_INVALID' | 'NORMALIZATION_INPUT_LIMIT_EXCEEDED' | 'NORMALIZATION_OPTIONS_INVALID', message: string) {
    super(message);
    this.name = 'NormalizationError';
  }
}

const ALLOWED_TRANSFORMS = new Set<ExtractionTransformKind>([
  'TRIM', 'COLLAPSE_WHITESPACE', 'LOWERCASE', 'UPPERCASE', 'REMOVE_CURRENCY_SYMBOL', 'NORMALIZE_DECIMAL'
]);
const SENSITIVE_VALUE = /authorization\s*:|bearer\s+\S+|set-cookie\s*:|password\s*[=:]|api[_-]?key\s*[=:]/i;
const DEFAULT_MAX_VALUES = 100;
const DEFAULT_MAX_VALUE_BYTES = 64_000;

export const EXTRACTION_NORMALIZER_EXECUTION_BOUNDARY = {
  executionMode: 'LOCAL_VALUE_ONLY',
  allowsTargetFetch: false,
  allowsProviderCall: false,
  allowsBrowserExecution: false,
  allowsScriptEvaluation: false,
  allowsCredentialMaterial: false
} as const;

/**
 * Deterministic, data-only value normalizer. No arbitrary expression, regex,
 * locale inference or user code is accepted as a transform definition.
 */
export class ExtractionNormalizer {
  private readonly maxValues: number;
  private readonly maxValueBytes: number;

  public constructor(options: ExtractionNormalizerOptions = {}) {
    this.maxValues = options.maxValues ?? DEFAULT_MAX_VALUES;
    this.maxValueBytes = options.maxValueBytes ?? DEFAULT_MAX_VALUE_BYTES;
    if (!Number.isInteger(this.maxValues) || this.maxValues < 1 || !Number.isInteger(this.maxValueBytes) || this.maxValueBytes < 1) {
      throw new NormalizationError('NORMALIZATION_OPTIONS_INVALID', 'Normalization limitleri pozitif integer olmalıdır.');
    }
  }

  public get executionBoundary(): typeof EXTRACTION_NORMALIZER_EXECUTION_BOUNDARY {
    return { ...EXTRACTION_NORMALIZER_EXECUTION_BOUNDARY };
  }

  public normalize(values: ReadonlyArray<string>, transforms: ReadonlyArray<ExtractionTransform> = []): NormalizationResult {
    if (!Array.isArray(values) || values.length > this.maxValues || values.some((value) => typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > this.maxValueBytes)) {
      throw new NormalizationError('NORMALIZATION_INPUT_LIMIT_EXCEEDED', 'Normalization value sayısı veya boyutu sınırı aşıyor.');
    }
    validateTransforms(transforms);
    return {
      values: values.map((rawValue) => this.normalizeValue(rawValue, transforms)),
      transformFingerprint: transforms.map((transform) => transform.kind).join('|') || 'IDENTITY'
    };
  }

  private normalizeValue(rawValue: string, transforms: ReadonlyArray<ExtractionTransform>): NormalizedExtractionValue {
    if (typeof rawValue !== 'string') {
      throw new NormalizationError('NORMALIZATION_VALUE_INVALID', 'Normalization yalnız string extraction value kabul eder.');
    }
    if (SENSITIVE_VALUE.test(rawValue)) {
      return { rawValue: '[REDACTED]', normalizedValue: '[REDACTED]', steps: [], redacted: true };
    }
    let current = rawValue;
    const steps: NormalizationStep[] = [];
    for (const transform of transforms) {
      const output = applyTransform(transform.kind, current);
      steps.push({ kind: transform.kind, input: current, output });
      current = output;
    }
    return { rawValue, normalizedValue: current, steps, redacted: false };
  }
}

function validateTransforms(transforms: ReadonlyArray<ExtractionTransform>): void {
  if (!Array.isArray(transforms) || transforms.length > 10 || transforms.some((transform) => !transform || !ALLOWED_TRANSFORMS.has(transform.kind))) {
    throw new NormalizationError('NORMALIZATION_TRANSFORM_INVALID', 'Normalization transform tanımı desteklenmiyor.');
  }
}

function applyTransform(kind: ExtractionTransformKind, value: string): string {
  switch (kind) {
    case 'TRIM':
      return value.trim();
    case 'COLLAPSE_WHITESPACE':
      return value.replace(/\s+/g, ' ').trim();
    case 'LOWERCASE':
      return value.toLowerCase();
    case 'UPPERCASE':
      return value.toUpperCase();
    case 'REMOVE_CURRENCY_SYMBOL':
      return value.replace(/\p{Sc}/gu, '').trim();
    case 'NORMALIZE_DECIMAL':
      return normalizeDecimal(value);
  }
}

function normalizeDecimal(value: string): string {
  const compact = value.replace(/\s+/g, '');
  if (!/^[+-]?[0-9][0-9.,]*$/.test(compact)) return value;
  const dotIndex = compact.lastIndexOf('.');
  const commaIndex = compact.lastIndexOf(',');
  if (dotIndex === -1 && commaIndex === -1) return compact;
  if (dotIndex !== -1 && commaIndex !== -1) {
    const decimalIndex = Math.max(dotIndex, commaIndex);
    const integerPart = compact.slice(0, decimalIndex).replace(/[.,]/g, '');
    const decimalPart = compact.slice(decimalIndex + 1).replace(/[.,]/g, '');
    return decimalPart.length > 0 ? `${integerPart}.${decimalPart}` : integerPart;
  }
  if (commaIndex !== -1 && /^[-+]?\d+,\d{1,2}$/.test(compact)) return compact.replace(',', '.');
  return compact;
}
