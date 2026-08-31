import { ApiError } from '../shared/http.js';
import type { ModelRepository, ModelRecord } from '../database/repositories/model-repository.js';

export type ModelResponseDto = {
  id: string;
  name: string;
  object: 'model';
  created: number;
  owned_by: string;
  base_model_id?: string | null;
  info?: {
    id?: string;
    user_id?: string | null;
    base_model_id?: string | null;
    name?: string;
    meta?: {
      profile_image_url?: string | null;
      description?: string | null;
      capabilities?: Record<string, boolean>;
      tags?: { name: string }[];
      [key: string]: unknown;
    };
    params?: Record<string, unknown>;
    access_control?: Record<string, unknown>;
    is_active?: boolean;
    updated_at?: number;
    created_at?: number;
  };
  preset?: boolean;
  tags?: { name: string }[];
};

export type CreateModelDto = {
  id: string;
  name: string;
  base_model_id?: string | null;
  meta?: {
    profile_image_url?: string | null;
    description?: string | null;
    capabilities?: Record<string, boolean>;
    tags?: { name: string }[];
    [key: string]: unknown;
  };
  params?: Record<string, unknown>;
  access_control?: Record<string, unknown>;
  is_active?: boolean;
};

export type UpdateModelDto = {
  name?: string;
  base_model_id?: string | null;
  meta?: {
    profile_image_url?: string | null;
    description?: string | null;
    capabilities?: Record<string, boolean>;
    tags?: { name: string }[];
    [key: string]: unknown;
  };
  params?: Record<string, unknown>;
  access_control?: Record<string, unknown>;
  is_active?: boolean;
};

