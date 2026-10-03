/**
 * Cloudflare R2 Object Store Adapter — protokol-7
 *
 * Implements ObjectStore contract for Cloudflare R2 / S3-compatible zero-egress
 * lake storage using @aws-sdk/client-s3.
 */

import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Capabilities, ObjectStore, StorageRef } from "../../../contracts/index.js";

export interface R2ObjectStoreOptions {
  providerId?: string;
  container: string; // bucket name
  accountId?: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
}

export class R2ObjectStore implements ObjectStore {
  readonly capabilities: Capabilities = {
    multipart: true,
    ranged_read: true,
    conditional_create: true,
    versioning: true,
    presign: true,
    server_side_copy: true,
    retention: false,
  };

  readonly providerId: string;
  readonly container: string;
  private readonly client: S3Client;

  constructor(options: R2ObjectStoreOptions) {
    this.providerId = options.providerId || "r2";
    this.container = options.container;

    const endpoint =
      options.endpoint ||
      (options.accountId ? `https://${options.accountId}.r2.cloudflarestorage.com` : undefined);

    if (!endpoint) {
      throw new Error("InvalidConfiguration: R2ObjectStore requires either endpoint or accountId");
    }

    this.client = new S3Client({
      region: options.region || "auto",
      endpoint,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async putStream(key: string, data: AsyncIterable<Uint8Array>): Promise<StorageRef> {
    const chunks: Buffer[] = [];
    const hash = createHash("sha256");
    let totalBytes = 0;

    for await (const chunk of data) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      hash.update(buffer);
      totalBytes += buffer.byteLength;
    }

    const payload = Buffer.concat(chunks);
    const sha256 = hash.digest("hex");

    const command = new PutObjectCommand({
      Bucket: this.container,
      Key: key,
      Body: payload,
      ContentLength: totalBytes,
      Metadata: {
        sha256,
      },
    });

    const response = await this.client.send(command);

    return {
      provider_id: this.providerId,
      container: this.container,
      key,
      version: response.VersionId || null,
      sha256,
      bytes: totalBytes,
    };
  }

  async *openStream(
    ref: StorageRef,
    range?: { start: number; endExclusive: number }
  ): AsyncIterable<Uint8Array> {
    const rangeHeader = range ? `bytes=${range.start}-${range.endExclusive - 1}` : undefined;

    const command = new GetObjectCommand({
      Bucket: this.container,
      Key: ref.key,
      Range: rangeHeader,
      VersionId: ref.version || undefined,
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`NotFoundError: object '${ref.key}' has empty body`);
    }

    const stream = response.Body as Readable;
    for await (const chunk of stream) {
      yield typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    }
  }

  async head(ref: StorageRef): Promise<StorageRef> {
    const command = new HeadObjectCommand({
      Bucket: this.container,
      Key: ref.key,
      VersionId: ref.version || undefined,
    });

    const response = await this.client.send(command);
    const sha256 = response.Metadata?.sha256 || "";

    return {
      provider_id: this.providerId,
      container: this.container,
      key: ref.key,
      version: response.VersionId || null,
      sha256,
      bytes: response.ContentLength || 0,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.container,
        Key: key,
      });
      await this.client.send(command);
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async listPage(
    prefix: string,
    cursor?: string
  ): Promise<{ items: StorageRef[]; next: string | null }> {
    const command = new ListObjectsV2Command({
      Bucket: this.container,
      Prefix: prefix,
      ContinuationToken: cursor,
      MaxKeys: 100,
    });

    const response = await this.client.send(command);
    const items: StorageRef[] = (response.Contents || []).map((entry) => ({
      provider_id: this.providerId,
      container: this.container,
      key: entry.Key || "",
      version: null,
      sha256: "",
      bytes: entry.Size || 0,
    }));

    return {
      items,
      next: response.NextContinuationToken || null,
    };
  }

  async delete(ref: StorageRef): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.container,
      Key: ref.key,
      VersionId: ref.version || undefined,
    });

    await this.client.send(command);
  }
}
