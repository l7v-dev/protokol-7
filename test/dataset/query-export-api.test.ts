import { describe, expect, it } from 'vitest';

import { DatasetQueryExportApi, DatasetQueryExportApiError, type DatasetQuerySource } from '../../src/dataset/query-export-api.js';

const context = { actorId: 'actor_1', actorType: 'user' as const, tenantId: 'tenant_1', roles: [], scopes: ['dataset:read', 'dataset:export'] };
const source: DatasetQuerySource = {
  async listVersions() {
    return { items: [{ contractVersion: 'dataset-model/v1', datasetId: 'dataset_1', datasetVersionId: 'dataset_version_1', versionNumber: 1, status: 'DRAFT', createdAt: '2026-08-27T00:00:00.000Z', source: { sourceJobId: 'job_1', schema: { schemaId: 'schema_1', schemaName: 'product', schemaVersion: 1, schemaFingerprintSha256: 'a'.repeat(64) }, plan: { planId: 'plan_1', planVersion: 1, planFingerprintSha256: 'b'.repeat(64) }, boundAt: '2026-08-27T00:00:00.000Z' } }], nextCursor: 'cursor_1' };
  },
  async getMergedRecord() {
    return { datasetVersionId: 'dataset_version_1', mergedRecordId: 'merged_1', dedupeKeyFingerprintSha256: 'c'.repeat(64), recordChecksumSha256: 'd'.repeat(64), revision: 1, lineage: { sourceJobId: 'job_1', sourceTaskId: 'task_1', sourceAttemptId: 'attempt_1', artifactChecksumSha256: 'e'.repeat(64), sourceSequence: 1, observedAt: '2026-08-27T00:00:00.000Z' } };
  }
};
const api = new DatasetQueryExportApi(source, { parquetEnabled: true, apiReadEnabled: true, s3DeliveryEnabled: true });

describe('dataset query and export control API contracts', () => {
  it('returns only safe version and record lineage projection through authorization-gated tenant scope', async () => {
    const versions = await api.listVersions(context, { projectId: 'project_1', datasetId: 'dataset_1', limit: 20 });
    const record = await api.getRecord(context, { projectId: 'project_1', datasetVersionId: 'dataset_version_1', dedupeKeyFingerprintSha256: 'c'.repeat(64) });

    expect(versions).toMatchObject({ nextCursor: 'cursor_1', items: [{ datasetVersionId: 'dataset_version_1', source: { sourceJobId: 'job_1' } }] });
    expect(record).toMatchObject({ mergedRecordId: 'merged_1', lineage: { sourceTaskId: 'task_1' } });
    expect(JSON.stringify(record)).not.toContain('rawValue');
  });

  it('creates only a capability-gated and non-delivery export control intent for authorized calls', () => {
    const intent = api.requestExportControl(context, { projectId: 'project_1', datasetVersionId: 'dataset_version_1', datasetVersionStatus: 'PUBLISHED', kind: 'S3', deliveryId: 'delivery_1', storageBindingId: 'binding_1' });

    expect(intent).toMatchObject({ status: 'INTENT_READY', requiresExplicitApproval: true, allowExternalDelivery: false, allowWorkerAction: false, allowBypass: false });
    expect(JSON.stringify(intent)).not.toContain('binding_1');
  });

  it('rejects missing scopes and invalid query/control input fail-closed', async () => {
    await expect(api.listVersions({ ...context, scopes: [] }, { projectId: 'project_1', datasetId: 'dataset_1' })).rejects.toMatchObject({ code: 'DATASET_API_FORBIDDEN' });
    expect(() => api.requestExportControl({ ...context, scopes: ['dataset:read'] }, { projectId: 'project_1', datasetVersionId: 'dataset_version_1', datasetVersionStatus: 'PUBLISHED', kind: 'S3', deliveryId: 'delivery_1', storageBindingId: 'binding_1' })).toThrow(DatasetQueryExportApiError);
    await expect(api.getRecord(context, { projectId: 'project_1', datasetVersionId: 'dataset_version_1', dedupeKeyFingerprintSha256: 'invalid' })).rejects.toMatchObject({ code: 'DATASET_API_INVALID' });
  });
});
