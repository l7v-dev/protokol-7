import { describe, expect, it } from 'vitest';

import { DATASET_DEDUPE_UPSERT_CONTRACT_VERSION, DatasetDedupeUpsertError, DatasetDedupeUpsertRegistry } from '../../src/dataset/dedupe-upsert.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const binding = { datasetVersionId: 'dataset_version_1', sourceJobId: 'job_1', boundAt: '2026-08-27T00:00:00.000Z' };
const input = { contractVersion: DATASET_DEDUPE_UPSERT_CONTRACT_VERSION, datasetVersionId: 'dataset_version_1', incomingRecordId: 'incoming_1', dedupeKeyFingerprintSha256: 'a'.repeat(64), recordChecksumSha256: 'b'.repeat(64), sourceJobId: 'job_1', sourceTaskId: 'task_1', sourceAttemptId: 'attempt_1', artifactChecksumSha256: 'c'.repeat(64), sourceSequence: 1, observedAt: '2026-08-27T00:00:01.000Z' };

describe('dataset record dedupe/upsert and source-lineage integrity contracts', () => {
  it('inserts a deterministic merged record and returns exact same lineage as idempotent on duplicate input', () => {
    const registry = new DatasetDedupeUpsertRegistry();
    registry.bindDatasetVersion(scope, binding);
    const inserted = registry.upsert(scope, input);
    const duplicate = registry.upsert(scope, input);

    expect(inserted.action).toBe('INSERTED');
    expect(duplicate).toMatchObject({ action: 'IDEMPOTENT', record: { mergedRecordId: inserted.record.mergedRecordId, revision: 1, lineage: { sourceJobId: 'job_1', sourceSequence: 1 } } });
    expect(JSON.stringify(inserted)).not.toContain('normalizedValue');
  });

  it('updates the stable merged record only for a strictly newer source sequence and preserves replacement lineage', () => {
    const registry = new DatasetDedupeUpsertRegistry();
    registry.bindDatasetVersion(scope, binding);
    const inserted = registry.upsert(scope, input);
    const updated = registry.upsert(scope, { ...input, incomingRecordId: 'incoming_2', recordChecksumSha256: 'd'.repeat(64), sourceTaskId: 'task_2', sourceAttemptId: 'attempt_2', artifactChecksumSha256: 'e'.repeat(64), sourceSequence: 2, observedAt: '2026-08-27T00:00:02.000Z' });

    expect(updated).toMatchObject({ action: 'UPDATED', record: { mergedRecordId: inserted.record.mergedRecordId, revision: 2, recordChecksumSha256: 'd'.repeat(64), lineage: { sourceTaskId: 'task_2', sourceAttemptId: 'attempt_2', sourceSequence: 2 } } });
  });

  it('rejects stale/conflicting updates, unbound or cross-scope versions, source-job mismatch and malformed identity fail-closed', () => {
    const registry = new DatasetDedupeUpsertRegistry();
    registry.bindDatasetVersion(scope, binding);
    registry.upsert(scope, input);
    expect(() => registry.upsert(scope, { ...input, recordChecksumSha256: 'f'.repeat(64) })).toThrowError(expect.objectContaining({ code: 'DATASET_DEDUPE_CONFLICT' }));
    expect(() => registry.upsert(scope, { ...input, sourceJobId: 'job_2', sourceSequence: 2 })).toThrowError(expect.objectContaining({ code: 'DATASET_DEDUPE_LINEAGE_MISMATCH' }));
    expect(() => registry.get({ tenantId: 'tenant_2', projectId: 'project_1' }, binding.datasetVersionId, input.dedupeKeyFingerprintSha256)).toThrowError(expect.objectContaining({ code: 'DATASET_DEDUPE_SCOPE_MISMATCH' }));
    expect(() => registry.upsert(scope, { ...input, dedupeKeyFingerprintSha256: 'not-a-sha' })).toThrow(DatasetDedupeUpsertError);
  });
});
