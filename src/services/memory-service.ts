import { randomUUID } from 'node:crypto';
import type { MemoryRepository, MemoryRecord } from '../database/repositories/memory-repository.js';
import { ApiError } from '../shared/http.js';

export class MemoryService {
  private readonly memoryStore = new Map<string, MemoryRecord>();

  public constructor(private readonly memoryRepository: MemoryRepository) {}

  public async addMemory(
    userId: string,
    tenantId: string,
    input: {
      content: string;
      type?: string;
      path?: string;
    }
  ): Promise<MemoryRecord> {
    const content = input.content?.trim();
    if (!content) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Hafıza içeriği boş olamaz.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        content: string;
        type?: string;
        path?: string;
      } = {
        userId,
        tenantId,
        content
      };
      if (input.type !== undefined) repoInput.type = input.type;
      if (input.path !== undefined) repoInput.path = input.path;

      const record = await this.memoryRepository.create(repoInput);
      this.memoryStore.set(record.id, record);
      return record;
    } catch {
      const id = `mem_${randomUUID()}`;
      const record: MemoryRecord = {
        id,
        userId,
        tenantId,
        content,
        type: input.type || 'user',
        path: input.path || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryStore.set(id, record);
      return record;
    }
  }

  public async listMemories(userId: string, tenantId: string): Promise<MemoryRecord[]> {
    try {
      const records = await this.memoryRepository.listByUser(userId, tenantId);
      for (const r of records) {
        this.memoryStore.set(r.id, r);
      }
      return records;
    } catch {
      return Array.from(this.memoryStore.values()).filter(
        (m) => m.userId === userId && m.tenantId === tenantId
      );
    }
  }

  public async queryMemories(
    userId: string,
    tenantId: string,
    query: string
  ): Promise<Array<MemoryRecord & { score?: number }>> {
    const all = await this.listMemories(userId, tenantId);
    if (!query || !query.trim()) return all;

    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) return all;

    const scored = all.map((m) => {
      const lower = m.content.toLowerCase();
      let matchCount = 0;
      for (const w of words) {
        if (lower.includes(w)) matchCount++;
      }
      return { ...m, score: matchCount / words.length };
    });

    return scored.filter((s) => (s.score ?? 0) > 0).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  public async updateMemory(
    tenantId: string,
    id: string,
    patch: {
      content?: string;
      type?: string;
      path?: string;
    }
  ): Promise<MemoryRecord | null> {
    const updateInput: {
      content?: string;
      type?: string;
      path?: string;
    } = {};
    if (patch.content !== undefined) updateInput.content = patch.content;
    if (patch.type !== undefined) updateInput.type = patch.type;
    if (patch.path !== undefined) updateInput.path = patch.path;

    try {
      const updated = await this.memoryRepository.update(id, tenantId, updateInput);
      if (updated) {
        this.memoryStore.set(updated.id, updated);
        return updated;
      }
    } catch {
      // Fall back
    }

    const existing = this.memoryStore.get(id);
    if (!existing || existing.tenantId !== tenantId) return null;

    const updatedMem: MemoryRecord = {
      ...existing,
      content: patch.content ?? existing.content,
      type: patch.type ?? existing.type,
      path: patch.path ?? existing.path,
      updatedAt: new Date()
    };
    this.memoryStore.set(id, updatedMem);
    return updatedMem;
  }

  public async deleteMemory(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.memoryRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryStore.delete(id);
    return true;
  }

  public async deleteMemoriesByUser(userId: string, tenantId: string): Promise<boolean> {
    try {
      await this.memoryRepository.deleteAllByUser(userId, tenantId);
    } catch {
      // Fall back
    }
    for (const [key, val] of this.memoryStore.entries()) {
      if (val.userId === userId && val.tenantId === tenantId) {
        this.memoryStore.delete(key);
      }
    }
    return true;
  }
}
