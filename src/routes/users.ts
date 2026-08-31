import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const userSettingsStore = new Map<string, Record<string, unknown>>();

const defaultUserSettings = {
  ui: {
    theme: 'dark',
    chat_bubble: true,
    response_auto_copy: false,
    scroll_on_branch_change: true,
    rich_chat_input: true
  },
  split_large_chunks: false,
  system: 'Sen Protokol-7 Otonom Kazıma ve Veri Çıkarma Ajanısın.'
};

export function registerUserRoutes(app: FastifyInstance): void {
  // GET /users/user/settings
  const getUserSettingsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_default';

    const settings = userSettingsStore.get(userId) || defaultUserSettings;
    return reply.code(200).send(settings);
  };

  // POST /users/user/settings/update
  const updateUserSettingsHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    const userId = context?.actorId || 'user_default';

    const newSettings = (request.body as Record<string, unknown>) || {};
    const existing = userSettingsStore.get(userId) || defaultUserSettings;
    const merged = { ...existing, ...newSettings };

    userSettingsStore.set(userId, merged);
    return reply.code(200).send(merged);
  };

  // GET /users/default/permissions
  const getDefaultPermissionsHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      workspace: {
        models: true,
        knowledge: true,
        prompts: true,
        tools: true
      },
      chat: {
        controls: true,
        file_upload: true,
        delete: true,
        edit: true,
        share: true
      }
    });
  };

  // GET /users/groups
  const getUserGroupsHandler = async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send([]);
  };

  // GET /users/user/info
  const getUserInfoHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const context = request.authContext;
    return reply.code(200).send({
      id: context?.actorId || 'admin_default',
      name: 'Protokol-7 Admin',
      email: 'admin@protokol7.com',
      role: context?.roles?.[0] || 'admin',
      profile_image_url: null
    });
  };

  // Register endpoints
  app.get('/users/user/settings', getUserSettingsHandler);
  app.post('/users/user/settings/update', updateUserSettingsHandler);
  app.get('/users/default/permissions', getDefaultPermissionsHandler);
  app.get('/users/default/permissions/defaults', getDefaultPermissionsHandler);
  app.get('/users/groups', getUserGroupsHandler);
  app.get('/users/user/info', getUserInfoHandler);
}
