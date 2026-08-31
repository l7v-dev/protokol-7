import { createHash } from 'node:crypto';

export const DATASET_MODEL_CONTRACT_VERSION = 'dataset-model/v1' as const;

export type DatasetScope = {
  tenantId: string;
  projectId: string;
};

export type DatasetDraft = {
  contractVersion: typeof DATASET_MODEL_CONTRACT_VERSION;
  datasetId: string;
  name: string;
  createdAt: string;
};

export type Dataset = DatasetDraft & {
  status: 'ACTIVE';
};

export type DatasetVersionSource = {
  sourceJobId: string;
  schema: {
    schemaId: string;
    schemaName: string;
    schemaVersion: number;
    schemaFingerprintSha256: string;
  };
  plan: {
    planId: string;
    planVersion: number;
    planFingerprintSha256: string;
  };
  boundAt: string;
};

export type DatasetVersionDraft = {
  contractVersion: typeof DATASET_MODEL_CONTRACT_VERSION;
  datasetId: string;
  source: DatasetVersionSource;
  createdAt: string;
};

export type DatasetVersion = DatasetVersionDraft & {
  datasetVersionId: string;
  versionNumber: number;
  status: 'DRAFT';
};

export type DatasetRecordLineageInput = {
  recordId: string;
  sourceJobId: string;
  sourceTaskId: string;
  sourceAttemptId: string;
  artifactChecksumSha256: string;
  recordChecksumSha256: string;
  recordedAt: string;
};

export type DatasetRecordLineage = DatasetRecordLineageInput & {
  datasetVersionId: string;
};