const PROTOKOL7_BUILTIN_AGENTS: ModelResponseDto[] = [
  // 1. Protokol-7 Otonom Uzmanları
  {
    id: 'protokol7/extractor-ai',
    name: 'Protokol-7 AI Extractor',
    object: 'model',
    created: 1700000000,
    owned_by: 'protokol7',
    info: {
      id: 'protokol7/extractor-ai',
      name: 'Protokol-7 AI Extractor',
      meta: {
        description: 'HTTP-First, Playwright Stealth ve Anti-Bot Bypass özellikli otonom kazıma ajanı.',
        capabilities: { scraping: true, vision: true, tools: true, reasoning: true },
        tags: [{ name: 'extractor' }, { name: 'scraping' }, { name: 'ai' }, { name: 'director' }]
      },
      params: { temperature: 0.1 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'extractor' }, { name: 'scraping' }, { name: 'ai' }, { name: 'director' }]
  },
  {
    id: 'protokol7/crawler-agent',
    name: 'Protokol-7 Web Crawler',
    object: 'model',
    created: 1700000000,
    owned_by: 'protokol7',
    info: {
      id: 'protokol7/crawler-agent',
      name: 'Protokol-7 Web Crawler',
      meta: {
        description: 'Sitemap.xml, sayfalama ve link grafiği takip eden otonom web tarayıcısı.',
        capabilities: { scraping: true, vision: false, tools: true },
        tags: [{ name: 'crawler' }, { name: 'frontier' }, { name: 'scraping' }]
      },
      params: { temperature: 0.2 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'crawler' }, { name: 'frontier' }, { name: 'scraping' }]
  },
  {
    id: 'protokol7/browser-playwright',
    name: 'Protokol-7 Browser Playwright',
    object: 'model',
    created: 1700000000,
    owned_by: 'protokol7',
    info: {
      id: 'protokol7/browser-playwright',
      name: 'Protokol-7 Browser Playwright',
      meta: {
        description: 'Gelişmiş JavaScript render, dinamik DOM etkileşimi ve oturum yönetimi sağlayan tarayıcı ajanı.',
        capabilities: { scraping: true, vision: true, tools: true },
        tags: [{ name: 'browser' }, { name: 'playwright' }, { name: 'scraping' }]
      },
      params: { temperature: 0.1 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'browser' }, { name: 'playwright' }, { name: 'scraping' }]
  },
  {
    id: 'protokol7/schema-validator',
    name: 'Protokol-7 Schema Validator',
    object: 'model',
    created: 1700000000,
    owned_by: 'protokol7',
    info: {
      id: 'protokol7/schema-validator',
      name: 'Protokol-7 Schema Validator',
      meta: {
        description: 'Kazınan veri setlerinin JSON şema doğrulamasını ve tip denetimini yapan ajanı.',
        capabilities: { scraping: true, vision: false, tools: true },
        tags: [{ name: 'schema' }, { name: 'validator' }, { name: 'json' }]
      },
      params: { temperature: 0.0 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'schema' }, { name: 'validator' }, { name: 'json' }]
  },
  {
    id: 'protokol7/schema-architect',
    name: 'Protokol-7 DOM & Şema Mimarı',
    object: 'model',
    created: 1700000000,
    owned_by: 'protokol7',
    info: {
      id: 'protokol7/schema-architect',
      name: 'Protokol-7 DOM & Şema Mimarı',
      meta: {
        description: 'HTML DOM yapısını inceleyerek otomatik CSS, XPath ve JSON şeması üreten model.',
        capabilities: { scraping: true, vision: false, tools: true },
        tags: [{ name: 'schema' }, { name: 'dom' }, { name: 'xpath' }]
      },
      params: { temperature: 0.0 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'schema' }, { name: 'dom' }, { name: 'xpath' }]
  },
  {
    id: 'protokol7/finops-optimizer',
    name: 'Protokol-7 FinOps & Proxy Yönlendirici',
    object: 'model',
    created: 1700000000,
    owned_by: 'protokol7',
    info: {
      id: 'protokol7/finops-optimizer',
      name: 'Protokol-7 FinOps & Proxy Yönlendirici',
      meta: {
        description: 'En uygun maliyetli proxy ve kazıma stratejisini dinamik seçen maliyet optimizatörü.',
        capabilities: { scraping: true, tools: true },
        tags: [{ name: 'finops' }, { name: 'proxy' }, { name: 'cost' }]
      },
      params: { temperature: 0.0 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'finops' }, { name: 'proxy' }, { name: 'cost' }]
  },

  // 2. OpenAI Modelleri
  {
    id: 'gpt-4o',
    name: 'OpenAI GPT-4o (Omni)',
    object: 'model',
    created: 1715000000,
    owned_by: 'openai',
    info: {
      id: 'gpt-4o',
      name: 'OpenAI GPT-4o (Omni)',
      meta: {
        description: 'OpenAI amiral gemisi çok modlu amiral modeli. 128k context, görme ve araç çağırma desteği.',
        capabilities: { vision: true, tools: true, reasoning: true },
        tags: [{ name: 'openai' }, { name: 'flagship' }, { name: 'multimodal' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'openai' }, { name: 'flagship' }]
  },
  {
    id: 'gpt-4o-mini',
    name: 'OpenAI GPT-4o Mini',
    object: 'model',
    created: 1720000000,
    owned_by: 'openai',
    info: {
      id: 'gpt-4o-mini',
      name: 'OpenAI GPT-4o Mini',
      meta: {
        description: 'Yüksek hızlı, düşük maliyetli ve akıllı çok amaçlı mini model.',
        capabilities: { vision: true, tools: true },
        tags: [{ name: 'openai' }, { name: 'fast' }, { name: 'economical' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'openai' }, { name: 'fast' }]
  },
  {
    id: 'o1',
    name: 'OpenAI o1',
    object: 'model',
    created: 1726000000,
    owned_by: 'openai',
    info: {
      id: 'o1',
      name: 'OpenAI o1',
      meta: {
        description: 'Karmaşık problemler, matematik ve derin mantık için gelişmiş akıl yürütme modeli.',
        capabilities: { vision: true, reasoning: true },
        tags: [{ name: 'openai' }, { name: 'reasoning' }]
      },
      params: { temperature: 1.0 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'openai' }, { name: 'reasoning' }]
  },
  {
    id: 'o3-mini',
    name: 'OpenAI o3-mini',
    object: 'model',
    created: 1735000000,
    owned_by: 'openai',
    info: {
      id: 'o3-mini',
      name: 'OpenAI o3-mini',
      meta: {
        description: 'Kodlama, matematik ve bilim için hızlı ve uygun maliyetli akıl yürütme modeli.',
        capabilities: { reasoning: true, tools: true },
        tags: [{ name: 'openai' }, { name: 'reasoning' }, { name: 'coding' }]
      },
      params: { temperature: 1.0 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'openai' }, { name: 'reasoning' }]
  },

  // 3. Anthropic Claude Modelleri
  {
    id: 'claude-3-7-sonnet',
    name: 'Anthropic Claude 3.7 Sonnet',
    object: 'model',
    created: 1740000000,
    owned_by: 'anthropic',
    info: {
      id: 'claude-3-7-sonnet',
      name: 'Anthropic Claude 3.7 Sonnet',
      meta: {
        description: 'Hibrit standart ve genişletilmiş akıl yürütme (thinking) yeteneğine sahip en yeni model.',
        capabilities: { vision: true, tools: true, reasoning: true },
        tags: [{ name: 'anthropic' }, { name: 'thinking' }, { name: 'coding' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'anthropic' }, { name: 'thinking' }]
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Anthropic Claude 3.5 Sonnet',
    object: 'model',
    created: 1718000000,
    owned_by: 'anthropic',
    info: {
      id: 'claude-3-5-sonnet',
      name: 'Anthropic Claude 3.5 Sonnet',
      meta: {
        description: 'Sektör standardı kod yazma, veri analizi ve akıl yürütme modeli. 200k context.',
        capabilities: { vision: true, tools: true, reasoning: true },
        tags: [{ name: 'anthropic' }, { name: 'coding' }, { name: 'flagship' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'anthropic' }, { name: 'coding' }]
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Anthropic Claude 3.5 Haiku',
    object: 'model',
    created: 1729000000,
    owned_by: 'anthropic',
    info: {
      id: 'claude-3-5-haiku',
      name: 'Anthropic Claude 3.5 Haiku',
      meta: {
        description: 'Son derece hızlı yanıt süresi ve kompakt yapısıyla yüksek hacimli görevler için idealdir.',
        capabilities: { tools: true },
        tags: [{ name: 'anthropic' }, { name: 'fast' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'anthropic' }, { name: 'fast' }]
  },

  // 4. Google Gemini Modelleri
  {
    id: 'gemini-2.0-flash',
    name: 'Google Gemini 2.0 Flash',
    object: 'model',
    created: 1734000000,
    owned_by: 'google',
    info: {
      id: 'gemini-2.0-flash',
      name: 'Google Gemini 2.0 Flash',
      meta: {
        description: 'Yeni nesil hız, çok modlu anlama ve 1M token context penceresi.',
        capabilities: { vision: true, tools: true, reasoning: true },
        tags: [{ name: 'google' }, { name: 'gemini' }, { name: 'flash' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'google' }, { name: 'gemini' }]
  },
  {
    id: 'gemini-1.5-pro',
    name: 'Google Gemini 1.5 Pro',
    object: 'model',
    created: 1715000000,
    owned_by: 'google',
    info: {
      id: 'gemini-1.5-pro',
      name: 'Google Gemini 1.5 Pro',
      meta: {
        description: '2 Milyon token devasa context penceresi ile büyük doküman ve kod tabanı analizi.',
        capabilities: { vision: true, tools: true, reasoning: true },
        tags: [{ name: 'google' }, { name: 'gemini' }, { name: 'long-context' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'google' }, { name: 'gemini' }]
  },

  // 5. DeepSeek Modelleri
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1 (Reasoning)',
    object: 'model',
    created: 1737000000,
    owned_by: 'deepseek',
    info: {
      id: 'deepseek-r1',
      name: 'DeepSeek R1 (Reasoning)',
      meta: {
        description: 'Açık ağırlıklı dünya lideri akıl yürütme ve zincirleme düşünme (CoT) modeli.',
        capabilities: { reasoning: true, tools: true },
        tags: [{ name: 'deepseek' }, { name: 'reasoning' }, { name: 'open-weights' }]
      },
      params: { temperature: 0.6 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'deepseek' }, { name: 'reasoning' }]
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3 (671B MoE)',
    object: 'model',
    created: 1735000000,
    owned_by: 'deepseek',
    info: {
      id: 'deepseek-v3',
      name: 'DeepSeek V3 (671B MoE)',
      meta: {
        description: '671B parametreli son derece güçlü genel amaçlı ve kodlama MoE modeli.',
        capabilities: { tools: true, reasoning: true },
        tags: [{ name: 'deepseek' }, { name: 'moe' }, { name: 'flagship' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'deepseek' }, { name: 'flagship' }]
  },

  // 6. Meta Llama Modelleri
  {
    id: 'llama-3.3-70b',
    name: 'Meta Llama 3.3 70B Instruct',
    object: 'model',
    created: 1733000000,
    owned_by: 'meta',
    info: {
      id: 'llama-3.3-70b',
      name: 'Meta Llama 3.3 70B Instruct',
      meta: {
        description: 'Meta açık kaynak amiral gemisi. 128k context ve kurumsal düzeyde performans.',
        capabilities: { tools: true },
        tags: [{ name: 'meta' }, { name: 'llama' }, { name: 'open-source' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'meta' }, { name: 'llama' }]
  },

  // 7. Alibaba Qwen Modelleri
  {
    id: 'qwen-2.5-72b',
    name: 'Alibaba Qwen 2.5 72B Instruct',
    object: 'model',
    created: 1726000000,
    owned_by: 'alibaba',
    info: {
      id: 'qwen-2.5-72b',
      name: 'Alibaba Qwen 2.5 72B Instruct',
      meta: {
        description: 'Çok dilli, matematik ve programlama alanında lider açık model.',
        capabilities: { tools: true, reasoning: true },
        tags: [{ name: 'alibaba' }, { name: 'qwen' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'alibaba' }, { name: 'qwen' }]
  },

  // 8. Mistral AI Modelleri
  {
    id: 'mistral-large-2411',
    name: 'Mistral Large 2',
    object: 'model',
    created: 1731000000,
    owned_by: 'mistral',
    info: {
      id: 'mistral-large-2411',
      name: 'Mistral Large 2',
      meta: {
        description: '128k context, akıcı çok dilli yetenekler ve güçlü akıl yürütme.',
        capabilities: { tools: true, reasoning: true },
        tags: [{ name: 'mistral' }, { name: 'flagship' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'mistral' }]
  },

  // 9. Yerel Ollama
  {
    id: 'ollama/local-llm',
    name: 'Ollama Yerel LLM Sunucusu',
    object: 'model',
    created: 1700000000,
    owned_by: 'ollama',
    info: {
      id: 'ollama/local-llm',
      name: 'Ollama Yerel LLM Sunucusu',
      meta: {
        description: 'Yerel sunucuda çalışan modeller ile tam veri gizliliği ve sıfır API maliyeti.',
        capabilities: { tools: true },
        tags: [{ name: 'ollama' }, { name: 'local' }, { name: 'privacy' }]
      },
      params: { temperature: 0.7 },
      is_active: true
    },
    preset: true,
    tags: [{ name: 'ollama' }, { name: 'local' }]
  }
];

export class ModelService {
  public constructor(private readonly modelRepository: ModelRepository) {}

  public async listModels(tenantId: string, search?: string): Promise<ModelResponseDto[]> {
    let dbModels: ModelRecord[] = [];
    try {
      const listOpts: { search?: string; isActive?: boolean } = { isActive: true };
      if (search !== undefined) listOpts.search = search;
      dbModels = await this.modelRepository.listModels(tenantId, listOpts);
    } catch {
      // Fallback
    }

    const customMapped: ModelResponseDto[] = dbModels.map((row) => ({
      id: row.id,
      name: row.name,
      object: 'model',
      created: Math.floor(row.createdAt.getTime() / 1000),
      owned_by: row.tenantId,
      base_model_id: row.baseModelId,
      info: {
        id: row.id,
        user_id: row.userId,
        base_model_id: row.baseModelId,
        name: row.name,
        meta: row.metaJson,
        params: row.paramsJson,
        access_control: row.accessControlJson,
        is_active: row.isActive,
        created_at: Math.floor(row.createdAt.getTime() / 1000),
        updated_at: Math.floor(row.updatedAt.getTime() / 1000)
      },
      preset: false,
      tags: (row.metaJson?.tags as { name: string }[]) || []
    }));

    let combined = [...PROTOKOL7_BUILTIN_AGENTS, ...customMapped];

    if (search) {
      const q = search.toLowerCase();
      combined = combined.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      );
    }

    return combined;
  }

  public async getAllModels(tenantId: string, options?: { search?: string; tag?: string }): Promise<ModelResponseDto[]> {
    let models = await this.listModels(tenantId, options?.search);
    if (options?.tag) {
      models = models.filter((m) => m.tags?.some((t) => t.name === options.tag));
    }
    return models;
  }

  public async getBaseModels(): Promise<ModelResponseDto[]> {
    return PROTOKOL7_BUILTIN_AGENTS;
  }

  public async getModelTags(tenantId: string): Promise<{ name: string }[]> {
    const models = await this.listModels(tenantId);
    const tagMap = new Map<string, boolean>();
    for (const m of models) {
      for (const t of m.tags || []) {
        tagMap.set(t.name, true);
      }
    }
    return Array.from(tagMap.keys()).map((name) => ({ name }));
  }

  public async getModelById(tenantId: string, id: string): Promise<ModelResponseDto> {
    const builtin = PROTOKOL7_BUILTIN_AGENTS.find((m) => m.id === id);
    if (builtin) {
      return builtin;
    }

    const row = await this.modelRepository.findById(tenantId, id);
    if (!row) {
      throw new ApiError({
        statusCode: 404,
        code: 'MODEL_NOT_FOUND',
        category: 'VALIDATION',
        message: `Model '${id}' bulunamadı.`,
        retryable: false
      });
    }

    return {
      id: row.id,
      name: row.name,
      object: 'model',
      created: Math.floor(row.createdAt.getTime() / 1000),
      owned_by: row.tenantId,
      base_model_id: row.baseModelId,
      info: {
        id: row.id,
        user_id: row.userId,
        base_model_id: row.baseModelId,
        name: row.name,
        meta: row.metaJson,
        params: row.paramsJson,
        access_control: row.accessControlJson,
        is_active: row.isActive,
        created_at: Math.floor(row.createdAt.getTime() / 1000),
        updated_at: Math.floor(row.updatedAt.getTime() / 1000)
      },
      preset: false,
      tags: (row.metaJson?.tags as { name: string }[]) || []
    };
  }

  public async createModel(
    tenantId: string,
    userId: string | null,
    dto: CreateModelDto
  ): Promise<ModelResponseDto> {
    const existing = await this.modelRepository.findById(tenantId, dto.id);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        code: 'MODEL_ALREADY_EXISTS',
        category: 'VALIDATION',
        message: `Model '${dto.id}' zaten mevcut.`,
        retryable: false
      });
    }

    const createInput: {
      id: string;
      tenantId: string;
      userId?: string | null;
      baseModelId?: string | null;
      name: string;
      metaJson?: Record<string, unknown>;
      paramsJson?: Record<string, unknown>;
      accessControlJson?: Record<string, unknown>;
      isActive?: boolean;
    } = {
      id: dto.id,
      tenantId,
      name: dto.name
    };
    if (userId !== undefined) createInput.userId = userId;
    if (dto.base_model_id !== undefined) createInput.baseModelId = dto.base_model_id;
    if (dto.meta !== undefined) createInput.metaJson = dto.meta;
    if (dto.params !== undefined) createInput.paramsJson = dto.params;
    if (dto.access_control !== undefined) createInput.accessControlJson = dto.access_control;
    if (dto.is_active !== undefined) createInput.isActive = dto.is_active;

    const row = await this.modelRepository.create(createInput);

    return {
      id: row.id,
      name: row.name,
      object: 'model',
      created: Math.floor(row.createdAt.getTime() / 1000),
      owned_by: row.tenantId,
      base_model_id: row.baseModelId,
      info: {
        id: row.id,
        user_id: row.userId,
        base_model_id: row.baseModelId,
        name: row.name,
        meta: row.metaJson,
        params: row.paramsJson,
        access_control: row.accessControlJson,
        is_active: row.isActive,
        created_at: Math.floor(row.createdAt.getTime() / 1000),
        updated_at: Math.floor(row.updatedAt.getTime() / 1000)
      },
      preset: false,
      tags: (row.metaJson?.tags as { name: string }[]) || []
    };
  }

  public async updateModel(
    tenantId: string,
    id: string,
    dto: UpdateModelDto
  ): Promise<ModelResponseDto> {
    const isBuiltin = PROTOKOL7_BUILTIN_AGENTS.some((m) => m.id === id);
    if (isBuiltin) {
      throw new ApiError({
        statusCode: 400,
        code: 'CANNOT_MODIFY_BUILTIN_MODEL',
        category: 'VALIDATION',
        message: 'Dahili sistem modelleri doğrudan değiştirilemez. Bunun yerine türetilmiş yeni bir model oluşturun.',
        retryable: false
      });
    }

    const updateInput: {
      name?: string;
      baseModelId?: string | null;
      metaJson?: Record<string, unknown>;
      paramsJson?: Record<string, unknown>;
      accessControlJson?: Record<string, unknown>;
      isActive?: boolean;
    } = {};
    if (dto.name !== undefined) updateInput.name = dto.name;
    if (dto.base_model_id !== undefined) updateInput.baseModelId = dto.base_model_id;
    if (dto.meta !== undefined) updateInput.metaJson = dto.meta;
    if (dto.params !== undefined) updateInput.paramsJson = dto.params;
    if (dto.access_control !== undefined) updateInput.accessControlJson = dto.access_control;
    if (dto.is_active !== undefined) updateInput.isActive = dto.is_active;

    const row = await this.modelRepository.update(tenantId, id, updateInput);
    if (!row) {
      throw new ApiError({
        statusCode: 404,
        code: 'MODEL_NOT_FOUND',
        category: 'VALIDATION',
        message: `Model '${id}' bulunamadı.`,
        retryable: false
      });
    }

    return {
      id: row.id,
      name: row.name,
      object: 'model',
      created: Math.floor(row.createdAt.getTime() / 1000),
      owned_by: row.tenantId,
      base_model_id: row.baseModelId,
      info: {
        id: row.id,
        user_id: row.userId,
        base_model_id: row.baseModelId,
        name: row.name,
        meta: row.metaJson,
        params: row.paramsJson,
        access_control: row.accessControlJson,
        is_active: row.isActive,
        created_at: Math.floor(row.createdAt.getTime() / 1000),
        updated_at: Math.floor(row.updatedAt.getTime() / 1000)
      },
      preset: false,
      tags: (row.metaJson?.tags as { name: string }[]) || []
    };
  }

  public async deleteModel(tenantId: string, id: string): Promise<boolean> {
    const isBuiltin = PROTOKOL7_BUILTIN_AGENTS.some((m) => m.id === id);
    if (isBuiltin) {
      throw new ApiError({
        statusCode: 400,
        code: 'CANNOT_DELETE_BUILTIN_MODEL',
        category: 'VALIDATION',
        message: 'Dahili sistem modelleri silinemez.',
        retryable: false
      });
    }

    const deleted = await this.modelRepository.delete(tenantId, id);
    if (!deleted) {
      throw new ApiError({
        statusCode: 404,
        code: 'MODEL_NOT_FOUND',
        category: 'VALIDATION',
        message: `Model '${id}' bulunamadı.`,
        retryable: false
      });
    }

    return true;
  }
}
