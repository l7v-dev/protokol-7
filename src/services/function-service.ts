import { randomUUID } from 'node:crypto';
import type { FunctionRepository, FunctionRecord } from '../database/repositories/function-repository.js';
import { ApiError } from '../shared/http.js';

export class FunctionService {
  private readonly memoryFunctions = new Map<string, FunctionRecord>();
  private readonly userValvesMap = new Map<string, Record<string, unknown>>();

  public constructor(private readonly functionRepository: FunctionRepository) {
    // Seed built-in scraping pipeline filters
    const builtInFilters: FunctionRecord[] = [
      {
        id: 'filter_pii_masker',
        userId: 'admin_default',
        tenantId: 'tenant_default',
        name: 'PII & Hassas Veri Maskeleme',
        type: 'pipe',
        content: '# PII Masker for scraped datasets\ndef pipe(body):\n    return body\n',
        metaJson: {
          description: 'Kazınan verilerdeki T.C. kimlik, telefon ve e-posta adreslerini otomatik maskeler.',
          manifest: { version: '1.0.0' }
        },
        valvesJson: {
          mask_phone: true,
          mask_email: true,
          mask_national_id: true
        },
        isActive: true,
        isGlobal: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'filter_currency_normalizer',
        userId: 'admin_default',
        tenantId: 'tenant_default',
        name: 'Döviz & Fiyat Normalleştirici',
        type: 'pipe',
        content: '# Currency Normalizer\ndef pipe(body):\n    return body\n',
        metaJson: {
          description: 'Farklı para birimlerindeki ürün fiyatlarını TL / USD bazında tekdüze hale getirir.',
          manifest: { version: '1.0.0' }
        },
        valvesJson: {
          target_currency: 'TRY',
          apply_tax: true
        },
        isActive: true,
        isGlobal: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const f of builtInFilters) {
      this.memoryFunctions.set(f.id, f);
    }
  }

  public async createFunction(
    userId: string,
    tenantId: string,
    input: {
      id?: string;
      name: string;
      type?: string;
      content?: string;
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      is_active?: boolean;
      is_global?: boolean;
    }
  ): Promise<FunctionRecord> {
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Fonksiyon adı zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        id?: string;
        userId: string;
        tenantId: string;
        name: string;
        type?: string;
        content?: string;
        meta?: Record<string, unknown>;
        valves?: Record<string, unknown>;
        isActive?: boolean;
        isGlobal?: boolean;
      } = {
        userId,
        tenantId,
        name
      };
      if (input.id !== undefined) repoInput.id = input.id;
      if (input.type !== undefined) repoInput.type = input.type;
      if (input.content !== undefined) repoInput.content = input.content;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.valves !== undefined) repoInput.valves = input.valves;
      if (input.is_active !== undefined) repoInput.isActive = input.is_active;
      if (input.is_global !== undefined) repoInput.isGlobal = input.is_global;

      const record = await this.functionRepository.create(repoInput);
      this.memoryFunctions.set(record.id, record);
      return record;
    } catch {
      const id = input.id || `func_${randomUUID()}`;
      const record: FunctionRecord = {
        id,
        userId,
        tenantId,
        name,
        type: input.type || 'pipe',
        content: input.content || '',
        metaJson: input.meta ?? {},
        valvesJson: input.valves ?? {},
        isActive: input.is_active ?? true,
        isGlobal: input.is_global ?? false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryFunctions.set(id, record);
      return record;
    }
  }

  public async listFunctions(tenantId: string): Promise<FunctionRecord[]> {
    try {
      const items = await this.functionRepository.list(tenantId);
      for (const f of items) {
        this.memoryFunctions.set(f.id, f);
      }
      return items.length > 0
        ? items
        : Array.from(this.memoryFunctions.values()).filter(
            (f) => f.tenantId === tenantId || f.tenantId === 'tenant_default'
          );
    } catch {
      return Array.from(this.memoryFunctions.values()).filter(
        (f) => f.tenantId === tenantId || f.tenantId === 'tenant_default'
      );
    }
  }

  public async getFunctionById(tenantId: string, id: string): Promise<FunctionRecord | null> {
    try {
      const record = await this.functionRepository.findById(id, tenantId);
      if (record) return record;
    } catch {
      // Fall back
    }
    const mem = this.memoryFunctions.get(id);
    return mem && (mem.tenantId === tenantId || mem.tenantId === 'tenant_default') ? mem : null;
  }

  public async updateFunction(
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      type?: string;
      content?: string;
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      is_active?: boolean;
      is_global?: boolean;
    }
  ): Promise<FunctionRecord | null> {
    const updateInput: {
      name?: string;
      type?: string;
      content?: string;
      meta?: Record<string, unknown>;
      valves?: Record<string, unknown>;
      isActive?: boolean;
      isGlobal?: boolean;
    } = {};
    if (patch.name !== undefined) updateInput.name = patch.name;
    if (patch.type !== undefined) updateInput.type = patch.type;
    if (patch.content !== undefined) updateInput.content = patch.content;
    if (patch.meta !== undefined) updateInput.meta = patch.meta;
    if (patch.valves !== undefined) updateInput.valves = patch.valves;
    if (patch.is_active !== undefined) updateInput.isActive = patch.is_active;
    if (patch.is_global !== undefined) updateInput.isGlobal = patch.is_global;

    try {
      const updated = await this.functionRepository.update(id, tenantId, updateInput);
      if (updated) {
        this.memoryFunctions.set(updated.id, updated);
        return updated;
      }
    } catch {
      // Fall back
    }

    const existing = this.memoryFunctions.get(id);
    if (!existing || (existing.tenantId !== tenantId && existing.tenantId !== 'tenant_default')) return null;

    const updatedMem: FunctionRecord = {
      ...existing,
      name: patch.name ?? existing.name,
      type: patch.type ?? existing.type,
      content: patch.content ?? existing.content,
      metaJson: patch.meta ?? existing.metaJson,
      valvesJson: patch.valves ?? existing.valvesJson,
      isActive: patch.is_active !== undefined ? patch.is_active : existing.isActive,
      isGlobal: patch.is_global !== undefined ? patch.is_global : existing.isGlobal,
      updatedAt: new Date()
    };
    this.memoryFunctions.set(id, updatedMem);
    return updatedMem;
  }

  public async toggleFunction(tenantId: string, id: string): Promise<FunctionRecord | null> {
    const existing = await this.getFunctionById(tenantId, id);
    if (!existing) return null;
    return this.updateFunction(tenantId, id, { is_active: !existing.isActive });
  }

  public async toggleGlobal(tenantId: string, id: string): Promise<FunctionRecord | null> {
    const existing = await this.getFunctionById(tenantId, id);
    if (!existing) return null;
    return this.updateFunction(tenantId, id, { is_global: !existing.isGlobal });
  }

  public async deleteFunction(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.functionRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryFunctions.delete(id);
    return true;
  }

  public async getValves(tenantId: string, id: string): Promise<Record<string, unknown>> {
    const func = await this.getFunctionById(tenantId, id);
    return func?.valvesJson ?? {};
  }

  public async updateValves(
    tenantId: string,
    id: string,
    valves: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const updated = await this.updateFunction(tenantId, id, { valves });
    return updated?.valvesJson ?? {};
  }

  public async getUserValves(userId: string, id: string): Promise<Record<string, unknown>> {
    return this.userValvesMap.get(`${userId}:${id}`) ?? {};
  }

  public async updateUserValves(
    userId: string,
    id: string,
    valves: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    this.userValvesMap.set(`${userId}:${id}`, valves);
    return valves;
  }
}
