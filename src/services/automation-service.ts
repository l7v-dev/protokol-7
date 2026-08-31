import { randomUUID } from 'node:crypto';
import type {
  AutomationRepository,
  AutomationRecord,
  AutomationRunRecord
} from '../database/repositories/automation-repository.js';
import { ApiError } from '../shared/http.js';

export type AutomationResponseDto = {
  id: string;
  user_id: string;
  folder_id: string | null;
  name: string;
  data: Record<string, unknown>;
  meta: Record<string, unknown> | null;
  is_active: boolean;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number;
  updated_at: number;
  last_run: {
    id: string;
    automation_id: string;
    chat_id: string | null;
    status: string;
    error: string | null;
    created_at: number;
  } | null;
  next_runs: number[] | null;
};

export class AutomationService {
  private readonly memoryAutomations = new Map<string, AutomationRecord>();
  private readonly memoryRuns = new Map<string, AutomationRunRecord[]>();

  public constructor(private readonly automationRepository: AutomationRepository) {}

  private mapToDto(record: AutomationRecord, lastRun: AutomationRunRecord | null = null): AutomationResponseDto {
    return {
      id: record.id,
      user_id: record.userId,
      folder_id: record.folderId,
      name: record.name,
      data: record.dataJson,
      meta: record.metaJson,
      is_active: record.isActive,
      last_run_at: record.lastRunAt ? Math.floor(record.lastRunAt.getTime() / 1000) : null,
      next_run_at: record.nextRunAt ? Math.floor(record.nextRunAt.getTime() / 1000) : null,
      created_at: Math.floor(record.createdAt.getTime() / 1000),
      updated_at: Math.floor(record.updatedAt.getTime() / 1000),
      last_run: lastRun
        ? {
            id: lastRun.id,
            automation_id: lastRun.automationId,
            chat_id: lastRun.chatId,
            status: lastRun.status,
            error: lastRun.error,
            created_at: Math.floor(lastRun.createdAt.getTime() / 1000)
          }
        : null,
      next_runs: null
    };
  }

