import { createHash } from 'node:crypto';

export type StorageObject = {
  key: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: Date;
  metadata: Record<string, string>;
};

export type PutObjectInput = {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
};

export interface StorageProvider {
  putObject(input: PutObjectInput): Promise<StorageObject>;
  getObject(key: string): Promise<Buffer | null>;
  headObject(key: string): Promise<StorageObject | null>;
  deleteObject(key: string): Promise<void>;
}

export class InMemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, { body: Buffer; metadata: StorageObject }>();

  public async putObject(input: PutObjectInput): Promise<StorageObject> {
    const metadata: StorageObject = {
      key: input.key,
      contentType: input.contentType,
      sizeBytes: input.body.byteLength,
      checksumSha256: createHash('sha256').update(input.body).digest('hex'),
      createdAt: new Date(),
      metadata: input.metadata ?? {}
    };
    this.objects.set(input.key, { body: Buffer.from(input.body), metadata });
    return metadata;
  }

  public async getObject(key: string): Promise<Buffer | null> {
    const object = this.objects.get(key);
    return object ? Buffer.from(object.body) : null;
  }

  public async headObject(key: string): Promise<StorageObject | null> {
    return this.objects.get(key)?.metadata ?? null;
  }

  public async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
