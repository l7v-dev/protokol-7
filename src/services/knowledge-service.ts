import { randomUUID } from 'node:crypto';
import type { KnowledgeRepository, KnowledgeRecord } from '../database/repositories/knowledge-repository.js';
import { ApiError } from '../shared/http.js';

export class KnowledgeService {
  private readonly memoryKnowledge = new Map<string, KnowledgeRecord>();

  public constructor(private readonly knowledgeRepository: KnowledgeRepository) {
    // Seed default knowledge base for target site scraping schemas
    const defaultKb: KnowledgeRecord = {
      id: 'kb_scraping_schemas',
      userId: 'admin_default',
      tenantId: 'tenant_default',
      name: 'E-Ticaret & Web Şablonları',
      description: 'Trendyol, Amazon, Hepsiburada ve popüler web siteleri için doğrulanmış CSS/XPath ve bot geçiş kuralları.',
      dataJson: {},
      metaJson: {
        document_count: 5,
        target_domains: ['trendyol.com', 'hepsiburada.com', 'amazon.com.tr']
      },
      accessGrantsJson: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.memoryKnowledge.set(defaultKb.id, defaultKb);
  }

  public async createKnowledge(
    userId: string,
    tenantId: string,
    input: {
      name: string;
      description?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    }
  ): Promise<KnowledgeRecord> {
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Bilgi bankası adı zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        name: string;
        description?: string;
        data?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        accessGrants?: Array<Record<string, unknown>>;
      } = {
        userId,
        tenantId,
        name
      };
      if (input.description !== undefined) repoInput.description = input.description;
      if (input.data !== undefined) repoInput.data = input.data;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.access_grants !== undefined) repoInput.accessGrants = input.access_grants;

      const kb = await this.knowledgeRepository.create(repoInput);
      this.memoryKnowledge.set(kb.id, kb);
      return kb;
    } catch {
      const id = `kb_${randomUUID()}`;
      const kb: KnowledgeRecord = {
        id,
        userId,
        tenantId,
        name,
        description: input.description || '',
        dataJson: input.data ?? {},
        metaJson: input.meta ?? {},
        accessGrantsJson: input.access_grants ?? [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memoryKnowledge.set(id, kb);
      return kb;
    }
  }

  public async listKnowledge(tenantId: string): Promise<KnowledgeRecord[]> {
    try {
      const items = await this.knowledgeRepository.list(tenantId);
      for (const k of items) {
        this.memoryKnowledge.set(k.id, k);
      }
      return items.length > 0 ? items : Array.from(this.memoryKnowledge.values());
    } catch {
      return Array.from(this.memoryKnowledge.values()).filter((k) => k.tenantId === tenantId || k.tenantId === 'tenant_default');
    }
  }

  public async getKnowledgeById(tenantId: string, id: string): Promise<KnowledgeRecord | null> {
    try {
      const kb = await this.knowledgeRepository.findById(id, tenantId);
      if (kb) return kb;
    } catch {
      // Fall back
    }
    const mem = this.memoryKnowledge.get(id);
    return mem && mem.tenantId === tenantId ? mem : null;
  }

  public async updateKnowledge(
    tenantId: string,
    id: string,
    patch: {
      name?: string;
      description?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      access_grants?: Array<Record<string, unknown>>;
    }
  ): Promise<KnowledgeRecord | null> {
    const updateInput: {
      name?: string;
      description?: string;
      data?: Record<string, unknown>;
      meta?: Record<string, unknown>;
      accessGrants?: Array<Record<string, unknown>>;
    } = {};
    if (patch.name !== undefined) updateInput.name = patch.name;
    if (patch.description !== undefined) updateInput.description = patch.description;
    if (patch.data !== undefined) updateInput.data = patch.data;
    if (patch.meta !== undefined) updateInput.meta = patch.meta;
    if (patch.access_grants !== undefined) updateInput.accessGrants = patch.access_grants;

    try {
      const updated = await this.knowledgeRepository.update(id, tenantId, updateInput);
      if (updated) {
        this.memoryKnowledge.set(updated.id, updated);
        return updated;
      }
    } catch {
      // Fall back
    }

    const existing = this.memoryKnowledge.get(id);
    if (!existing || existing.tenantId !== tenantId) return null;

    const updatedMem: KnowledgeRecord = {
      ...existing,
      name: patch.name ?? existing.name,
      description: patch.description ?? existing.description,
      dataJson: patch.data ?? existing.dataJson,
      metaJson: patch.meta ?? existing.metaJson,
      accessGrantsJson: patch.access_grants ?? existing.accessGrantsJson,
      updatedAt: new Date()
    };
    this.memoryKnowledge.set(id, updatedMem);
    return updatedMem;
  }

  public async deleteKnowledge(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.knowledgeRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memoryKnowledge.delete(id);
    return true;
  }
}
