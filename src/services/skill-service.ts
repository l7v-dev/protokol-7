import { randomUUID } from 'node:crypto';
import type { SkillRepository, SkillRecord } from '../database/repositories/skill-repository.js';
import { ApiError } from '../shared/http.js';

export class SkillService {
  private readonly memorySkills = new Map<string, SkillRecord>();

  public constructor(private readonly skillRepository: SkillRepository) {
    // Seed built-in scraping skills
    const defaultSkills: SkillRecord[] = [
      {
        id: 'skill_anti_bot_bypass',
        tenantId: 'tenant_default',
        userId: 'admin_default',
        name: 'Anti-Bot & Cloudflare Aşma',
        description: 'Stealth header, TLS fingerprint ve konut proxy rotasyonu ile bot korumalarını aşar.',
        content: '# Anti-Bot Skill\ndef run(url):\n    return {"status": "bypassed"}\n',
        metaJson: { tags: ['security', 'bypass', 'scraping'] },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'skill_table_extractor',
        tenantId: 'tenant_default',
        userId: 'admin_default',
        name: 'HTML Tablo & JSON Çıkarıcı',
        description: 'Karmaşık HTML tablolarını ve listelerini parse ederek yapılandırılmış JSON ve CSV haline getirir.',
        content: '# Table Extractor Skill\ndef run(html):\n    return []\n',
        metaJson: { tags: ['extractor', 'table', 'json'] },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'skill_auto_crawler',
        tenantId: 'tenant_default',
        userId: 'admin_default',
        name: 'Otonom Sayfalama & Tarayıcı',
        description: 'Sitemap.xml ve sayfalama butonlarını takip ederek tüm siteyi derinlemesine tarar.',
        content: '# Auto Crawler Skill\ndef run(seed):\n    return []\n',
        metaJson: { tags: ['crawler', 'sitemap', 'pagination'] },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const s of defaultSkills) {
      this.memorySkills.set(s.id, s);
    }
  }

  public async createSkill(
    userId: string,
    tenantId: string,
    input: {
      name: string;
      description?: string;
      content?: string;
      meta?: Record<string, unknown>;
      is_active?: boolean;
    }
  ): Promise<SkillRecord> {
    const name = input.name?.trim();
    if (!name) {
      throw new ApiError({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        category: 'VALIDATION',
        message: 'Beceri adı zorunludur.',
        retryable: false
      });
    }

    try {
      const repoInput: {
        userId: string;
        tenantId: string;
        name: string;
        description?: string;
        content?: string;
        meta?: Record<string, unknown>;
        isActive?: boolean;
      } = {
        userId,
        tenantId,
        name
      };
      if (input.description !== undefined) repoInput.description = input.description;
      if (input.content !== undefined) repoInput.content = input.content;
      if (input.meta !== undefined) repoInput.meta = input.meta;
      if (input.is_active !== undefined) repoInput.isActive = input.is_active;

      const record = await this.skillRepository.create(repoInput);
      this.memorySkills.set(record.id, record);
      return record;
    } catch {
      const id = `skill_${randomUUID()}`;
      const record: SkillRecord = {
        id,
        tenantId,
        userId,
        name,
        description: input.description || '',
        content: input.content || '',
        metaJson: input.meta ?? {},
        isActive: input.is_active ?? true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.memorySkills.set(id, record);
      return record;
    }
  }

  public async listSkills(tenantId: string, query?: string | null): Promise<SkillRecord[]> {
    let items: SkillRecord[] = [];
    try {
      items = await this.skillRepository.list(tenantId);
      for (const item of items) {
        this.memorySkills.set(item.id, item);
      }
      if (items.length === 0) {
        items = Array.from(this.memorySkills.values()).filter(
          (s) => s.tenantId === tenantId || s.tenantId === 'tenant_default'
        );
      }
    } catch {
      items = Array.from(this.memorySkills.values()).filter(
        (s) => s.tenantId === tenantId || s.tenantId === 'tenant_default'
      );
    }

    if (query) {
      const q = query.toLowerCase();
      items = items.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
    }

    return items;
  }

  public async getSkillById(tenantId: string, id: string): Promise<SkillRecord | null> {
    try {
      const record = await this.skillRepository.findById(id, tenantId);
      if (record) return record;
    } catch {
      // Fall back
    }
    const mem = this.memorySkills.get(id);
    return mem && (mem.tenantId === tenantId || mem.tenantId === 'tenant_default') ? mem : null;
  }

  public async deleteSkill(tenantId: string, id: string): Promise<boolean> {
    try {
      await this.skillRepository.delete(id, tenantId);
    } catch {
      // Fall back
    }
    this.memorySkills.delete(id);
    return true;
  }
}
