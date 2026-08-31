import { describe, expect, it } from 'vitest';

import { DATASET_STAGING_TRANSACTION_VERSION, DatasetStagingTransactionError, DatasetStagingTransactionRegistry } from '../../src/dataset/staging-transaction.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const openInput = { contractVersion: DATASET_STAGING_TRANSACTION_VERSION, transactionId: 'transaction_1', datasetVersionId: 'dataset_version_1', openedAt: '2026-08-27T00:00:00.000Z' };
const record = { recordId: 'record_1', datasetVersionId: 'dataset_version_1', recordChecksumSha256: 'a'.repeat(64), stagedAt: '2026-08-27T00:01:00.000Z' };

describe('dataset staging, publish and abort transaction contracts', () => {
  it('keeps staged record references invisible until one atomic publish receipt makes the full staged set visible', () => {
    const registry = new DatasetStagingTransactionRegistry();
    registry.open(scope, openInput);
    registry.stage(scope, 'transaction_1', record);
    registry.stage(scope, 'transaction_1', { ...record, recordId: 'record_2', recordChecksumSha256: 'b'.repeat(64) });

    expect(registry.visibleRecords(scope, 'transaction_1')).toEqual([]);
    const receipt = registry.publish(scope, 'transaction_1', '2026-08-27T00:02:00.000Z');
    expect(receipt).toMatchObject({ stagedRecordCount: 2, visibility: 'ATOMIC_VISIBLE' });
    expect(registry.visibleRecords(scope, 'transaction_1').map((item) => item.recordId)).toEqual(['record_1', 'record_2']);
    expect(registry.publish(scope, 'transaction_1', '2026-08-27T00:03:00.000Z')).toEqual(receipt);
  });

  it('aborts staging idempotently, clears partial visibility and blocks later staging/publish', () => {
    const registry = new DatasetStagingTransactionRegistry();
    registry.open(scope, openInput);
    registry.stage(scope, 'transaction_1', record);
    const aborted = registry.abort(scope, 'transaction_1', '2026-08-27T00:02:00.000Z', 'QUALITY_GATE_FAILED');

    expect(aborted).toMatchObject({ status: 'ABORTED', abortReasonCode: 'QUALITY_GATE_FAILED' });
    expect(registry.visibleRecords(scope, 'transaction_1')).toEqual([]);
    expect(registry.abort(scope, 'transaction_1', '2026-08-27T00:02:00.000Z', 'QUALITY_GATE_FAILED')).toEqual(aborted);
    expect(() => registry.stage(scope, 'transaction_1', record)).toThrow(DatasetStagingTransactionError);
    expect(() => registry.publish(scope, 'transaction_1', '2026-08-27T00:03:00.000Z')).toThrow(DatasetStagingTransactionError);
  });

  it('rejects empty staging, cross-scope transaction access, version mismatch and conflicting record references fail-closed', () => {
    const registry = new DatasetStagingTransactionRegistry();
    registry.open(scope, openInput);
    expect(() => registry.publish(scope, 'transaction_1', '2026-08-27T00:02:00.000Z')).toThrowError(expect.objectContaining({ code: 'DATASET_TRANSACTION_EMPTY_STAGING' }));
    expect(() => registry.stage(scope, 'transaction_1', { ...record, datasetVersionId: 'dataset_version_2' })).toThrowError(expect.objectContaining({ code: 'DATASET_TRANSACTION_RECORD_MISMATCH' }));
    registry.stage(scope, 'transaction_1', record);
    expect(() => registry.stage(scope, 'transaction_1', { ...record, recordChecksumSha256: 'c'.repeat(64) })).toThrowError(expect.objectContaining({ code: 'DATASET_TRANSACTION_CONFLICT' }));
    expect(() => registry.get({ tenantId: 'tenant_2', projectId: 'project_1' }, 'transaction_1')).toThrowError(expect.objectContaining({ code: 'DATASET_TRANSACTION_SCOPE_MISMATCH' }));
  });
});
