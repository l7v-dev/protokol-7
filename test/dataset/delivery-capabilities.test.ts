import { describe, expect, it } from 'vitest';

import { DATASET_DELIVERY_CONTRACT_VERSION, DatasetDeliveryCapabilityError, evaluateDatasetDeliveryCapability } from '../../src/dataset/delivery-capabilities.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const capabilities = { parquetEnabled: true, apiReadEnabled: true, s3DeliveryEnabled: true };
const request = {
  contractVersion: DATASET_DELIVERY_CONTRACT_VERSION,
  deliveryId: 'delivery_1',
  scope,
  datasetVersionId: 'dataset_version_1',
  datasetVersionStatus: 'PUBLISHED' as const,
  kind: 'PARQUET' as const,
  authorization: { ...scope, permissions: ['dataset:export'] as const }
};

describe('Parquet, API and S3 dataset delivery capability contracts', () => {
  it('returns capability-gated, non-delivery intents for published and authorized Parquet, API and S3 requests', () => {
    const parquet = evaluateDatasetDeliveryCapability(request, capabilities);
    const api = evaluateDatasetDeliveryCapability({ ...request, deliveryId: 'delivery_2', kind: 'API', authorization: { ...scope, permissions: ['dataset:read'] } }, capabilities);
    const s3 = evaluateDatasetDeliveryCapability({ ...request, deliveryId: 'delivery_3', kind: 'S3', storageBindingId: 'storage_binding_1' }, capabilities);

    expect(parquet).toMatchObject({ status: 'INTENT_READY', contentType: 'application/vnd.apache.parquet', allowExternalDelivery: false, allowWorkerAction: false, allowBypass: false });
    expect(api).toMatchObject({ status: 'INTENT_READY', contentType: 'application/json', requiresExplicitApproval: true });
    expect(s3).toMatchObject({ status: 'INTENT_READY', storageBindingFingerprintSha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(JSON.stringify(s3)).not.toContain('storage_binding_1');
  });

  it('blocks unpublished versions, scope/permission failures, disabled capabilities and missing S3 bindings', () => {
    expect(evaluateDatasetDeliveryCapability({ ...request, datasetVersionStatus: 'DRAFT' }, capabilities).reason).toBe('DATASET_VERSION_NOT_PUBLISHED');
    expect(evaluateDatasetDeliveryCapability({ ...request, authorization: { ...scope, tenantId: 'tenant_2', permissions: ['dataset:export'] } }, capabilities).reason).toBe('AUTHORIZATION_REQUIRED');
    expect(evaluateDatasetDeliveryCapability(request, { ...capabilities, parquetEnabled: false }).reason).toBe('CAPABILITY_DISABLED');
    expect(evaluateDatasetDeliveryCapability({ ...request, kind: 'S3' }, capabilities).reason).toBe('STORAGE_BINDING_REQUIRED');
  });

  it('rejects malformed scope, unknown permissions and unsafe storage binding identifiers fail-closed', () => {
    expect(() => evaluateDatasetDeliveryCapability({ ...request, scope: { tenantId: 'bad id', projectId: 'project_1' } }, capabilities)).toThrow(DatasetDeliveryCapabilityError);
    expect(() => evaluateDatasetDeliveryCapability({ ...request, authorization: { ...scope, permissions: ['admin'] as unknown as ['dataset:read'] } }, capabilities)).toThrow(DatasetDeliveryCapabilityError);
    expect(() => evaluateDatasetDeliveryCapability({ ...request, kind: 'S3', storageBindingId: 'https://bucket.example/export' }, capabilities)).toThrow(DatasetDeliveryCapabilityError);
  });
});
