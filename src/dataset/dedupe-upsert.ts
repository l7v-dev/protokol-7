import { createHash } from 'node:crypto';

import type { DatasetScope } from './model.js';

export const DATASET_DEDUPE_UPSERT_CONTRACT_VERSION = 'dataset-dedupe-upsert/v1' as const;

export type DatasetVersionLineageBinding = {
  datasetVersionId: string;
  sourceJobId: string;
  boundAt: string;
};

export type DatasetRecordUpsertInput = {
  contractVersion: typeof DATASET_DEDUPE_UPSERT_CONTRACT_VERSION;
  datasetVersionId: string;
  incomingRecordId: string;
  dedupeKeyFingerprintSha256: string;
  recordChecksumSha256: string;
  sourceJobId: string;
  sourceTaskId: string;
  sourceAttemptId: string;
  artifactChecksumSha256: string;
  sourceSequence: number;
  observedAt: string;
};

export type DatasetMergedRecord = {
  datasetVersionId: string;
  mergedRecordId: string;
  dedupeKeyFingerprintSha256: string;
  recordChecksumSha256: string;
  revision: number;
  lineage: Pick<DatasetRecordUpsertInput, 'sourceJobId' | 'sourceTaskId' | 'sourceAttemptId' | 'artifactChecksumSha256' | 'sourceSequence' | 'observedAt'>;
};

export type DatasetUpsertReceipt = {
  action: 'INSERTED' | 'IDEMPOTENT' | 'UPDATED';
  record: DatasetMergedRecord;
  lineageFingerprintSha256: string;
};

export class DatasetDedupeUpsertError extends Error {
  public constructor(
    public readonly code: 'DATASET_DEDUPE_INVALID' | 'DATASET_DEDUPE_SCOPE_MISMATCH' | 'DATASET_DEDUPE_BINDING_CONFLICT' | 'DATASET_DEDUPE_LINEAGE_MISMATCH' | 'DATASET_DEDUPE_CONFLICT',
    message: string
  ) {
    super(message);
    this.name = 'DatasetDedupeUpsertError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/i;

/**
 * Process-local, value-minimizing dedupe/upsert reference. It only handles
 * caller-provided fingerprints and lineage metadata; it never sees record
 * fields, modifies dataset persistence, or dispatches downstream delivery.
 */
export class DatasetDedupeUpsertRegistry {
  private readonly bindings = new Map<string, DatasetVersionLineageBinding>();
  private readonly records = new Map<string, DatasetMergedRecord>();

  public bindDatasetVersion(scope: DatasetScope, binding: DatasetVersionLineageBinding): DatasetVersionLineageBinding {
    validateScope(scope);
    validateBinding(binding);
    const key = versionKey(scope, binding.datasetVersionId);
    const existing = this.bindings.get(key);
    if (existing) {
      if (sameBinding(existing, binding)) return { ...existing };
      throw new DatasetDedupeUpsertError('DATASET_DEDUPE_BINDING_CONFLICT', 'Dataset version source binding farklı içerikle tekrar kullanılamaz.');
    }
    const cloned = { ...binding };
    this.bindings.set(key, cloned);
    return { ...cloned };
  }

  public upsert(scope: DatasetScope, input: DatasetRecordUpsertInput): DatasetUpsertReceipt {
    validateScope(scope);
    validateInput(input);
    const binding = this.requireBinding(scope, input.datasetVersionId);
    if (binding.sourceJobId !== input.sourceJobId) {
      throw new DatasetDedupeUpsertError('DATASET_DEDUPE_LINEAGE_MISMATCH', 'Record source job dataset version lineage binding ile eşleşmiyor.');
    }
    const key = recordKey(scope, input.datasetVersionId, input.dedupeKeyFingerprintSha256);
    const current = this.records.get(key);
    if (!current) {
      const record = mergedRecord(input, 1);
      this.records.set(key, record);
      return receipt('INSERTED', record);
    }
    if (sameInput(current, input)) return receipt('IDEMPOTENT', current);
    if (input.sourceSequence <= current.lineage.sourceSequence) {
      throw new DatasetDedupeUpsertError('DATASET_DEDUPE_CONFLICT', 'Daha eski veya aynı source sequence farklı record checksum ile upsert edilemez.');
    }
    const next = mergedRecord(input, current.revision + 1, current.mergedRecordId);
    this.records.set(key, next);
    return receipt('UPDATED', next);
  }

  public get(scope: DatasetScope, datasetVersionId: string, dedupeKeyFingerprintSha256: string): DatasetMergedRecord | null {
    validateScope(scope);
    validateId(datasetVersionId);
    validateHash(dedupeKeyFingerprintSha256);
    this.requireBinding(scope, datasetVersionId);
    const record = this.records.get(recordKey(scope, datasetVersionId, dedupeKeyFingerprintSha256));
    return record ? cloneRecord(record) : null;
  }

  private requireBinding(scope: DatasetScope, datasetVersionId: string): DatasetVersionLineageBinding {
    validateId(datasetVersionId);
    const binding = this.bindings.get(versionKey(scope, datasetVersionId));
    if (binding) return binding;
    if ([...this.bindings.values()].some((candidate) => candidate.datasetVersionId === datasetVersionId)) throw new DatasetDedupeUpsertError('DATASET_DEDUPE_SCOPE_MISMATCH', 'Dataset version tenant veya project scope ile eşleşmiyor.');
    throw new DatasetDedupeUpsertError('DATASET_DEDUPE_LINEAGE_MISMATCH', 'Dataset version lineage binding bulunamadı.');
  }
}

function validateBinding(binding: DatasetVersionLineageBinding): void {
  if (!SAFE_ID.test(binding.datasetVersionId) || !SAFE_ID.test(binding.sourceJobId) || !isTime(binding.boundAt)) throw invalid();
}

function validateInput(input: DatasetRecordUpsertInput): void {
  if (input.contractVersion !== DATASET_DEDUPE_UPSERT_CONTRACT_VERSION
    || ![input.datasetVersionId, input.incomingRecordId, input.sourceJobId, input.sourceTaskId, input.sourceAttemptId].every((value) => SAFE_ID.test(value))
    || ![input.dedupeKeyFingerprintSha256, input.recordChecksumSha256, input.artifactChecksumSha256].every((value) => SHA256.test(value))
    || !Number.isInteger(input.sourceSequence) || input.sourceSequence < 1 || !isTime(input.observedAt)) throw invalid();
}

function validateScope(scope: DatasetScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.projectId)) throw invalid();
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw invalid();
}

