/**
 * Storage Backend interfaces and StorageReceipt data contract.
 */

export interface StorageReceipt {
  backend: string;
  uri: string;
  bytesWritten: number;
  checksumSha256: string;
  timestamp: string;
}

export interface StorageBackend {
  readonly backend: string;
  upload(fileName: string, data: Buffer, prefix?: string): Promise<StorageReceipt>;
}

export * from "./local-storage";
