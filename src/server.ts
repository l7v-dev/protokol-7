import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const app = buildApp(config);

async function start(): Promise<void> {
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start backend server');
    process.exitCode = 1;
  }
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'Shutting down backend server');
  await app.close();
}

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

void start();