function validateHash(value: string): void {
  if (!SHA256.test(value)) throw invalid();
}

function isTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function versionKey(scope: DatasetScope, datasetVersionId: string): string {
  return `${scope.tenantId}:${scope.projectId}:${datasetVersionId}`;
}

function recordKey(scope: DatasetScope, datasetVersionId: string, fingerprint: string): string {
  return `${versionKey(scope, datasetVersionId)}:${fingerprint}`;
}

function sameBinding(left: DatasetVersionLineageBinding, right: DatasetVersionLineageBinding): boolean {
  return left.datasetVersionId === right.datasetVersionId && left.sourceJobId === right.sourceJobId && left.boundAt === right.boundAt;
}

function sameInput(record: DatasetMergedRecord, input: DatasetRecordUpsertInput): boolean {
  return record.recordChecksumSha256 === input.recordChecksumSha256
    && record.lineage.sourceJobId === input.sourceJobId
    && record.lineage.sourceTaskId === input.sourceTaskId
    && record.lineage.sourceAttemptId === input.sourceAttemptId
    && record.lineage.artifactChecksumSha256 === input.artifactChecksumSha256
    && record.lineage.sourceSequence === input.sourceSequence
    && record.lineage.observedAt === input.observedAt;
}

function mergedRecord(input: DatasetRecordUpsertInput, revision: number, mergedRecordId = `merged_record_${createHash('sha256').update(`${input.datasetVersionId}:${input.dedupeKeyFingerprintSha256}`).digest('hex').slice(0, 24)}`): DatasetMergedRecord {
  return {
    datasetVersionId: input.datasetVersionId,
    mergedRecordId,
    dedupeKeyFingerprintSha256: input.dedupeKeyFingerprintSha256,
    recordChecksumSha256: input.recordChecksumSha256,
    revision,
    lineage: {
      sourceJobId: input.sourceJobId,
      sourceTaskId: input.sourceTaskId,
      sourceAttemptId: input.sourceAttemptId,
      artifactChecksumSha256: input.artifactChecksumSha256,
      sourceSequence: input.sourceSequence,
      observedAt: input.observedAt
    }
  };
}

function receipt(action: DatasetUpsertReceipt['action'], record: DatasetMergedRecord): DatasetUpsertReceipt {
  return { action, record: cloneRecord(record), lineageFingerprintSha256: createHash('sha256').update(JSON.stringify(record.lineage)).digest('hex') };
}

function cloneRecord(record: DatasetMergedRecord): DatasetMergedRecord {
  return { ...record, lineage: { ...record.lineage } };
}

function invalid(): DatasetDedupeUpsertError {
  return new DatasetDedupeUpsertError('DATASET_DEDUPE_INVALID', 'Dataset dedupe/upsert input geçerli değil.');
}
