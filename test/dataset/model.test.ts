import { describe, expect, it } from 'vitest';

import { DATASET_MODEL_CONTRACT_VERSION, DatasetModelError, DatasetModelRegistry } from '../../src/dataset/model.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const createdAt = '2026-08-27T00:00:00.000Z';
const draft = { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_1', name: 'catalog', createdAt };
const source = { sourceJobId: 'job_1', schema: { schemaId: 'schema_1', schemaName: 'product', schemaVersion: 1, schemaFingerprintSha256: 'a'.repeat(64) }, plan: { planId: 'plan_1', planVersion: 1, planFingerprintSha256: 'b'.repeat(64) }, boundAt: createdAt };

describe('dataset, dataset version and record lineage contracts', () => {
  it('creates tenant-scoped datasets with immutable sequential versions that trace job/schema/plan source', () => {
    const registry = new DatasetModelRegistry();
    expect(registry.createDataset(scope, draft)).toMatchObject({ datasetId: 'dataset_1', status: 'ACTIVE' });
    const first = registry.createVersion(scope, { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_1', source, createdAt });
    const duplicate = registry.createVersion(scope, { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_1', source, createdAt });
    const second = registry.createVersion(scope, { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_1', source: { ...source, plan: { ...source.plan, planVersion: 2, planFingerprintSha256: 'c'.repeat(64) } }, createdAt: '2026-08-27T00:01:00.000Z' });

    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({ versionNumber: 1, status: 'DRAFT', source: { sourceJobId: 'job_1', schema: { schemaFingerprintSha256: 'a'.repeat(64) }, plan: { planFingerprintSha256: 'b'.repeat(64) } } });
    expect(second.versionNumber).toBe(2);
  });

  it('records safe, idempotent record lineage bound to the dataset-version source job without record values', () => {
    const registry = new DatasetModelRegistry();
    registry.createDataset(scope, draft);
    const version = registry.createVersion(scope, { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_1', source, createdAt });
    const lineage = { recordId: 'record_1', sourceJobId: 'job_1', sourceTaskId: 'task_1', sourceAttemptId: 'attempt_1', artifactChecksumSha256: 'd'.repeat(64), recordChecksumSha256: 'e'.repeat(64), recordedAt: createdAt };

    expect(registry.appendRecordLineage(scope, version.datasetVersionId, lineage)).toEqual(registry.appendRecordLineage(scope, version.datasetVersionId, lineage));
    expect(registry.listRecordLineage(scope, version.datasetVersionId)).toEqual([{ ...lineage, datasetVersionId: version.datasetVersionId }]);
    expect(JSON.stringify(registry.listRecordLineage(scope, version.datasetVersionId))).not.toContain('normalizedValue');
  });

  it('rejects source-job mismatch, cross-scope access, malformed hashes and conflicting record ids fail-closed', () => {
    const registry = new DatasetModelRegistry();
    registry.createDataset(scope, draft);
    const version = registry.createVersion(scope, { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_1', source, createdAt });
    const lineage = { recordId: 'record_1', sourceJobId: 'job_1', sourceTaskId: 'task_1', sourceAttemptId: 'attempt_1', artifactChecksumSha256: 'd'.repeat(64), recordChecksumSha256: 'e'.repeat(64), recordedAt: createdAt };
    registry.appendRecordLineage(scope, version.datasetVersionId, lineage);

    expect(() => registry.appendRecordLineage(scope, version.datasetVersionId, { ...lineage, sourceJobId: 'job_2' })).toThrowError(expect.objectContaining({ code: 'DATASET_MODEL_LINEAGE_MISMATCH' }));
    expect(() => registry.getVersion({ tenantId: 'tenant_2', projectId: 'project_1' }, version.datasetVersionId)).toThrowError(expect.objectContaining({ code: 'DATASET_MODEL_SCOPE_MISMATCH' }));
    expect(() => registry.createVersion(scope, { contractVersion: DATASET_MODEL_CONTRACT_VERSION, datasetId: 'dataset_1', source: { ...source, plan: { ...source.plan, planFingerprintSha256: 'invalid' } }, createdAt })).toThrow(DatasetModelError);
    expect(() => registry.appendRecordLineage(scope, version.datasetVersionId, { ...lineage, recordChecksumSha256: 'f'.repeat(64) })).toThrowError(expect.objectContaining({ code: 'DATASET_MODEL_CONFLICT' }));
  });
});
