import type { DatasetScope } from './model.js';

export type DatasetExportFormat = 'JSON' | 'JSONL' | 'CSV';

export type DatasetExportRequest = {
  exportId: string;
  scope: DatasetScope;
  datasetVersionId: string;
  format: DatasetExportFormat;
  columns: ReadonlyArray<string>;
  maxRecords: number;
};

export type DatasetExportRecord = Readonly<Record<string, string | number | boolean | null>>;

export class DatasetExportError extends Error {
  public constructor(
    public readonly code: 'DATASET_EXPORT_INVALID' | 'DATASET_EXPORT_RECORD_INVALID' | 'DATASET_EXPORT_RECORD_LIMIT_EXCEEDED',
    message: string
  ) {
    super(message);
    this.name = 'DatasetExportError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_COLUMN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SENSITIVE_KEY = /authorization|cookie|credential|password|secret|token|session|api[_-]?key/i;
const SENSITIVE_VALUE = /(authorization\s*:|bearer\s+\S+|set-cookie\s*:|password\s*[=:]|api[_-]?key\s*[=:])[^\s<]*/gi;
const MAX_COLUMNS = 100;
const MAX_RECORD_BYTES = 64 * 1024;

/**
 * Converts an AsyncIterable of already-authorized dataset record values to
 * incremental text chunks. It never materializes the source iterable, reads
 * storage, performs delivery, emits completion events, or persists export content.
 */
export async function* streamDatasetExport(
  request: DatasetExportRequest,
  records: AsyncIterable<DatasetExportRecord>
): AsyncGenerator<string> {
  validateRequest(request);
  let emitted = 0;
  if (request.format === 'JSON') yield '[';
  if (request.format === 'CSV') yield `${request.columns.map(csvCell).join(',')}\r\n`;
  for await (const rawRecord of records) {
    if (emitted >= request.maxRecords) throw new DatasetExportError('DATASET_EXPORT_RECORD_LIMIT_EXCEEDED', 'Dataset export record sınırı aşıldı.');
    const record = sanitizeRecord(rawRecord, request.columns);
    if (request.format === 'JSON') yield `${emitted === 0 ? '' : ','}${JSON.stringify(record)}`;
    if (request.format === 'JSONL') yield `${JSON.stringify(record)}\n`;
    if (request.format === 'CSV') yield `${request.columns.map((column) => csvCell(record[column] ?? null)).join(',')}\r\n`;
    emitted += 1;
  }
  if (request.format === 'JSON') yield ']';
}

function validateRequest(request: DatasetExportRequest): void {
  if (!SAFE_ID.test(request.exportId) || !SAFE_ID.test(request.scope.tenantId) || !SAFE_ID.test(request.scope.projectId) || !SAFE_ID.test(request.datasetVersionId)
    || !['JSON', 'JSONL', 'CSV'].includes(request.format)
    || !Number.isInteger(request.maxRecords) || request.maxRecords < 1 || request.maxRecords > 100_000
    || request.columns.length < 1 || request.columns.length > MAX_COLUMNS || new Set(request.columns).size !== request.columns.length
    || request.columns.some((column) => !SAFE_COLUMN.test(column) || SENSITIVE_KEY.test(column))) {
    throw new DatasetExportError('DATASET_EXPORT_INVALID', 'Dataset export request geçerli değil.');
  }
}

function sanitizeRecord(rawRecord: DatasetExportRecord, columns: ReadonlyArray<string>): Record<string, string | number | boolean | null> {
  if (!isRecord(rawRecord) || Object.keys(rawRecord).some((key) => !columns.includes(key) || SENSITIVE_KEY.test(key))) {
    throw new DatasetExportError('DATASET_EXPORT_RECORD_INVALID', 'Dataset export record şeması geçerli değil.');
  }
  const bytes = Buffer.byteLength(JSON.stringify(rawRecord), 'utf8');
  if (bytes > MAX_RECORD_BYTES) throw new DatasetExportError('DATASET_EXPORT_RECORD_INVALID', 'Dataset export record boyutu sınırı aşıyor.');
  return Object.fromEntries(columns.map((column) => [column, sanitizeValue(rawRecord[column] ?? null)]));
}

function sanitizeValue(value: string | number | boolean | null): string | number | boolean | null {
  if (typeof value !== 'string') return value;
  return value.replace(SENSITIVE_VALUE, '[REDACTED]');
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const rendered = String(value);
  return /[",\r\n]/.test(rendered) ? `"${rendered.replace(/"/g, '""')}"` : rendered;
}

function isRecord(value: unknown): value is DatasetExportRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));
}