  public async createAutomation(
    userId: string,
    tenantId: string,
    input: {
      name: string;
      folder_id?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      is_active?: boolean;
    }
  ): Promise<AutomationResponseDto> {
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Otomasyon adı zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        name: string;
        folderId?: string | null;
        data?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        isActive?: boolean;
      } = {
        userId,
        tenantId,
        name
      };
      if (input.folder_id !== undefined) repoInput.folderId = input.folder_id;
      if (input.data !== undefined) repoInput.data = input.data;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.is_active !== undefined) repoInput.isActive = input.is_active;

      const record = await this.automationRepository.create(repoInput);
      this.memoryAutomations.set(record.id, record);
      return this.mapToDto(record);
    } catch {
      const id = `auto_${randomUUID()}`;
      const record: AutomationRecord = {
        id,
        userId,
        tenantId,
        folderId: input.folder_id ?? null,
        name,
        dataJson: input.data ?? {},
        metaJson: input.meta ?? {},
        isActive: input.is_active ?? true,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryAutomations.set(id, record);
      return this.mapToDto(record);
    }
  }

  public async listAutomations(
    userId: string,
    tenantId: string,
    filter: {
      query?: string | null;
      status?: string | null;
      folder_id?: string | null;
      page?: number;
    }
  ): Promise<{ items: AutomationResponseDto[]; total: number }> {
    let list: AutomationRecord[] = [];
    try {
      list = await this.automationRepository.listByUser(userId, tenantId);
      for (const item of list) {
        this.memoryAutomations.set(item.id, item);
      }
    } catch {
      list = Array.from(this.memoryAutomations.values()).filter(
        (a) => a.userId === userId && a.tenantId === tenantId
      );
    }

    if (filter.query) {
      const q = filter.query.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q));
    }
    if (filter.status === 'active') {
      list = list.filter((a) => a.isActive);
    } else if (filter.status === 'inactive') {
      list = list.filter((a) => !a.isActive);
    }
    if (filter.folder_id) {
      list = list.filter((a) => a.folderId === filter.folder_id);
    }

    const items = list.map((record) => this.mapToDto(record));
    return { items, total: items.length };
  }

  public async getAutomationById(tenantId: string, id: string): Promise<AutomationResponseDto | null> {
    try {
      const record = await this.automationRepository.findById(id, tenantId);
      if (record) {
        const runs = await this.automationRepository.listRuns(id, 1);
        return this.mapToDto(record, runs[0] ?? null);
      }
    } catch {
      // Fall back
    }
    const mem = this.memoryAutomations.get(id);
    if (!mem || mem.tenantId !== tenantId) return null;
    const runs = this.memoryRuns.get(id) || [];
    return this.mapToDto(mem, runs[0] ?? null);
  }

  public async updateAutomation(
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      folder_id?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      is_active?: boolean;
    }
  ): Promise<AutomationResponseDto | null> {
    const updateInput: {
      name?: string;
      folderId?: string | null;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      isActive?: boolean;
    } = {};
    if (patch.name !== undefined) updateInput.name = patch.name;
    if (patch.folder_id !== undefined) updateInput.folderId = patch.folder_id;
    if (patch.data !== undefined) updateInput.data = patch.data;
    if (patch.meta !== undefined) updateInput.meta = patch.meta;
    if (patch.is_active !== undefined) updateInput.isActive = patch.is_active;

    try {
      const updated = await this.automationRepository.update(id, tenantId, updateInput);
      if (updated) {
        this.memoryAutomations.set(updated.id, updated);
        return this.mapToDto(updated);
      }
    } catch {
      // Fall back
    }

    const existing = this.memoryAutomations.get(id);
    if (!existing || existing.tenantId !== tenantId) return null;

    const updatedMem: AutomationRecord = {
      ...existing,
      name: patch.name ?? existing.name,
      folderId: patch.folder_id !== undefined ? patch.folder_id : existing.folderId,
      dataJson: patch.data ?? existing.dataJson,
      metaJson: patch.meta ?? existing.metaJson,
      isActive: patch.is_active !== undefined ? patch.is_active : existing.isActive,
      updatedAt: new Date()
    };
    this.memoryAutomations.set(id, updatedMem);
    return this.mapToDto(updatedMem);
  }

  public async toggleAutomation(tenantId: string, id: string): Promise<AutomationResponseDto | null> {
    const existing = await this.getAutomationById(tenantId, id);
    if (!existing) return null;
    return this.updateAutomation(tenantId, id, { is_active: !existing.is_active });
  }

  public async runAutomation(tenantId: string, id: string): Promise<{ status: boolean; run: AutomationRunRecord }> {
    const existing = await this.getAutomationById(tenantId, id);
    if (!existing) {
      throw new ApiError({
        statusCode: 404,
        code: 'AUTOMATION_NOT_FOUND',
        category: 'VALIDATION',
        message: 'Otomasyon bulunamadı.',
        retryable: false
      });
    }

    const now = new Date();
    try {
      await this.automationRepository.update(id, tenantId, { lastRunAt: now });
      const run = await this.automationRepository.addRun(id, 'completed', null, null);
      return { status: true, run };
    } catch {
      const run: AutomationRunRecord = {
        id: `run_${randomUUID()}`,
        automationId: id,
        chatId: null,
        status: 'completed',
        error: null,
        createdAt: now
      };
      const existingRuns = this.memoryRuns.get(id) || [];
      this.memoryRuns.set(id, [run, ...existingRuns]);

      const mem = this.memoryAutomations.get(id);
      if (mem) {
        this.memoryAutomations.set(id, { ...mem, lastRunAt: now, updatedAt: now });
      }
      return { status: true, run };
    }
  }

  public async deleteAutomation(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.automationRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryAutomations.delete(id);
    this.memoryRuns.delete(id);
    return true;
  }

  public async getAutomationRuns(id: string, limit = 50, skip = 0): Promise<AutomationRunRecord[]> {
    try {
      return await this.automationRepository.listRuns(id, limit, skip);
    } catch {
      const runs = this.memoryRuns.get(id) || [];
      return runs.slice(skip, skip + limit);
    }
  }
}
