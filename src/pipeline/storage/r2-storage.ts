/**
 * Cloudflare R2 Storage Backend.
 * S3-compatible zero-egress object storage with account-specific endpoint construction.
 */

import { S3Storage, type S3StorageOptions } from "./s3-storage";

export interface R2StorageOptions extends Omit<S3StorageOptions, "region"> {
  accountId?: string;
  region?: string;
}

export class R2Storage extends S3Storage {
  override readonly backend = "r2";

  constructor(options: R2StorageOptions) {
    const endpoint =
      options.endpoint ||
      (options.accountId ? `https://${options.accountId}.r2.cloudflarestorage.com` : undefined);

    super({
      ...options,
      region: options.region || "auto",
      endpoint,
    });
  }
}
