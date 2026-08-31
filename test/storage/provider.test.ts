import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemStorageProvider, UnsafeStorageKeyError } from '../../src/storage/filesystem-provider.js';
import { InMemoryStorageProvider } from '../../src/storage/provider.js';

describe('storage providers', () => {
  it('stores and retrieves immutable metadata in memory', async () => {
    const storage = new InMemoryStorageProvider();
    const body = Buffer.from('{"ok":true}');

    const metadata = await storage.putObject({
      key: 'tenant_1/job_1/result.json',
      body,
      contentType: 'application/json',
      metadata: { tenantId: 'tenant_1', jobId: 'job_1' }
    });

    expect(metadata.sizeBytes).toBe(body.byteLength);
    expect(metadata.checksumSha256).toHaveLength(64);
    expect(await storage.getObject(metadata.key)).toEqual(body);
    expect(await storage.headObject(metadata.key)).toMatchObject({
      contentType: 'application/json',
      metadata: { tenantId: 'tenant_1' }
    });
  });

  it('supports filesystem storage and rejects traversal keys', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scraping-platform-storage-'));

    try {
      const storage = new FilesystemStorageProvider(root);
      const body = Buffer.from('artifact');
      await storage.putObject({ key: 'tenant_1/artifact.txt', body, contentType: 'text/plain' });

      expect(await storage.getObject('tenant_1/artifact.txt')).toEqual(body);
      await storage.deleteObject('tenant_1/artifact.txt');
      expect(await storage.getObject('tenant_1/artifact.txt')).toBeNull();
      await expect(storage.getObject('../outside.txt')).rejects.toBeInstanceOf(UnsafeStorageKeyError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
