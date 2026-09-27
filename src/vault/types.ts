/**
 * src/vault/types.ts
 *
 * Types and contracts for Cold Vault offline storage packaging and verification.
 * Conforms to docs/protokol-cold-vault-mimari-sartnamesi.md.
 */

export interface VolumeInfo {
  volumeId: string;
  volumeLabel: string;
  schemaVersion: string;
  filesystem: "btrfs" | "ext4" | "other";
  createdAt: string;
  updatedAt: string;
  datasetsCount?: number;
  totalBytes?: number;
}

export interface ColdVaultExportOptions {
  datasetName: string;
  version?: string;
  snapshotId?: string;
  volumeRoot: string;
  volumeLabel?: string;
  filesystem?: "btrfs" | "ext4" | "other";
  copyMode?: "copy" | "hardlink";
  verifyChecksums?: boolean;
}

export interface ExportedShardReceipt {
  shardId: string;
  fileName: string;
  relativeVaultPath: string;
  destinationUri: string;
  sizeBytes: number;
  sha256Hash: string;
  verified: boolean;
}

export interface ColdVaultExportReceipt {
  exportId: string;
  datasetName: string;
  version: string;
  snapshotId?: string;
  volumeRoot: string;
  volumeLabel: string;
  totalShards: number;
  totalSizeBytes: number;
  manifestVaultPath: string;
  sha256sumsVaultPath: string;
  shards: ExportedShardReceipt[];
  exportedAt: string;
}

export interface VolumeVerificationItem {
  relativeVaultPath: string;
  expectedSha256: string;
  actualSha256?: string;
  status: "verified" | "corrupted" | "missing";
  sizeBytes?: number;
  error?: string;
}

export interface VolumeVerificationResult {
  volumeRoot: string;
  volumeLabel?: string;
  status: "healthy" | "corrupted" | "incomplete";
  totalFiles: number;
  verifiedFiles: number;
  corruptedFiles: number;
  missingFiles: number;
  items: VolumeVerificationItem[];
  verifiedAt: string;
}
