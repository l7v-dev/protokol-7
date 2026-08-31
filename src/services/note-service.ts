import { randomUUID } from 'node:crypto';
import type { NoteRepository, NoteRecord } from '../database/repositories/note-repository.js';
import { ApiError } from '../shared/http.js';

export class NoteService {
  private readonly memoryNotes = new Map<string, NoteRecord>();

  public constructor(private readonly noteRepository: NoteRepository) {}

  public async createNote(
    userId: string,
    tenantId: string,
    input: {
      title: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    }
  ): Promise<NoteRecord> {
    const title = input.title?.trim();
    if (!title) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Not başlığı zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        title: string;
        data?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        accessGrants?: Array<Record<string, unknown>>;
      } = {
        userId,
        tenantId,
        title
      };
      if (input.data !== undefined) repoInput.data = input.data;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.access_grants !== undefined) repoInput.accessGrants = input.access_grants;

      const record = await this.noteRepository.create(repoInput);
      this.memoryNotes.set(record.id, record);
      return record;
    } catch {
      const id = `note_${randomUUID()}`;
      const record: NoteRecord = {
        id,
        userId,
        tenantId,
        title,
        dataJson: input.data ?? {},
        metaJson: input.meta ?? {},
        accessGrantsJson: input.access_grants ?? [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryNotes.set(id, record);
      return record;
    }
  }

  public async listNotes(userId: string, tenantId: string): Promise<NoteRecord[]> {
    try {
      const items = await this.noteRepository.listByUser(userId, tenantId);
      for (const item of items) {
        this.memoryNotes.set(item.id, item);
      }
      return items;
    } catch {
      return Array.from(this.memoryNotes.values()).filter(
        (n) => n.userId === userId && n.tenantId === tenantId
      );
    }
  }

  public async getNoteById(tenantId: string, id: string): Promise<NoteRecord | null> {
    try {
      const record = await this.noteRepository.findById(id, tenantId);
      if (record) return record;
    } catch {
      // Fall back
    }
    const mem = this.memoryNotes.get(id);
    return mem && mem.tenantId === tenantId ? mem : null;
  }

  public async updateNote(
    tenantId: string,
    id: string,
    patch: {
      title?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    }
  ): Promise<NoteRecord | null> {
    const updateInput: {
      title?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      accessGrants?: Array<Record<string, unknown>>;
    } = {};
    if (patch.title !== undefined) updateInput.title = patch.title;
    if (patch.data !== undefined) updateInput.data = patch.data;
    if (patch.meta !== undefined) updateInput.meta = patch.meta;
    if (patch.access_grants !== undefined) updateInput.accessGrants = patch.access_grants;

    try {
      const updated = await this.noteRepository.update(id, tenantId, updateInput);
      if (updated) {
        this.memoryNotes.set(updated.id, updated);
        return updated;
      }
    } catch {
      // Fall back
    }

    const existing = this.memoryNotes.get(id);
    if (!existing || existing.tenantId !== tenantId) return null;

    const updatedMem: NoteRecord = {
      ...existing,
      title: patch.title ?? existing.title,
      dataJson: patch.data ?? existing.dataJson,
      metaJson: patch.meta ?? existing.metaJson,
      accessGrantsJson: patch.access_grants ?? existing.accessGrantsJson,
      updatedAt: new Date()
    };
    this.memoryNotes.set(id, updatedMem);
    return updatedMem;
  }

  public async deleteNote(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.noteRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryNotes.delete(id);
    return true;
  }
}
