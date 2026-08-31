import type { PromptRepository, PromptRecord } from '../database/repositories/prompt-repository.js';

export type PromptResponseDto = {
  id: string;
  user_id: string;
  command: string;
  name: string;
  title: string; // for backward compatibility with UI
  content: string;
  meta: Record<string, unknown>;
  data: Record<string, unknown>;
  access_grants?: unknown[];
  created_at: number;
  updated_at: number;
};

const PROTOKOL7_BUILTIN_PROMPTS: PromptResponseDto[] = [
  {
    id: 'p7-scrape',
    user_id: 'system',
    command: 'scrape',
    name: 'Web Kazıma ve Veri Çıkarıcı',
    title: 'Web Kazıma ve Veri Çıkarıcı',
    content: 'Hedef URL adresindeki ürünleri, fiyatları veya makale içeriklerini otonom olarak analiz et ve yapısal JSON/CSV formatında çıkar.',
    meta: { category: 'scraping', is_builtin: true },
    data: {},
    created_at: 1700000000,
    updated_at: 1700000000
  },
  {
    id: 'p7-analyze',
    user_id: 'system',
    command: 'analyze',
    name: 'Hedef Güvenlik ve SPA Analizi',
    title: 'Hedef Güvenlik ve SPA Analizi',
    content: 'Hedef web sitesinin bot korumasını (Cloudflare vb.), SPA yapısını ve uygun proxy seviyesini tespit et.',
    meta: { category: 'analysis', is_builtin: true },
    data: {},
    created_at: 1700000000,
    updated_at: 1700000000
  },
  {
    id: 'p7-crawler',
    user_id: 'system',
    command: 'crawler',
    name: 'Otonom Çok Sayfalı Web Tarayıcı',
    title: 'Otonom Çok Sayfalı Web Tarayıcı',
    content: 'Belirtilen tohum URL havuzu ve filtre kurallarına göre arka planda otonom web tarama görevi başlat.',
    meta: { category: 'crawler', is_builtin: true },
    data: {},
    created_at: 1700000000,
    updated_at: 1700000000
  },
  {
    id: 'p7-schema',
    user_id: 'system',
    command: 'schema',
    name: 'Şema & CSS/XPath Sentezleyici',
    title: 'Şema & CSS/XPath Sentezleyici',
    content: 'Hedef sayfa yapısından otomatik CSS seçicileri, JSONPath ve veri şeması oluştur.',
    meta: { category: 'schema', is_builtin: true },
    data: {},
    created_at: 1700000000,
    updated_at: 1700000000
  }
];

function mapRecordToDto(record: PromptRecord): PromptResponseDto {
  const dto: PromptResponseDto = {
    id: record.id,
    user_id: record.userId,
    command: record.command,
    name: record.name,
    title: record.name,
    content: record.content,
    meta: record.metaJson,
    data: record.dataJson,
    created_at: Math.floor(record.createdAt.getTime() / 1000),
    updated_at: Math.floor(record.updatedAt.getTime() / 1000)
  };
  if (record.accessGrantsJson && record.accessGrantsJson.length > 0) {
    dto.access_grants = record.accessGrantsJson;
  }
  return dto;
}

export class PromptService {
  public constructor(private readonly promptRepository: PromptRepository) {}

  public async listPrompts(tenantId: string): Promise<PromptResponseDto[]> {
    let custom: PromptRecord[] = [];
    try {
      custom = await this.promptRepository.listByTenant(tenantId);
    } catch {
      custom = [];
    }

    const mappedCustom = custom.map(mapRecordToDto);
    return [...PROTOKOL7_BUILTIN_PROMPTS, ...mappedCustom];
  }

  public async getPromptByCommand(tenantId: string, command: string): Promise<PromptResponseDto | null> {
    const cleanCommand = command.replace(/^\//, '').trim();
    const builtin = PROTOKOL7_BUILTIN_PROMPTS.find((p) => p.command === cleanCommand);
    if (builtin) return builtin;

    try {
      const record = await this.promptRepository.findByCommand(tenantId, cleanCommand);
      return record ? mapRecordToDto(record) : null;
    } catch {
      return null;
    }
  }

  public async createPrompt(
    userId: string,
    tenantId: string,
    input: {
      command: string;
      name: string;
      content: string;
      meta?: Record<string, unknown>;
      data?: Record<string, unknown>;
      access_grants?: unknown[];
    }
  ): Promise<PromptResponseDto> {
    const createInput: {
      userId: string;
      tenantId: string;
      command: string;
      name: string;
      content: string;
      metaJson?: Record<string, unknown>;
      dataJson?: Record<string, unknown>;
      accessGrantsJson?: unknown[];
    } = {
      userId,
      tenantId,
      command: input.command,
      name: input.name,
      content: input.content
    };

    if (input.meta !== undefined) createInput.metaJson = input.meta;
    if (input.data !== undefined) createInput.dataJson = input.data;
    if (input.access_grants !== undefined) createInput.accessGrantsJson = input.access_grants;

    const created = await this.promptRepository.create(createInput);
    return mapRecordToDto(created);
  }

  public async updatePrompt(
    tenantId: string,
    command: string,
    patch: {
      command?: string;
      name?: string;
      content?: string;
      meta?: Record<string, unknown>;
      data?: Record<string, unknown>;
      access_grants?: unknown[];
    }
  ): Promise<PromptResponseDto | null> {
    const updateInput: {
      command?: string;
      name?: string;
      content?: string;
      metaJson?: Record<string, unknown>;
      dataJson?: Record<string, unknown>;
      accessGrantsJson?: unknown[];
    } = {};

    if (patch.command !== undefined) updateInput.command = patch.command;
    if (patch.name !== undefined) updateInput.name = patch.name;
    if (patch.content !== undefined) updateInput.content = patch.content;
    if (patch.meta !== undefined) updateInput.metaJson = patch.meta;
    if (patch.data !== undefined) updateInput.dataJson = patch.data;
    if (patch.access_grants !== undefined) updateInput.accessGrantsJson = patch.access_grants;

    const updated = await this.promptRepository.updateByCommand(tenantId, command, updateInput);
    return updated ? mapRecordToDto(updated) : null;
  }

  public async deletePrompt(tenantId: string, command: string): Promise<boolean> {
    return this.promptRepository.deleteByCommand(tenantId, command);
  }
}
