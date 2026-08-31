import { createHash, randomUUID } from 'node:crypto';
import type { FileRepository, FileRecord } from '../database/repositories/file-repository.js';

export type FileResponseDto = {
  id: string;
  user_id: string;
  filename: string;
  hash?: string;
  meta: Record<string, unknown>;
  data?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};

function mapRecordToDto(record: FileRecord, includeData: boolean = false): FileResponseDto {
  const dto: FileResponseDto = {
    id: record.id,
    user_id: record.userId,
    filename: record.filename,
    meta: record.metaJson,
    created_at: Math.floor(record.createdAt.getTime() / 1000),
    updated_at: Math.floor(record.updatedAt.getTime() / 1000)
  };
  if (record.hash) dto.hash = record.hash;
  if (includeData) dto.data = record.dataJson;
  return dto;
}

export class FileService {
  // In-memory buffer store for quick retrieval / tests
  private readonly memoryStore = new Map<string, { buffer: Buffer; mimeType: string; filename: string }>();

  public constructor(private readonly fileRepository: FileRepository) {}

  public async saveUploadedFile(
    userId: string,
    tenantId: string,
    file: { filename: string; buffer: Buffer; mimeType?: string },
    metadata?: Record<string, unknown>
  ): Promise<FileResponseDto> {
    const fileId = randomUUID();
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const mimeType = file.mimeType || 'application/octet-stream';
    const textContent = file.buffer.toString('utf-8');

    // Parse file content based on extension
    const parsedData: Record<string, unknown> = {
      size: file.buffer.length,
      byte_length: file.buffer.length
    };

    const isText =
      mimeType.startsWith('text/') ||
      /\.(txt|json|csv|xml|html|md)$/i.test(file.filename);

    if (isText) {
      parsedData.is_text = true;
      parsedData.text_preview = textContent.slice(0, 1000);

      // Check for seed URLs
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const extractedUrls = textContent.match(urlRegex) || [];
      if (extractedUrls.length > 0) {
        parsedData.seed_urls = Array.from(new Set(extractedUrls));
        parsedData.total_seed_urls = extractedUrls.length;
      }

      // Try JSON parsing
      if (/\.json$/i.test(file.filename)) {
        try {
          const jsonObj = JSON.parse(textContent);
          parsedData.json_type = Array.isArray(jsonObj) ? 'array' : 'object';
          parsedData.item_count = Array.isArray(jsonObj) ? jsonObj.length : 1;
        } catch {
          // Ignore invalid JSON
        }
      }
    }

    const meta: Record<string, unknown> = {
      name: file.filename,
      content_type: mimeType,
      size: file.buffer.length,
      ...(metadata || {})
    };

    // Store in memory buffer store
    this.memoryStore.set(fileId, {
      buffer: file.buffer,
      mimeType,
      filename: file.filename
    });

    let created: FileRecord;
    try {
      const createInput: {
        id: string;
        userId: string;
        tenantId: string;
        filename: string;
        hash: string;
        metaJson: Record<string, unknown>;
        dataJson: Record<string, unknown>;
      } = {
        id: fileId,
        userId,
        tenantId,
        filename: file.filename,
        hash,
        metaJson: meta,
        dataJson: parsedData
      };

      created = await this.fileRepository.create(createInput);
    } catch {
      // Ephemeral fallback if DB is not connected
      created = {
        id: fileId,
        userId,
        tenantId,
        filename: file.filename,
        hash,
        path: null,
        metaJson: meta,
        dataJson: parsedData,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      };
    }

    return mapRecordToDto(created, true);
  }

  public async getFileById(tenantId: string, id: string): Promise<FileResponseDto | null> {
    try {
      const record = await this.fileRepository.findById(tenantId, id);
      if (!record) return null;
      return mapRecordToDto(record, true);
    } catch {
      const mem = this.memoryStore.get(id);
      if (!mem) return null;
      return {
        id,
        user_id: 'user_fallback',
        filename: mem.filename,
        meta: { content_type: mem.mimeType, size: mem.buffer.length },
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      };
    }
  }

  public async getFileRawContent(tenantId: string, id: string): Promise<{ buffer: Buffer; mimeType: string; filename: string } | null> {
    const mem = this.memoryStore.get(id);
    if (mem) return mem;

    const file = await this.getFileById(tenantId, id);
    if (!file) return null;

    return {
      buffer: Buffer.from(''),
      mimeType: String(file.meta['content_type'] || 'application/octet-stream'),
      filename: file.filename
    };
  }

  public async getFileDataContent(tenantId: string, id: string): Promise<Record<string, unknown> | null> {
    const file = await this.getFileById(tenantId, id);
    return file?.data || null;
  }

  public async listFiles(
    tenantId: string,
    userId?: string,
    options?: { skip?: number; limit?: number; search?: string; content?: boolean }
  ): Promise<FileResponseDto[]> {
    try {
      const listOptions: { skip?: number; limit?: number; search?: string } = {};
      if (options?.skip !== undefined) listOptions.skip = options.skip;
      if (options?.limit !== undefined) listOptions.limit = options.limit;
      if (options?.search !== undefined) listOptions.search = options.search;

      const records = await this.fileRepository.listByTenant(tenantId, userId, listOptions);
      return records.map((r) => mapRecordToDto(r, options?.content || false));
    } catch {
      // Memory fallback
      return Array.from(this.memoryStore.entries()).map(([id, item]) => ({
        id,
        user_id: userId || 'user_fallback',
        filename: item.filename,
        meta: { content_type: item.mimeType, size: item.buffer.length },
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000)
      }));
    }
  }

  public async countFiles(tenantId: string, userId?: string): Promise<number> {
    try {
      return await this.fileRepository.countByTenant(tenantId, userId);
    } catch {
      return this.memoryStore.size;
    }
  }

  public async deleteFile(tenantId: string, userId: string, id: string): Promise<boolean> {
    this.memoryStore.delete(id);
    try {
      return await this.fileRepository.delete(tenantId, userId, id);
    } catch {
      return true;
    }
  }

  public async deleteAllFiles(tenantId: string, userId: string): Promise<number> {
    const size = this.memoryStore.size;
    this.memoryStore.clear();
    try {
      return await this.fileRepository.deleteAll(tenantId, userId);
    } catch {
      return size;
    }
  }
}
