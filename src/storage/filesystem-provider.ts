import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type { PutObjectInput, StorageObject, StorageProvider } from './provider.js';

export class UnsafeStorageKeyError extends Error {
  public constructor() {
    super('Storage key is outside the configured storage root.');
    this.name = 'UnsafeStorageKeyError';
  }
}

export class FilesystemStorageProvider implements StorageProvider {
  private readonly root: string;

  public constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  public async putObject(input: PutObjectInput): Promise<StorageObject> {
    const dataPath = this.pathFor(input.key);
    const metadataPath = `${dataPath}.metadata.json`;
    const metadata: StorageObject = {
      key: input.key,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
      checksumSha256: createHash('sha256').update(input.body).digest('hex'),
      createdAt: new Date(),
      metadata: input.metadata ?? {}
    };

    await mkdir(dirname(dataPath), { recursive: true });
    const temporaryPath = `${dataPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporaryPath, input.body, { flag: 'w' });
    await rename(temporaryPath, dataPath);
    await writeFile(metadataPath, JSON.stringify(metadata), { flag: 'w' });

    return metadata;
  }

  public async getObject(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  public async headObject(key: string): Promise<StorageObject | null> {
    try {
      const metadata = await readFile(`${this.pathFor(key)}.metadata.json`, 'utf8');
      return JSON.parse(metadata) as StorageObject;
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  public async deleteObject(key: string): Promise<void> {
    const dataPath = this.pathFor(key);
    await Promise.all([
      unlink(dataPath).catch(ignoreNotFound),
      unlink(`${dataPath}.metadata.json`).catch(ignoreNotFound)
    ]);
  }

  private pathFor(key: string): string {
    if (!key || key.includes('\0')) {
      throw new UnsafeStorageKeyError();
    }

    const candidate = resolve(this.root, key);
    if (candidate !== this.root && !candidate.startsWith(`${this.root}${sep}`)) {
      throw new UnsafeStorageKeyError();
    }

    return candidate;
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'ENOENT';
}

function ignoreNotFound(error: unknown): void {
  if (!isNotFound(error)) {
    throw error;
  }
}
