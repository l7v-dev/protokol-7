/**
 * AWS S3 Storage Backend.
 * Uploads artifacts to Amazon S3 buckets with cryptographic SHA-256 receipt generation.
 */

import { createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageBackend, StorageReceipt } from "./index";

export interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

export interface S3StorageOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  client?: S3ClientLike;
}

export function detectMimeType(fileName: string): string {
  if (fileName.endsWith(".jsonl")) return "application/x-ndjson";
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".csv")) return "text/csv";
  if (fileName.endsWith(".parquet")) return "application/vnd.apache.parquet";
  return "application/octet-stream";
}

export class S3Storage implements StorageBackend {
  readonly backend: string = "s3";
  protected readonly bucket: string;
  protected readonly client: S3ClientLike;

  constructor(options: S3StorageOptions) {
    if (!options.bucket) {
      throw new Error("S3Storage requires a valid bucket name.");
    }
    this.bucket = options.bucket;

    if (options.client) {
      this.client = options.client;
    } else {
      this.client = new S3Client({
        region: options.region || "us-east-1",
        endpoint: options.endpoint,
        credentials: options.credentials
          ? {
              accessKeyId: options.credentials.accessKeyId,
              secretAccessKey: options.credentials.secretAccessKey,
            }
          : undefined,
      });
    }
  }

  async upload(fileName: string, data: Buffer, prefix = ""): Promise<StorageReceipt> {
    const cleanPrefix = prefix ? (prefix.endsWith("/") ? prefix : `${prefix}/`) : "";
    const key = `${cleanPrefix}${fileName}`;
    const hash = createHash("sha256").update(data).digest("hex");
    const contentType = detectMimeType(fileName);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
    });

    await this.client.send(command);

    return {
      backend: this.backend,
      uri: `${this.backend}://${this.bucket}/${key}`,
      bytesWritten: data.length,
      checksumSha256: hash,
      timestamp: new Date().toISOString(),
    };
  }

  getBucket(): string {
    return this.bucket;
  }
}
