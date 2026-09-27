export interface ShardManifestEntry {
  shardId: string;
  fileName: string;
  storageUri: string;
  recordCount: number;
  sizeBytes: number;
  sha256Hash: string;
  compressionCodec?: string;
}

export interface SplitDefinition {
  shardCount: number;
  recordCount: number;
  sizeBytes: number;
  shards: ShardManifestEntry[];
}

export interface TrainingDatasetManifest {
  schemaVersion: "1.0.0";
  snapshotId: string;
  datasetName: string;
  version: string;
  title?: string;
  description?: string;
  createdAt: string;
  license: {
    group: string;
    details?: string;
  };
  statistics: {
    totalShards: number;
    totalRecords: number;
    totalSizeBytes: number;
    totalTokensEstimated: number;
    compressionCodec: string;
  };
  splits: Record<string, SplitDefinition>;
  checksumsSha256: Record<string, string>;
  metadata?: Record<string, unknown>;
}

export interface SplitRatios {
  train: number;
  validation?: number;
  test?: number;
}

export interface PublishDatasetOptions {
  datasetName: string;
  version?: string;
  title?: string;
  description?: string;
  shardIds?: string[];
  filePaths?: string[];
  splitRatios?: SplitRatios;
  explicitSplits?: Record<string, string[]>;
  outputDir?: string;
  connectorName?: string;
  connectorPrefix?: string;
  licenseGroup?:
    | "permissive_commercial"
    | "non_commercial_research"
    | "public_domain"
    | "restricted";
  licenseDetails?: string;
  metadata?: Record<string, unknown>;
  verifyChecksumsOnDisk?: boolean;
}

export interface PublishDatasetResult {
  snapshotId: string;
  datasetName: string;
  version: string;
  manifestUri: string;
  manifest: TrainingDatasetManifest;
  splits: Record<string, SplitDefinition>;
  remoteReceipt?: {
    backend: string;
    uri: string;
    bytesWritten: number;
  };
}
