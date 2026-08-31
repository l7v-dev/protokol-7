import type { AppConfig } from '../config/env.js';
import { FilesystemStorageProvider } from './filesystem-provider.js';
import { InMemoryStorageProvider, type StorageProvider } from './provider.js';

export class UnsupportedStorageModeError extends Error {
  public constructor(mode: string) {
    super(`Storage mode '${mode}' is not implemented in this backend package.`);
    this.name = 'UnsupportedStorageModeError';
  }
}

export function createStorageProvider(
  config: Pick<AppConfig, 'storageMode' | 'storageRoot'>
): StorageProvider {
  if (config.storageMode === 'memory') {
    return new InMemoryStorageProvider();
  }

  if (config.storageMode === 'filesystem') {
    return new FilesystemStorageProvider(config.storageRoot);
  }

  throw new UnsupportedStorageModeError(config.storageMode);
}
