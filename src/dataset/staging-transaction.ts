import { createHash } from 'node:crypto';

import type { DatasetScope } from './model.js';

export const DATASET_STAGING_TRANSACTION_VERSION = 'dataset-staging-transaction/v1' as const;

export type DatasetStagingTransactionInput = {
  contractVersion: typeof DATASET_STAGING_TRANSACTION_VERSION;
  transactionId: string;
  datasetVersionId: string;
  openedAt: string;
};

export type DatasetStagingTransaction = DatasetStagingTransactionInput & {
  scope: DatasetScope;
  status: 'STAGING' | 'PUBLISHED' | 'ABORTED';
  publishedAt?: string;
  abortedAt?: string;
  abortReasonCode?: string;
};

export type StagedRecordReference = {
  recordId: string;
  datasetVersionId: string;
  recordChecksumSha256: string;
  stagedAt: string;
};

export type DatasetPublishReceipt = {
  transactionId: string;
  datasetVersionId: string;
  publishedAt: string;
  stagedRecordCount: number;
  visibility: 'ATOMIC_VISIBLE';
  receiptFingerprintSha256: string;
};

export class DatasetStagingTransactionError extends Error {
  public constructor(
    public readonly code: 'DATASET_TRANSACTION_INVALID' | 'DATASET_TRANSACTION_NOT_FOUND' | 'DATASET_TRANSACTION_CONFLICT' | 'DATASET_TRANSACTION_SCOPE_MISMATCH' | 'DATASET_TRANSACTION_STATE_INVALID' | 'DATASET_TRANSACTION_EMPTY_STAGING' | 'DATASET_TRANSACTION_RECORD_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'DatasetStagingTransactionError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_STAGED_RECORDS = 100_000;

/**
 * Process-local atomic-visibility reference. It never persists records, reads
 * storage, or changes the dataset model; callers provide only safe record references.
 */
export class DatasetStagingTransactionRegistry {
  private readonly transactions = new Map<string, DatasetStagingTransaction>();
  private readonly stagedRecords = new Map<string, Map<string, StagedRecordReference>>();
  private readonly receipts = new Map<string, DatasetPublishReceipt>();

  public open(scope: DatasetScope, input: DatasetStagingTransactionInput): DatasetStagingTransaction {
    validateScope(scope);
    validateTransactionInput(input);
    const key = transactionKey(scope, input.transactionId);
    const existing = this.transactions.get(key);
    if (existing) {
      if (sameOpenInput(existing, input)) return cloneTransaction(existing);
      throw new DatasetStagingTransactionError('DATASET_TRANSACTION_CONFLICT', 'Dataset transaction kimliği farklı içerikle tekrar kullanılamaz.');
    }
    const transaction: DatasetStagingTransaction = { ...input, scope: { ...scope }, status: 'STAGING' };
    this.transactions.set(key, transaction);
    return cloneTransaction(transaction);
  }

  public stage(scope: DatasetScope, transactionId: string, record: StagedRecordReference): StagedRecordReference {
    const transaction = this.requireStagingTransaction(scope, transactionId);
    validateRecord(record);
    if (record.datasetVersionId !== transaction.datasetVersionId) {
      throw new DatasetStagingTransactionError('DATASET_TRANSACTION_RECORD_MISMATCH', 'Staged record dataset version transaction ile eşleşmiyor.');
    }
    const key = transactionKey(scope, transactionId);
    const records = this.stagedRecords.get(key) ?? new Map<string, StagedRecordReference>();
    if (records.size >= MAX_STAGED_RECORDS) throw new DatasetStagingTransactionError('DATASET_TRANSACTION_INVALID', 'Dataset staging record sınırı aşıldı.');
    const existing = records.get(record.recordId);
    if (existing) {
      if (sameRecord(existing, record)) return { ...existing };
      throw new DatasetStagingTransactionError('DATASET_TRANSACTION_CONFLICT', 'Staged record kimliği farklı içerikle tekrar kullanılamaz.');
    }
    const cloned = { ...record };
    records.set(cloned.recordId, cloned);
    this.stagedRecords.set(key, records);
    return { ...cloned };
  }

  public publish(scope: DatasetScope, transactionId: string, publishedAt: string): DatasetPublishReceipt {
    validateScope(scope);
    validateId(transactionId);
    if (!isTime(publishedAt)) throw invalid();
    const key = transactionKey(scope, transactionId);
    const transaction = this.requireTransaction(scope, transactionId);
    const existingReceipt = this.receipts.get(key);
    if (existingReceipt) return { ...existingReceipt };
    if (transaction.status !== 'STAGING') throw new DatasetStagingTransactionError('DATASET_TRANSACTION_STATE_INVALID', 'Yalnızca STAGING transaction publish edilebilir.');
    const records = this.stagedRecords.get(key);
    if (!records || records.size === 0) throw new DatasetStagingTransactionError('DATASET_TRANSACTION_EMPTY_STAGING', 'Boş staging transaction publish edilemez.');
    const receipt: DatasetPublishReceipt = {
      transactionId,
      datasetVersionId: transaction.datasetVersionId,
      publishedAt,
      stagedRecordCount: records.size,
      visibility: 'ATOMIC_VISIBLE',
      receiptFingerprintSha256: createHash('sha256').update(JSON.stringify({ scope, transactionId, datasetVersionId: transaction.datasetVersionId, publishedAt, recordIds: [...records.keys()].sort() })).digest('hex')
    };
    const published: DatasetStagingTransaction = { ...transaction, status: 'PUBLISHED', publishedAt };
    this.transactions.set(key, published);
    this.receipts.set(key, receipt);
    return { ...receipt };
  }

  public abort(scope: DatasetScope, transactionId: string, abortedAt: string, reasonCode: string): DatasetStagingTransaction {
    validateScope(scope);
    validateId(transactionId);
    validateId(reasonCode);
    if (!isTime(abortedAt)) throw invalid();
    const key = transactionKey(scope, transactionId);
    const transaction = this.requireTransaction(scope, transactionId);
    if (transaction.status === 'ABORTED') {
      if (transaction.abortedAt === abortedAt && transaction.abortReasonCode === reasonCode) return cloneTransaction(transaction);
      throw new DatasetStagingTransactionError('DATASET_TRANSACTION_CONFLICT', 'Abort transaction farklı içerikle tekrar kullanılamaz.');
    }
    if (transaction.status !== 'STAGING') throw new DatasetStagingTransactionError('DATASET_TRANSACTION_STATE_INVALID', 'Published transaction abort edilemez.');
    const aborted: DatasetStagingTransaction = { ...transaction, status: 'ABORTED', abortedAt, abortReasonCode: reasonCode };
    this.transactions.set(key, aborted);
    this.stagedRecords.delete(key);
    return cloneTransaction(aborted);
  }

  public visibleRecords(scope: DatasetScope, transactionId: string): ReadonlyArray<StagedRecordReference> {
    const transaction = this.requireTransaction(scope, transactionId);
    if (transaction.status !== 'PUBLISHED') return [];
    return [...(this.stagedRecords.get(transactionKey(scope, transactionId))?.values() ?? [])].map((record) => ({ ...record }));
  }

  public get(scope: DatasetScope, transactionId: string): DatasetStagingTransaction {
    return cloneTransaction(this.requireTransaction(scope, transactionId));
  }

  private requireStagingTransaction(scope: DatasetScope, transactionId: string): DatasetStagingTransaction {
    const transaction = this.requireTransaction(scope, transactionId);
    if (transaction.status !== 'STAGING') throw new DatasetStagingTransactionError('DATASET_TRANSACTION_STATE_INVALID', 'Transaction staging durumunda değil.');
    return transaction;
  }

  private requireTransaction(scope: DatasetScope, transactionId: string): DatasetStagingTransaction {
    validateScope(scope);
    validateId(transactionId);
    const transaction = this.transactions.get(transactionKey(scope, transactionId));
    if (transaction) return transaction;
    if ([...this.transactions.values()].some((candidate) => candidate.transactionId === transactionId)) throw new DatasetStagingTransactionError('DATASET_TRANSACTION_SCOPE_MISMATCH', 'Dataset transaction tenant veya project scope ile eşleşmiyor.');
    throw new DatasetStagingTransactionError('DATASET_TRANSACTION_NOT_FOUND', 'Dataset transaction bulunamadı.');
  }
}

function validateTransactionInput(input: DatasetStagingTransactionInput): void {
  if (input.contractVersion !== DATASET_STAGING_TRANSACTION_VERSION || !SAFE_ID.test(input.transactionId) || !SAFE_ID.test(input.datasetVersionId) || !isTime(input.openedAt)) throw invalid();
}

function validateRecord(record: StagedRecordReference): void {
  if (!SAFE_ID.test(record.recordId) || !SAFE_ID.test(record.datasetVersionId) || !SHA256.test(record.recordChecksumSha256) || !isTime(record.stagedAt)) throw invalid();
}

function validateScope(scope: DatasetScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.projectId)) throw invalid();
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw invalid();
}

function isTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function transactionKey(scope: DatasetScope, transactionId: string): string {
  return `${scope.tenantId}:${scope.projectId}:${transactionId}`;
}

function sameOpenInput(existing: DatasetStagingTransaction, input: DatasetStagingTransactionInput): boolean {
  return existing.contractVersion === input.contractVersion && existing.transactionId === input.transactionId && existing.datasetVersionId === input.datasetVersionId && existing.openedAt === input.openedAt;
}

function sameRecord(left: StagedRecordReference, right: StagedRecordReference): boolean {
  return left.recordId === right.recordId && left.datasetVersionId === right.datasetVersionId && left.recordChecksumSha256 === right.recordChecksumSha256 && left.stagedAt === right.stagedAt;
}

function cloneTransaction(transaction: DatasetStagingTransaction): DatasetStagingTransaction {
  return { ...transaction, scope: { ...transaction.scope } };
}

function invalid(): DatasetStagingTransactionError {
  return new DatasetStagingTransactionError('DATASET_TRANSACTION_INVALID', 'Dataset staging transaction input geçerli değil.');
}
