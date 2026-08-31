import { createHash } from 'node:crypto';

import type { DatasetScope } from './model.js';

export const DATASET_DELIVERY_CONTRACT_VERSION = 'dataset-delivery/v1' as const;

export type DatasetDeliveryKind = 'PARQUET' | 'API' | 'S3';

export type DatasetDeliveryCapabilities = {
  parquetEnabled: boolean;
  apiReadEnabled: boolean;
  s3DeliveryEnabled: boolean;
};

export type DatasetDeliveryRequest = {
  contractVersion: typeof DATASET_DELIVERY_CONTRACT_VERSION;
  deliveryId: string;
  scope: DatasetScope;
  datasetVersionId: string;
  datasetVersionStatus: 'DRAFT' | 'PUBLISHED' | 'ABORTED';
  kind: DatasetDeliveryKind;
  authorization: {
    tenantId: string;
    projectId: string;
    permissions: ReadonlyArray<'dataset:read' | 'dataset:export'>;
  };
  storageBindingId?: string;
};

export type DatasetDeliveryIntent = {
  contractVersion: typeof DATASET_DELIVERY_CONTRACT_VERSION;
  deliveryId: string;
  datasetVersionId: string;
  kind: DatasetDeliveryKind;
  status: 'INTENT_READY' | 'DELIVERY_BLOCKED';
  reason: 'READY_FOR_MANUAL_IMPLEMENTATION' | 'DATASET_VERSION_NOT_PUBLISHED' | 'AUTHORIZATION_REQUIRED' | 'CAPABILITY_DISABLED' | 'STORAGE_BINDING_REQUIRED';
  contentType: 'application/vnd.apache.parquet' | 'application/json' | 'application/octet-stream';
  storageBindingFingerprintSha256?: string;
  requiresExplicitApproval: true;
  allowExternalDelivery: false;
  allowWorkerAction: false;
  allowBypass: false;
};

export class DatasetDeliveryCapabilityError extends Error {
  public constructor(public readonly code: 'DATASET_DELIVERY_INVALID', message: string) {
    super(message);
    this.name = 'DatasetDeliveryCapabilityError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Pure capability/policy evaluator for future Parquet, authenticated API and
 * S3-compatible delivery. It does not serialize Parquet, expose an API route,
 * resolve a bucket, use credentials, write storage, or make network calls.
 */
export function evaluateDatasetDeliveryCapability(
  request: DatasetDeliveryRequest,
  capabilities: DatasetDeliveryCapabilities
): DatasetDeliveryIntent {
  validateRequest(request);
  validateCapabilities(capabilities);
  const common = {
    contractVersion: DATASET_DELIVERY_CONTRACT_VERSION,
    deliveryId: request.deliveryId,
    datasetVersionId: request.datasetVersionId,
    kind: request.kind,
    contentType: contentTypeFor(request.kind),
    requiresExplicitApproval: true as const,
    allowExternalDelivery: false as const,
    allowWorkerAction: false as const,
    allowBypass: false as const
  };
  if (request.datasetVersionStatus !== 'PUBLISHED') return { ...common, status: 'DELIVERY_BLOCKED', reason: 'DATASET_VERSION_NOT_PUBLISHED' };
  if (!isAuthorized(request)) return { ...common, status: 'DELIVERY_BLOCKED', reason: 'AUTHORIZATION_REQUIRED' };
  if (!isEnabled(request.kind, capabilities)) return { ...common, status: 'DELIVERY_BLOCKED', reason: 'CAPABILITY_DISABLED' };
  if (request.kind === 'S3' && request.storageBindingId === undefined) return { ...common, status: 'DELIVERY_BLOCKED', reason: 'STORAGE_BINDING_REQUIRED' };
  return {
    ...common,
    status: 'INTENT_READY',
    reason: 'READY_FOR_MANUAL_IMPLEMENTATION',
    ...(request.storageBindingId === undefined ? {} : { storageBindingFingerprintSha256: fingerprint(request.storageBindingId) })
  };
}

function validateRequest(request: DatasetDeliveryRequest): void {
  if (request.contractVersion !== DATASET_DELIVERY_CONTRACT_VERSION
    || !isScope(request.scope) || !SAFE_ID.test(request.deliveryId) || !SAFE_ID.test(request.datasetVersionId)
    || !['DRAFT', 'PUBLISHED', 'ABORTED'].includes(request.datasetVersionStatus)
    || !['PARQUET', 'API', 'S3'].includes(request.kind)
    || !isScope(request.authorization) || request.authorization.permissions.length === 0 || request.authorization.permissions.length > 2
    || new Set(request.authorization.permissions).size !== request.authorization.permissions.length
    || request.authorization.permissions.some((permission) => !['dataset:read', 'dataset:export'].includes(permission))
    || (request.storageBindingId !== undefined && !SAFE_ID.test(request.storageBindingId))) throw invalid();
}

function validateCapabilities(capabilities: DatasetDeliveryCapabilities): void {
  if (typeof capabilities.parquetEnabled !== 'boolean' || typeof capabilities.apiReadEnabled !== 'boolean' || typeof capabilities.s3DeliveryEnabled !== 'boolean') throw invalid();
}

function isScope(value: DatasetScope): boolean {
  return SAFE_ID.test(value.tenantId) && SAFE_ID.test(value.projectId);
}

function isAuthorized(request: DatasetDeliveryRequest): boolean {
  return request.authorization.tenantId === request.scope.tenantId
    && request.authorization.projectId === request.scope.projectId
    && (request.kind === 'API' ? request.authorization.permissions.includes('dataset:read') : request.authorization.permissions.includes('dataset:export'));
}

function isEnabled(kind: DatasetDeliveryKind, capabilities: DatasetDeliveryCapabilities): boolean {
  return (kind === 'PARQUET' && capabilities.parquetEnabled)
    || (kind === 'API' && capabilities.apiReadEnabled)
    || (kind === 'S3' && capabilities.s3DeliveryEnabled);
}

function contentTypeFor(kind: DatasetDeliveryKind): DatasetDeliveryIntent['contentType'] {
  if (kind === 'PARQUET') return 'application/vnd.apache.parquet';
  if (kind === 'API') return 'application/json';
  return 'application/octet-stream';
}

function fingerprint(storageBindingId: string): string {
  return createHash('sha256').update(storageBindingId).digest('hex');
}

function invalid(): DatasetDeliveryCapabilityError {
  return new DatasetDeliveryCapabilityError('DATASET_DELIVERY_INVALID', 'Dataset delivery capability input geçerli değil.');
}
