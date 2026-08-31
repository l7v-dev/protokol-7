import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import multipart from '@fastify/multipart';

import type { AppConfig } from './config/env.js';
import {
  CompositeAuthResolver,
  ExternalAuthResolver,
  HeaderAuthResolver,
  JwtAuthResolver,
  TestAuthResolver
} from './shared/auth.js';
import { ApiError, sendApiError } from './shared/http.js';
import { MetricsRegistry } from './shared/metrics.js';
import { registerAuth } from './plugins/auth.js';
import { registerObservability } from './plugins/observability.js';
import { registerDatabase } from './database/plugin.js';
import { registerQueue } from './queue/plugin.js';
import { JobService } from './services/job-service.js';
import { ResourceService } from './services/resource-service.js';
import { UserRepository } from './database/repositories/user-repository.js';
import { ModelRepository } from './database/repositories/model-repository.js';
import { ChatRepository } from './database/repositories/chat-repository.js';
import { FileRepository } from './database/repositories/file-repository.js';
import { PromptRepository } from './database/repositories/prompt-repository.js';
import { ToolRepository } from './database/repositories/tool-repository.js';
import { FolderRepository } from './database/repositories/folder-repository.js';
import { KnowledgeRepository } from './database/repositories/knowledge-repository.js';
import { MemoryRepository } from './database/repositories/memory-repository.js';
import { AutomationRepository } from './database/repositories/automation-repository.js';
import { FunctionRepository } from './database/repositories/function-repository.js';
import { NoteRepository } from './database/repositories/note-repository.js';
import { ChannelRepository } from './database/repositories/channel-repository.js';
import { EvaluationRepository } from './database/repositories/evaluation-repository.js';
import { GroupRepository } from './database/repositories/group-repository.js';
import { SkillRepository } from './database/repositories/skill-repository.js';
import { AgentOrchestrator } from './agent/orchestrator.js';
import { AuthService } from './services/auth-service.js';
import { ModelService } from './services/model-service.js';
import { ChatService } from './services/chat-service.js';
import { FileService } from './services/file-service.js';
import { PromptService } from './services/prompt-service.js';
import { ToolService } from './services/tool-service.js';
import { FolderService } from './services/folder-service.js';
import { KnowledgeService } from './services/knowledge-service.js';
import { MemoryService } from './services/memory-service.js';
import { AutomationService } from './services/automation-service.js';
import { FunctionService } from './services/function-service.js';
import { NoteService } from './services/note-service.js';
import { ChannelService } from './services/channel-service.js';
import { EvaluationService } from './services/evaluation-service.js';
import { GroupService } from './services/group-service.js';
import { SkillService } from './services/skill-service.js';
import { registerAuthContextRoute } from './routes/auth-context.js';
import { registerJobRoutes } from './routes/jobs.js';
import { registerResourceRoutes } from './routes/resources.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerModelRoutes } from './routes/models.js';
import { registerChatRoutes } from './routes/chats.js';
import { registerChatCompletionRoutes } from './routes/chat-completions.js';
import { registerFileRoutes } from './routes/files.js';
import { registerPromptRoutes } from './routes/prompts.js';
import { registerToolRoutes } from './routes/tools.js';
import { registerUserRoutes } from './routes/users.js';
import { registerFolderRoutes } from './routes/folders.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerMemoryRoutes } from './routes/memories.js';
import { registerAutomationRoutes } from './routes/automations.js';
import { registerFunctionRoutes } from './routes/functions.js';
import { registerNoteRoutes } from './routes/notes.js';
import { registerChannelRoutes } from './routes/channels.js';
import { registerEvaluationRoutes } from './routes/evaluations.js';
import { registerGroupRoutes } from './routes/groups.js';
import { registerSkillRoutes } from './routes/skills.js';

