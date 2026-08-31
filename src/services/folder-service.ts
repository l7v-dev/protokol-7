import { randomUUID } from 'node:crypto';
import type { FolderRepository, FolderRecord } from '../database/repositories/folder-repository.js';
import { ApiError } from '../shared/http.js';

export class FolderService {
  private readonly memoryFolders = new Map<string, FolderRecord>();

  public constructor(private readonly folderRepository: FolderRepository) {}

  public async createFolder(
    userId: string,
    tenantId: string,
    input: {
      name?: string;
      parent_id?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      is_expanded?: boolean;
    }
  ): Promise<FolderRecord> {
    const name = input.name?.trim() || 'Yeni Klasör';

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        name: string;
        parentId?: string | null;
        data?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        isExpanded?: boolean;
      } = {
        userId,
        tenantId,
        name
      };
      if (input.parent_id !== undefined) repoInput.parentId = input.parent_id;
      if (input.data !== undefined) repoInput.data = input.data;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.is_expanded !== undefined) repoInput.isExpanded = input.is_expanded;

      const folder = await this.folderRepository.create(repoInput);
      this.memoryFolders.set(folder.id, folder);
      return folder;
    } catch {
      const id = `folder_${randomUUID()}`;
      const folder: FolderRecord = {
        id,
        parentId: input.parent_id ?? null,
        userId,
        tenantId,
        name,
        dataJson: input.data ?? {},
        metaJson: input.meta ?? {},
        isExpanded: input.is_expanded ?? false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryFolders.set(id, folder);
      return folder;
    }
  }

  public async listFolders(userId: string, tenantId: string): Promise<FolderRecord[]> {
    try {
      const folders = await this.folderRepository.listByUser(userId, tenantId);
      for (const f of folders) {
        this.memoryFolders.set(f.id, f);
      }
      return folders;
    } catch {
      return Array.from(this.memoryFolders.values()).filter(
        (f) => f.userId === userId && f.tenantId === tenantId
      );
    }
  }

  public async getFolderById(tenantId: string, id: string): Promise<FolderRecord | null> {
    try {
      const folder = await this.folderRepository.findById(id, tenantId);
      if (folder) return folder;
    } catch {
      // Fall back
    }
    const mem = this.memoryFolders.get(id);
    return mem && mem.tenantId === tenantId ? mem : null;
  }

  public async updateFolder(
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      parent_id?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      is_expanded?: boolean;
    }
  ): Promise<FolderRecord | null> {
    const updateInput: {
      name?: string;
      parentId?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      isExpanded?: boolean;
    } = {};
    if (patch.name !== undefined) updateInput.name = patch.name;
    if (patch.parent_id !== undefined) updateInput.parentId = patch.parent_id;
    if (patch.data !== undefined) updateInput.data = patch.data;
    if (patch.meta !== undefined) updateInput.meta = patch.meta;
    if (patch.is_expanded !== undefined) updateInput.isExpanded = patch.is_expanded;

    try {
      const updated = await this.folderRepository.update(id, tenantId, updateInput);
      if (updated) {
        this.memoryFolders.set(updated.id, updated);
        return updated;
      }
    } catch {
      // Fall back
    }

    const existing = this.memoryFolders.get(id);
    if (!existing || existing.tenantId !== tenantId) return null;

    const updatedMem: FolderRecord = {
      ...existing,
      name: patch.name ?? existing.name,
      parentId: patch.parent_id !== undefined ? patch.parent_id : existing.parentId,
      dataJson: patch.data ?? existing.dataJson,
      metaJson: patch.meta ?? existing.metaJson,
      isExpanded: patch.is_expanded !== undefined ? patch.is_expanded : existing.isExpanded,
      updatedAt: new Date()
    };
    this.memoryFolders.set(id, updatedMem);
    return updatedMem;
  }

  public async deleteFolder(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.folderRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryFolders.delete(id);
    return true;
  }
}
