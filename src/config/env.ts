import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_NAME: z.string().min(1).default('scraping-platform-api'),
  API_VERSION: z.string().min(1).default('v1'),
  AUTH_MODE: z.enum(['test', 'header', 'external']).default('test'),
  DATABASE_URL: z.string().url().default('postgresql://postgres:postgres@127.0.0.1:5432/scraping_platform'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(5_000),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  QUEUE_PREFIX: z.string().min(1).default('scraping:development'),
  STORAGE_MODE: z.enum(['memory', 'filesystem', 's3']).default('memory'),
  STORAGE_ROOT: z.string().min(1).default('/tmp/scraping-platform-storage'),
  JWT_SECRET: z.string().min(16).default('protokol7-auth-token-secret-key-32bytes')
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  host: string;
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  serviceName: string;
  apiVersion: string;
  authMode: 'test' | 'header' | 'external';
  databaseUrl: string;
  dbPoolMax: number;
  dbConnectTimeoutMs: number;
  redisUrl: string;
  queuePrefix: string;
  storageMode: 'memory' | 'filesystem' | 's3';
  storageRoot: string;
  jwtSecret: string;
};

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('; ');
    throw new ConfigurationError(`Invalid runtime configuration: ${issues}`);
  }

  if (parsed.data.NODE_ENV === 'production' && parsed.data.AUTH_MODE !== 'external') {
    throw new ConfigurationError('Production requires AUTH_MODE=external.');
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    serviceName: parsed.data.SERVICE_NAME,
    apiVersion: parsed.data.API_VERSION,
    authMode: parsed.data.AUTH_MODE,
    databaseUrl: parsed.data.DATABASE_URL,
    dbPoolMax: parsed.data.DB_POOL_MAX,
    dbConnectTimeoutMs: parsed.data.DB_CONNECT_TIMEOUT_MS,
    redisUrl: parsed.data.REDIS_URL,
    queuePrefix: parsed.data.QUEUE_PREFIX,
    storageMode: parsed.data.STORAGE_MODE,
    storageRoot: parsed.data.STORAGE_ROOT,
    jwtSecret: parsed.data.JWT_SECRET
  };
}
