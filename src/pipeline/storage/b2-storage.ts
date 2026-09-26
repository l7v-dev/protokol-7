/**
 * Backblaze B2 Cloud Storage Backend.
 * S3-compatible object storage configured for Backblaze endpoints.
 */

import { S3Storage, type S3StorageOptions } from "./s3-storage";

export interface B2StorageOptions extends S3StorageOptions {}

export class B2Storage extends S3Storage {
  override readonly backend = "b2";

  constructor(options: B2StorageOptions) {
    const region = options.region || "us-east-005";
    const endpoint = options.endpoint || `https://s3.${region}.backblazeb2.com`;

    super({
      ...options,
      region,
      endpoint,
    });
  }
}
