import type { AuthContext } from '../shared/auth.js';
import { hasScope } from '../shared/authz.js';

import { evaluateDatasetDeliveryCapability, type DatasetDeliveryCapabilities, type DatasetDeliveryIntent, type DatasetDeliveryKind } from './delivery-capabilities.js';
import type { DatasetMergedRecord } from './dedupe-upsert.js';
import type { DatasetScope, DatasetVersion } from './model.js';

export type DatasetQueryPage = {
  items: ReadonlyArray<DatasetVersion>;
  nextCursor?: string;
};

export type DatasetQuerySource = {
  listVersions(scope: DatasetScope, datasetId: string, limit: number, afterCursor?: string): Promise<DatasetQueryPage>;
  getMergedRecord(scope: DatasetScope, datasetVersionId: string, dedupeKeyFingerprintSha256: string): Promise<DatasetMergedRecord | null>;
};

export type DatasetQueryRequest = {
  projectId: string;
  datasetId: string;
  limit?: number;
  afterCursor?: string;
};

export type DatasetRecordQueryRequest = {
  projectId: string;
  datasetVersionId: string;
  dedupeKeyFingerprintSha256: string;
};

export type DatasetExportControlRequest = {
  projectId: string;
  datasetVersionId: string;
  datasetVersionStatus: 'DRAFT' | 'PUBLISHED' | 'ABORTED';
  kind: DatasetDeliveryKind;
  deliveryId: string;
  storageBindingId?: string;
};

export class DatasetQueryExportApiError extends Error {
  public constructor(public readonly code: 'DATASET_API_INVALID' | 'DATASET_API_FORBIDDEN', message: string) {
    super(message);
    this.name = 'DatasetQueryExportApiError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_LIMIT = 200;

/**
 * API-facing service contract, deliberately independent from HTTP routing. It
 * exposes only safe metadata/query shapes and evaluates export controls; it
 * never serializes records, delivers data, or accesses storage itself.
 */
export class DatasetQueryExportApi {
  public constructor(
    private readonly source: DatasetQuerySource,
    private readonly capabilities: DatasetDeliveryCapabilities
  ) {}

  public async listVersions(context: AuthContext, request: DatasetQueryRequest): Promise<DatasetQueryPage> {
    validateQueryRequest(request);
    requireScope(context, 'dataset:read');
    const page = await this.source.listVersions(scope(context, request.projectId), request.datasetId, request.limit ?? 50, request.afterCursor);
    validatePage(page);
    return { items: page.items.map(cloneVersion), ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }) };
  }

  public async getRecord(context: AuthContext, request: DatasetRecordQueryRequest): Promise<DatasetMergedRecord | null> {
    validateRecordRequest(request);
    requireScope(context, 'dataset:read');
    const record = await this.source.getMergedRecord(scope(context, request.projectId), request.datasetVersionId, request.dedupeKeyFingerprintSha256);
    return record ? cloneRecord(record) : null;
  }

  public requestExportControl(context: AuthContext, request: DatasetExportControlRequest): DatasetDeliveryIntent {
    validateExportRequest(request);
    const requiredScope = request.kind === 'API' ? 'dataset:read' : 'dataset:export';
    requireScope(context, requiredScope);
    return evaluateDatasetDeliveryCapability({
      contractVersion: 'dataset-delivery/v1',
      deliveryId: request.deliveryId,
      scope: scope(context, request.projectId),
      datasetVersionId: request.datasetVersionId,
      datasetVersionStatus: request.datasetVersionStatus,
      kind: request.kind,
      authorization: {
        tenantId: context.tenantId,
        projectId: request.projectId,
        permissions: [request.kind === 'API' ? 'dataset:read' : 'dataset:export']
      },
      ...(request.storageBindingId === undefined ? {} : { storageBindingId: request.storageBindingId })
    }, this.capabilities);
  }
}

function validateQueryRequest(request: DatasetQueryRequest): void {
  if (!SAFE_ID.test(request.projectId) || !SAFE_ID.test(request.datasetId) || (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_LIMIT)) || (request.afterCursor !== undefined && !SAFE_ID.test(request.afterCursor))) throw invalid();
}

function validateRecordRequest(request: DatasetRecordQueryRequest): void {
  if (!SAFE_ID.test(request.projectId) || !SAFE_ID.test(request.datasetVersionId) || !SHA256.test(request.dedupeKeyFingerprintSha256)) throw invalid();
}

function validateExportRequest(request: DatasetExportControlRequest): void {
  if (!SAFE_ID.test(request.projectId) || !SAFE_ID.test(request.datasetVersionId) || !SAFE_ID.test(request.deliveryId)
    || !['DRAFT', 'PUBLISHED', 'ABORTED'].includes(request.datasetVersionStatus)
    || !['PARQUET', 'API', 'S3'].includes(request.kind)
    || (request.storageBindingId !== undefined && !SAFE_ID.test(request.storageBindingId))) throw invalid();
}

function validatePage(page: DatasetQueryPage): void {
  if (!Array.isArray(page.items) || page.items.length > MAX_LIMIT || (page.nextCursor !== undefined && !SAFE_ID.test(page.nextCursor))) throw invalid();
}

function requireScope(context: AuthContext, requiredScope: string): void {
  if (!hasScope(context, requiredScope)) throw new DatasetQueryExportApiError('DATASET_API_FORBIDDEN', 'Dataset query veya export control yetkisi yok.');
}

function scope(context: AuthContext, projectId: string): DatasetScope {
  return { tenantId: context.tenantId, projectId };
}

function cloneVersion(version: DatasetVersion): DatasetVersion {
  return { ...version, source: { ...version.source, schema: { ...version.source.schema }, plan: { ...version.source.plan } } };
}

function cloneRecord(record: DatasetMergedRecord): DatasetMergedRecord {
  return { ...record, lineage: { ...record.lineage } };
}

function invalid(): DatasetQueryExportApiError {
  return new DatasetQueryExportApiError('DATASET_API_INVALID', 'Dataset query veya export control request geçerli değil.');
}
