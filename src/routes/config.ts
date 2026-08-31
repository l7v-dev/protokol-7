import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AppConfig } from '../config/env.js';

// In-memory config state store
const configStore = {
  banners: [] as Array<Record<string, unknown>>,
  suggestions: '' as string,
  connections: {
    openai_api_base_urls: [],
    openai_api_keys: [],
    ollama_api_base_urls: []
  },
  direct_connections: {
    ENABLE_DIRECT_CONNECTIONS: false
  },
  tool_servers: [] as Array<Record<string, unknown>>,
  terminal_servers: [] as Array<Record<string, unknown>>,
  code_execution: {
    engine: 'none',
    url: ''
  },
  models: {
    DEFAULT_MODELS: 'protokol7/extractor-ai',
    MODEL_ORDER_LIST: [
      'protokol7/extractor-ai',
      'protokol7/crawler-agent',
      'protokol7/browser-playwright',
      'protokol7/schema-validator'
    ]
  },
  subagents: {
    ENABLE_SUBAGENTS: true
  },
  audio: {
    tts: { OPENAI_API_BASE_URL: '', OPENAI_API_KEY: '', OPENAI_API_MODEL: '', OPENAI_API_VOICE: '' },
    stt: { OPENAI_API_BASE_URL: '', OPENAI_API_KEY: '', OPENAI_API_MODEL: '' }
  },
  images: {
    enabled: false,
    engine: 'openai',
    openai_api_base_url: '',
    openai_api_key: '',
    openai_api_model: 'dall-e-3'
  },
  retrieval: {
    RAG_EMBEDDING_ENGINE: 'default',
    chunk: { chunk_size: 1500, chunk_overlap: 100 },
    PDF_EXTRACT_IMAGES: false
  }
};

export function registerConfigRoutes(app: FastifyInstance, _config: AppConfig): void {
  const baseConfigResponse = {
    status: true,
    name: 'Protokol-7',
    version: '0.1.0',
    default_locale: 'en-US',
    default_models: 'protokol7/extractor-ai',
    features: {
      auth: true,
      auth_trusted_header: false,
      enable_signup: true,
      enable_login_form: true,
      enable_web_search: true,
      enable_image_generation: false,
      enable_community_sharing: false,
      enable_admin_export: true,
      enable_admin_chat_access: true,
      enable_websocket: false
    },
    ui: {
      pending_user_overlay: false
    }
  };

  // Base config
  app.get('/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(baseConfigResponse);
  });

  app.get('/configs/default', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(baseConfigResponse);
  });

  // Banners
  app.get('/configs/banners', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.banners);
  });

  app.post('/configs/banners', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { banners?: Array<Record<string, unknown>> }) || {};
    configStore.banners = body.banners || [];
    return reply.code(200).send(configStore.banners);
  });

  // Prompt suggestions
  app.get('/configs/suggestions', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ suggestions: configStore.suggestions });
  });

  app.post('/configs/suggestions', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { suggestions?: string }) || {};
    configStore.suggestions = body.suggestions || '';
    return reply.code(200).send({ suggestions: configStore.suggestions });
  });

  // Connections (OpenAI / Ollama / Upstream providers)
  app.get('/configs/connections', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.connections);
  });

  app.post('/configs/connections', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.connections = { ...configStore.connections, ...body };
    return reply.code(200).send(configStore.connections);
  });

  app.get('/configs/direct_connections', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.direct_connections);
  });

  app.post('/configs/direct_connections', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.direct_connections = { ...configStore.direct_connections, ...body };
    return reply.code(200).send(configStore.direct_connections);
  });

  // Tool & Terminal servers
  app.get('/configs/tool_servers', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.tool_servers);
  });

  app.post('/configs/tool_servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Array<Record<string, unknown>>) || [];
    configStore.tool_servers = body;
    return reply.code(200).send(configStore.tool_servers);
  });

  app.post('/configs/tool_servers/verify', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ status: true });
  });

  app.get('/configs/terminal_servers', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.terminal_servers);
  });

  app.post('/configs/terminal_servers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Array<Record<string, unknown>>) || [];
    configStore.terminal_servers = body;
    return reply.code(200).send(configStore.terminal_servers);
  });

  app.post('/configs/terminal_servers/verify', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ status: true });
  });

  app.post('/configs/terminal_servers/refresh', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({ status: true });
  });

  app.post('/configs/terminal_servers/policy', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({});
  });

  app.post('/configs/terminal_servers/lifecycle', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({});
  });

  // Code Execution
  app.get('/configs/code_execution', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.code_execution);
  });

  app.post('/configs/code_execution', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.code_execution = { ...configStore.code_execution, ...body };
    return reply.code(200).send(configStore.code_execution);
  });

  // Models & Subagents
  app.get('/configs/models', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.models);
  });

  app.post('/configs/models', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.models = { ...configStore.models, ...body };
    return reply.code(200).send(configStore.models);
  });

  app.get('/configs/models/defaults', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.models);
  });

  app.get('/configs/subagents', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.subagents);
  });

  app.post('/configs/subagents', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.subagents = { ...configStore.subagents, ...body };
    return reply.code(200).send(configStore.subagents);
  });

  // Import / Export
  app.get('/configs/export', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore);
  });

  app.post('/configs/import', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as { config?: typeof configStore }) || {};
    if (body.config) {
      Object.assign(configStore, body.config);
    }
    return reply.code(200).send(configStore);
  });

  // Audio / Images / Retrieval config endpoints
  app.get('/audio/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.audio);
  });

  app.post('/audio/config/update', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.audio = { ...configStore.audio, ...body };
    return reply.code(200).send(configStore.audio);
  });

  app.get('/images/config', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send(configStore.images);
  });

  app.post('/images/config/update', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.images = { ...configStore.images, ...body };
    return reply.code(200).send(configStore.images);
  });

  app.post('/retrieval/config/update', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as Record<string, unknown>) || {};
    configStore.retrieval = { ...configStore.retrieval, ...body };
    return reply.code(200).send(configStore.retrieval);
  });

  // Terminals endpoints
  app.get('/terminals', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send([]);
  });
  app.get('/terminals/', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send([]);
  });

  // Changelog endpoint
  app.get('/changelog', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      version: '1.0.0',
      release_date: '2026-08-31',
      changelog: 'Protokol-7 Kurumsal Otonom Kazıma & AI Direktör Platformu v1.0.0 başarıyla devreye alındı.'
    });
  });
}
