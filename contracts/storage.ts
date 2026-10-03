// Contract only. Implement provider adapters and conformance tests.
export type StorageRef = {
  provider_id: string;
  container: string;
  key: string;
  version: string | null;
  sha256: string;
  bytes: number;
};
export type Capabilities = {
  multipart: boolean;
  ranged_read: boolean;
  conditional_create: boolean;
  versioning: boolean;
  presign: boolean;
  server_side_copy: boolean;
  retention: boolean;
};
export interface ObjectStore {
  readonly capabilities: Capabilities;
  putStream(key: string, data: AsyncIterable<Uint8Array>): Promise<StorageRef>;
  openStream(
    ref: StorageRef,
    range?: { start: number; endExclusive: number }
  ): AsyncIterable<Uint8Array>;
  head(ref: StorageRef): Promise<StorageRef>;
  exists(key: string): Promise<boolean>;
  listPage(prefix: string, cursor?: string): Promise<{ items: StorageRef[]; next: string | null }>;
  // Administrative permission and reference/retention check required.
  delete(ref: StorageRef): Promise<void>;
}
