/**
 * Local Object Store Adapter — protokol-7
 *
 * Implements ObjectStore contract with strict path traversal prevention,
 * atomic fsync commits, immutable conflict detection, and ranged reads.
 */

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Capabilities, ObjectStore, StorageRef } from "../../../contracts/index.js";

export interface LocalObjectStoreOptions {
  providerId?: string;
  container?: string;
  baseDir: string;
}

export class LocalObjectStore implements ObjectStore {
  readonly capabilities: Capabilities = {
    multipart: false,
    ranged_read: true,
    conditional_create: true,
    versioning: false,
    presign: false,
    server_side_copy: false,
    retention: false,
  };

  readonly providerId: string;
  readonly container: string;
  readonly baseDir: string;

  constructor(options: LocalObjectStoreOptions) {
    this.providerId = options.providerId || "local";
    this.container = options.container || "pool";
    this.baseDir = path.resolve(options.baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private resolveKey(key: string): string {
    if (!key || key.startsWith("/") || key.includes("\\") || key.split("/").includes("..")) {
      throw new Error(`SecurityInvariantViolation: invalid key format '${key}'`);
    }

    const resolved = path.resolve(this.baseDir, key);
    if (!resolved.startsWith(this.baseDir + path.sep) && resolved !== this.baseDir) {
      throw new Error(`SecurityInvariantViolation: key escapes base root '${key}'`);
    }

    // Inspect path components for symlink attacks
    let current = resolved;
    while (current !== this.baseDir && current !== path.dirname(current)) {
      if (fs.existsSync(current)) {
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink()) {
          throw new Error(`SecurityInvariantViolation: symlink detected along path '${key}'`);
        }
      }
      current = path.dirname(current);
    }

    return resolved;
  }

  async putStream(key: string, data: AsyncIterable<Uint8Array>): Promise<StorageRef> {
    const targetPath = this.resolveKey(key);
    const parentDir = path.dirname(targetPath);
    fs.mkdirSync(parentDir, { recursive: true });

    // Write incoming stream to a temporary file in the same directory for atomic rename
    const tempPath = path.join(parentDir, `.tmp-${randomUUID()}`);
    const hash = createHash("sha256");
    let bytesWritten = 0;

    const fd = fs.openSync(tempPath, "w");
    try {
      for await (const chunk of data) {
        fs.writeSync(fd, chunk);
        hash.update(chunk);
        bytesWritten += chunk.byteLength;
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    const calculatedSha256 = hash.digest("hex");

    if (fs.existsSync(targetPath)) {
      // Existing file check: immutable conflict vs idempotency
      const existingData = fs.readFileSync(targetPath);
      const existingSha256 = createHash("sha256").update(existingData).digest("hex");
      fs.unlinkSync(tempPath);

      if (existingSha256 !== calculatedSha256) {
        throw new Error(
          `ImmutableConflict: key '${key}' already exists with sha256 '${existingSha256}', cannot overwrite with '${calculatedSha256}'`
        );
      }

      return {
        provider_id: this.providerId,
        container: this.container,
        key,
        version: null,
        sha256: existingSha256,
        bytes: existingData.byteLength,
      };
    }

    // Atomic move
    fs.renameSync(tempPath, targetPath);

    return {
      provider_id: this.providerId,
      container: this.container,
      key,
      version: null,
      sha256: calculatedSha256,
      bytes: bytesWritten,
    };
  }

  async *openStream(
    ref: StorageRef,
    range?: { start: number; endExclusive: number }
  ): AsyncIterable<Uint8Array> {
    const targetPath = this.resolveKey(ref.key);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`NotFoundError: object '${ref.key}' does not exist`);
    }

    const start = range?.start ?? 0;
    const end = range?.endExclusive !== undefined ? range.endExclusive - 1 : undefined;

    const stream = fs.createReadStream(targetPath, {
      start,
      end,
    });

    for await (const chunk of stream) {
      yield typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    }
  }

  async head(ref: StorageRef): Promise<StorageRef> {
    const targetPath = this.resolveKey(ref.key);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`NotFoundError: object '${ref.key}' does not exist`);
    }

    const data = fs.readFileSync(targetPath);
    const sha256 = createHash("sha256").update(data).digest("hex");

    return {
      provider_id: this.providerId,
      container: this.container,
      key: ref.key,
      version: null,
      sha256,
      bytes: data.byteLength,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      const targetPath = this.resolveKey(key);
      return fs.existsSync(targetPath);
    } catch {
      return false;
    }
  }

  async listPage(
    prefix: string,
    cursor?: string
  ): Promise<{ items: StorageRef[]; next: string | null }> {
    const normalizedPrefix = prefix.replace(/^[/\\]+/, "");
    const results: StorageRef[] = [];

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && !entry.name.startsWith(".tmp-")) {
          const relativeKey = path.relative(this.baseDir, fullPath).replace(/\\/g, "/");
          if (relativeKey.startsWith(normalizedPrefix)) {
            const stat = fs.statSync(fullPath);
            results.push({
              provider_id: this.providerId,
              container: this.container,
              key: relativeKey,
              version: null,
              sha256: "", // Deferred for high throughput listing
              bytes: stat.size,
            });
          }
        }
      }
    };

    walk(this.baseDir);
    results.sort((a, b) => a.key.localeCompare(b.key));

    const pageSize = 100;
    const startIndex = cursor ? results.findIndex((item) => item.key > cursor) : 0;
    const actualStart = startIndex >= 0 ? startIndex : 0;
    const items = results.slice(actualStart, actualStart + pageSize);
    const next =
      items.length === pageSize && actualStart + pageSize < results.length
        ? items[items.length - 1].key
        : null;

    return { items, next };
  }

  async delete(ref: StorageRef): Promise<void> {
    const targetPath = this.resolveKey(ref.key);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  }
}