export function buildApp(config: AppConfig): FastifyInstance {
  const metrics = new MetricsRegistry();
  const app = Fastify({
    logger: {
      level: config.logLevel,
      base: {
        service: config.serviceName,
        environment: config.nodeEnv
      }
    },
    genReqId: (request) => request.headers['x-request-id']?.toString() || crypto.randomUUID()
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', request.headers.origin || '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-Id, X-Tenant-Id, X-Actor-Id');
    reply.header('Access-Control-Allow-Credentials', 'true');

    if (request.method === 'OPTIONS') {
      return reply.code(204).send();
    }
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    reply.header('X-API-Version', config.apiVersion);
  });

  app.decorate('metrics', metrics);

  app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  registerDatabase(app, config);
  registerQueue(app, config);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      sendApiError(request, reply, error);
      return;
    }

    request.log.error({ err: error }, 'Unhandled request error');
    sendApiError(
      request,
      reply,
      new ApiError({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        category: 'INTERNAL',
        message: 'Beklenmeyen bir hata oluştu.',
        retryable: false,
        severity: 'ERROR'
      })
    );
  });

  app.setNotFoundHandler((request, reply) => {
    sendApiError(
      request,
      reply,
      new ApiError({
        statusCode: 404,
        code: 'RESOURCE_NOT_FOUND',
        category: 'VALIDATION',
        message: 'İstenen kaynak bulunamadı.',
        retryable: false
      })
    );
  });

  app.register(async (instance) => {
    await registerHealthRoutes(instance, config);
    registerConfigRoutes(instance, config);
  });

  app.register(async (instance) => {
    const jwtResolver = new JwtAuthResolver(config.jwtSecret);
    const resolver = config.authMode === 'test'
      ? new CompositeAuthResolver([new TestAuthResolver(), jwtResolver])
      : config.authMode === 'header'
        ? new CompositeAuthResolver([new HeaderAuthResolver(), jwtResolver])
        : new CompositeAuthResolver([jwtResolver, new HeaderAuthResolver()]);

    const userRepository = new UserRepository(instance.database);
    const modelRepository = new ModelRepository(instance.database);
    const chatRepository = new ChatRepository(instance.database);
    const fileRepository = new FileRepository(instance.database);
    const promptRepository = new PromptRepository(instance.database);
    const toolRepository = new ToolRepository(instance.database);
    const folderRepository = new FolderRepository(instance.database);
    const knowledgeRepository = new KnowledgeRepository(instance.database);
    const memoryRepository = new MemoryRepository(instance.database);
    const automationRepository = new AutomationRepository(instance.database);
    const functionRepository = new FunctionRepository(instance.database);
    const noteRepository = new NoteRepository(instance.database);
    const channelRepository = new ChannelRepository(instance.database);
    const evaluationRepository = new EvaluationRepository(instance.database);
    const groupRepository = new GroupRepository(instance.database);
    const skillRepository = new SkillRepository(instance.database);
    const agentOrchestrator = new AgentOrchestrator();

    const authService = new AuthService(userRepository, config.jwtSecret);
    const modelService = new ModelService(modelRepository);
    const chatService = new ChatService(chatRepository, agentOrchestrator);
    const fileService = new FileService(fileRepository);
    const promptService = new PromptService(promptRepository);
    const toolService = new ToolService(toolRepository);
    const folderService = new FolderService(folderRepository);
    const knowledgeService = new KnowledgeService(knowledgeRepository);
    const memoryService = new MemoryService(memoryRepository);
    const automationService = new AutomationService(automationRepository);
    const functionService = new FunctionService(functionRepository);
    const noteService = new NoteService(noteRepository);
    const channelService = new ChannelService(channelRepository);
    const evaluationService = new EvaluationService(evaluationRepository);
    const groupService = new GroupService(groupRepository);
    const skillService = new SkillService(skillRepository);

    await registerObservability(instance, metrics);
    await registerAuth(instance, resolver);
    registerAuthContextRoute(instance);
    registerConfigRoutes(instance, config);
    registerAuthRoutes(instance, authService);
    registerModelRoutes(instance, modelService);
    registerChatRoutes(instance, chatService);
    registerChatCompletionRoutes(instance, chatService);
    registerFileRoutes(instance, fileService);
    registerPromptRoutes(instance, promptService);
    registerToolRoutes(instance, toolService);
    registerUserRoutes(instance);
    registerFolderRoutes(instance, folderService);
    registerKnowledgeRoutes(instance, knowledgeService);
    registerMemoryRoutes(instance, memoryService);
    registerAutomationRoutes(instance, automationService);
    registerFunctionRoutes(instance, functionService);
    registerNoteRoutes(instance, noteService);
    registerChannelRoutes(instance, channelService);
    registerEvaluationRoutes(instance, evaluationService);
    registerGroupRoutes(instance, groupService);
    registerSkillRoutes(instance, skillService);
    const resourceService = new ResourceService(instance.database);
    registerResourceRoutes(instance, resourceService);
    registerJobRoutes(instance, new JobService(instance.database, resourceService));
    registerHealthRoutes(instance, config);
  }, { prefix: `/api/${config.apiVersion}` });

  // Also support /api root prefixes for direct frontend calls
  app.register(async (instance) => {
    const modelRepository = new ModelRepository(instance.database);
    const chatRepository = new ChatRepository(instance.database);
    const fileRepository = new FileRepository(instance.database);
    const promptRepository = new PromptRepository(instance.database);
    const toolRepository = new ToolRepository(instance.database);
    const folderRepository = new FolderRepository(instance.database);
    const knowledgeRepository = new KnowledgeRepository(instance.database);
    const memoryRepository = new MemoryRepository(instance.database);
    const automationRepository = new AutomationRepository(instance.database);
    const functionRepository = new FunctionRepository(instance.database);
    const noteRepository = new NoteRepository(instance.database);
    const channelRepository = new ChannelRepository(instance.database);
    const evaluationRepository = new EvaluationRepository(instance.database);
    const groupRepository = new GroupRepository(instance.database);
    const skillRepository = new SkillRepository(instance.database);
    const agentOrchestrator = new AgentOrchestrator();

    const modelService = new ModelService(modelRepository);
    const chatService = new ChatService(chatRepository, agentOrchestrator);
    const fileService = new FileService(fileRepository);
    const promptService = new PromptService(promptRepository);
    const toolService = new ToolService(toolRepository);
    const folderService = new FolderService(folderRepository);
    const knowledgeService = new KnowledgeService(knowledgeRepository);
    const memoryService = new MemoryService(memoryRepository);
    const automationService = new AutomationService(automationRepository);
    const functionService = new FunctionService(functionRepository);
    const noteService = new NoteService(noteRepository);
    const channelService = new ChannelService(channelRepository);
    const evaluationService = new EvaluationService(evaluationRepository);
    const groupService = new GroupService(groupRepository);
    const skillService = new SkillService(skillRepository);

    registerModelRoutes(instance, modelService);
    registerChatRoutes(instance, chatService);
    registerChatCompletionRoutes(instance, chatService);
    registerFileRoutes(instance, fileService);
    registerPromptRoutes(instance, promptService);
    registerToolRoutes(instance, toolService);
    registerUserRoutes(instance);
    registerConfigRoutes(instance, config);
    registerFolderRoutes(instance, folderService);
    registerKnowledgeRoutes(instance, knowledgeService);
    registerMemoryRoutes(instance, memoryService);
    registerAutomationRoutes(instance, automationService);
    registerFunctionRoutes(instance, functionService);
    registerNoteRoutes(instance, noteService);
    registerChannelRoutes(instance, channelService);
    registerEvaluationRoutes(instance, evaluationService);
    registerGroupRoutes(instance, groupService);
    registerSkillRoutes(instance, skillService);
  }, { prefix: '/api' });

  // Socket.IO / WebSocket polling fallback for frontend clients
  const handleSocketIo = async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', 'text/plain; charset=UTF-8');
    const query = (request.query as Record<string, string>) || {};
    if (query.transport === 'polling') {
      if (request.method === 'POST') {
        return reply.code(200).send('ok');
      }
      return reply.code(200).send('0{"sid":"p7-live-session","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}');
    }
    return reply.code(200).send('ok');
  };

  app.get('/ws/socket.io', handleSocketIo);
  app.get('/ws/socket.io/', handleSocketIo);
  app.post('/ws/socket.io', handleSocketIo);
  app.post('/ws/socket.io/', handleSocketIo);

  return app;
}