export class DatasetModelError extends Error {
  public constructor(
    public readonly code: 'DATASET_MODEL_INVALID' | 'DATASET_MODEL_NOT_FOUND' | 'DATASET_MODEL_CONFLICT' | 'DATASET_MODEL_SCOPE_MISMATCH' | 'DATASET_MODEL_LINEAGE_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'DatasetModelError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_RECORDS_PER_VERSION = 100_000;

/**
 * Process-local reference registry for immutable dataset metadata and lineage.
 * It does not hold record values, publish data, access storage, or write to a database.
 */
export class DatasetModelRegistry {
  private readonly datasets = new Map<string, Dataset>();
  private readonly versions = new Map<string, DatasetVersion[]>();
  private readonly recordLineage = new Map<string, Map<string, DatasetRecordLineage>>();

  public createDataset(scope: DatasetScope, draft: DatasetDraft): Dataset {
    validateScope(scope);
    validateDatasetDraft(draft);
    const key = datasetKey(scope, draft.datasetId);
    const existing = this.datasets.get(key);
    if (existing) {
      if (sameDatasetDraft(existing, draft)) return cloneDataset(existing);
      throw new DatasetModelError('DATASET_MODEL_CONFLICT', 'Dataset kimliği farklı içerikle tekrar kullanılamaz.');
    }
    const dataset: Dataset = { ...draft, status: 'ACTIVE' };
    this.datasets.set(key, dataset);
    return cloneDataset(dataset);
  }

  public createVersion(scope: DatasetScope, draft: DatasetVersionDraft): DatasetVersion {
    validateScope(scope);
    validateVersionDraft(draft);
    this.requireDataset(scope, draft.datasetId);
    const key = datasetKey(scope, draft.datasetId);
    const versions = this.versions.get(key) ?? [];
    const equivalent = versions.find((version) => sameVersionDraft(version, draft));
    if (equivalent) return cloneVersion(equivalent);
    const versionNumber = versions.length + 1;
    const datasetVersionId = `dataset_version_${createHash('sha256').update(JSON.stringify({ scope, datasetId: draft.datasetId, versionNumber, source: draft.source })).digest('hex').slice(0, 24)}`;
    const version: DatasetVersion = { ...draft, source: cloneSource(draft.source), datasetVersionId, versionNumber, status: 'DRAFT' };
    this.versions.set(key, [...versions, version]);
    return cloneVersion(version);
  }

  public appendRecordLineage(scope: DatasetScope, datasetVersionId: string, input: DatasetRecordLineageInput): DatasetRecordLineage {
    validateScope(scope);
    validateId(datasetVersionId);
    validateRecordLineage(input);
    const version = this.requireVersion(scope, datasetVersionId);
    if (input.sourceJobId !== version.source.sourceJobId) {
      throw new DatasetModelError('DATASET_MODEL_LINEAGE_MISMATCH', 'Record lineage source job dataset version kaynağıyla eşleşmiyor.');
    }
    const records = this.recordLineage.get(datasetVersionScopeKey(scope, datasetVersionId)) ?? new Map<string, DatasetRecordLineage>();
    if (records.size >= MAX_RECORDS_PER_VERSION) throw new DatasetModelError('DATASET_MODEL_INVALID', 'Dataset version record-lineage sınırı aşıldı.');
    const record: DatasetRecordLineage = { ...input, datasetVersionId };
    const existing = records.get(input.recordId);
    if (existing) {
      if (sameRecordLineage(existing, record)) return { ...existing };
      throw new DatasetModelError('DATASET_MODEL_CONFLICT', 'Dataset record kimliği farklı lineage ile tekrar kullanılamaz.');
    }
    records.set(record.recordId, record);
    this.recordLineage.set(datasetVersionScopeKey(scope, datasetVersionId), records);
    return { ...record };
  }

  public getVersion(scope: DatasetScope, datasetVersionId: string): DatasetVersion {
    validateScope(scope);
    validateId(datasetVersionId);
    return cloneVersion(this.requireVersion(scope, datasetVersionId));
  }

  public listRecordLineage(scope: DatasetScope, datasetVersionId: string): ReadonlyArray<DatasetRecordLineage> {
    validateScope(scope);
    validateId(datasetVersionId);
    this.requireVersion(scope, datasetVersionId);
    return [...(this.recordLineage.get(datasetVersionScopeKey(scope, datasetVersionId))?.values() ?? [])].map((record) => ({ ...record }));
  }

  private requireDataset(scope: DatasetScope, datasetId: string): Dataset {
    const dataset = this.datasets.get(datasetKey(scope, datasetId));
    if (dataset) return dataset;
    if ([...this.datasets.values()].some((candidate) => candidate.datasetId === datasetId)) throw new DatasetModelError('DATASET_MODEL_SCOPE_MISMATCH', 'Dataset tenant veya project scope ile eşleşmiyor.');
    throw new DatasetModelError('DATASET_MODEL_NOT_FOUND', 'Dataset bulunamadı.');
  }

  private requireVersion(scope: DatasetScope, datasetVersionId: string): DatasetVersion {
    const version = [...this.versions.values()].flat().find((candidate) => candidate.datasetVersionId === datasetVersionId && this.datasets.get(datasetKey(scope, candidate.datasetId)) !== undefined);
    if (version) return version;
    if ([...this.versions.values()].flat().some((candidate) => candidate.datasetVersionId === datasetVersionId)) throw new DatasetModelError('DATASET_MODEL_SCOPE_MISMATCH', 'Dataset version tenant veya project scope ile eşleşmiyor.');
    throw new DatasetModelError('DATASET_MODEL_NOT_FOUND', 'Dataset version bulunamadı.');
  }
}

function validateDatasetDraft(draft: DatasetDraft): void {
  if (draft.contractVersion !== DATASET_MODEL_CONTRACT_VERSION || !SAFE_ID.test(draft.datasetId) || !SAFE_NAME.test(draft.name) || !isTime(draft.createdAt)) throw invalid();
}

function validateVersionDraft(draft: DatasetVersionDraft): void {
  if (draft.contractVersion !== DATASET_MODEL_CONTRACT_VERSION || !SAFE_ID.test(draft.datasetId) || !isTime(draft.createdAt)) throw invalid();
  const { source } = draft;
  if (!SAFE_ID.test(source.sourceJobId) || !SAFE_ID.test(source.schema.schemaId) || !SAFE_NAME.test(source.schema.schemaName) || !Number.isInteger(source.schema.schemaVersion) || source.schema.schemaVersion < 1 || !SHA256.test(source.schema.schemaFingerprintSha256) || !SAFE_ID.test(source.plan.planId) || !Number.isInteger(source.plan.planVersion) || source.plan.planVersion < 1 || !SHA256.test(source.plan.planFingerprintSha256) || !isTime(source.boundAt)) throw invalid();
}

function validateRecordLineage(input: DatasetRecordLineageInput): void {
  if (![input.recordId, input.sourceJobId, input.sourceTaskId, input.sourceAttemptId].every((value) => SAFE_ID.test(value)) || !SHA256.test(input.artifactChecksumSha256) || !SHA256.test(input.recordChecksumSha256) || !isTime(input.recordedAt)) throw invalid();
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

function datasetKey(scope: DatasetScope, datasetId: string): string {
  return `${scope.tenantId}:${scope.projectId}:${datasetId}`;
}

function datasetVersionScopeKey(scope: DatasetScope, datasetVersionId: string): string {
  return `${scope.tenantId}:${scope.projectId}:${datasetVersionId}`;
}

function sameDatasetDraft(existing: Dataset, draft: DatasetDraft): boolean {
  return existing.contractVersion === draft.contractVersion && existing.datasetId === draft.datasetId && existing.name === draft.name && existing.createdAt === draft.createdAt;
}

function sameVersionDraft(existing: DatasetVersion, draft: DatasetVersionDraft): boolean {
  return existing.contractVersion === draft.contractVersion && existing.datasetId === draft.datasetId && existing.createdAt === draft.createdAt && JSON.stringify(existing.source) === JSON.stringify(draft.source);
}

function sameRecordLineage(left: DatasetRecordLineage, right: DatasetRecordLineage): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cloneDataset(dataset: Dataset): Dataset {
  return { ...dataset };
}

function cloneSource(source: DatasetVersionSource): DatasetVersionSource {
  return { ...source, schema: { ...source.schema }, plan: { ...source.plan } };
}

function cloneVersion(version: DatasetVersion): DatasetVersion {
  return { ...version, source: cloneSource(version.source) };
}

function invalid(): DatasetModelError {
  return new DatasetModelError('DATASET_MODEL_INVALID', 'Dataset model input geçerli değil.');
}
