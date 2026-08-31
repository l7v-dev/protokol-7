import { createHash } from 'node:crypto';

export const LLM_MODEL_CONFIGURATION_VERSION = 'llm-model-config/v1' as const;

export type ModelConfigurationScope = {
  tenantId: string;
  projectId: string;
};

export type LlmModelCapability = {
  structuredOutput: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type LlmModelDescriptor = {
  providerId: string;
  modelId: string;
  capabilities: LlmModelCapability;
};

/**
 * Provider-neutral catalog boundary. It intentionally does not define a model
 * invocation method: P10-T03 owns configuration only, not prompt/model execution.
 */
export interface LlmProvider {
  readonly providerId: string;
  listModels(): Promise<ReadonlyArray<LlmModelDescriptor>>;
}

export type ModelConfigurationInput = {
  configurationVersion: typeof LLM_MODEL_CONFIGURATION_VERSION;
  configurationId: string;
  scope: ModelConfigurationScope;
  providerId: string;
  modelId: string;
  useCase: 'TARGET_ANALYSIS' | 'STRATEGY_PROPOSAL';
  enabled: boolean;
  maxOutputTokens: number;
  requireStructuredOutput: boolean;
};

export type ResolvedModelConfiguration = {
  configurationVersion: typeof LLM_MODEL_CONFIGURATION_VERSION;
  configurationId: string;
  scope: ModelConfigurationScope;
  providerId: string;
  modelId: string;
  useCase: 'TARGET_ANALYSIS' | 'STRATEGY_PROPOSAL';
  maxOutputTokens: number;
  capabilities: LlmModelCapability;
  strictSchemaRequired: true;
  allowPromptContentPersistence: false;
  allowNetworkTools: false;
  modelFingerprintSha256: string;
};

export class LlmModelConfigurationError extends Error {
  public constructor(
    public readonly code: 'MODEL_CONFIG_INVALID' | 'MODEL_CONFIG_CONFLICT' | 'MODEL_CONFIG_NOT_FOUND' | 'MODEL_CONFIG_SCOPE_MISMATCH' | 'MODEL_CONFIG_DISABLED' | 'MODEL_NOT_AVAILABLE' | 'MODEL_CAPABILITY_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'LlmModelConfigurationError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_OUTPUT_TOKENS = 8_192;

/**
 * Process-local configuration registry. It persists neither credentials nor raw
 * prompts, does not contact a remote provider and cannot turn a config into a worker action.
 */
export class ModelConfigurationRegistry {
  private readonly providers = new Map<string, LlmProvider>();
  private readonly configurations = new Map<string, ModelConfigurationInput>();

  public registerProvider(provider: LlmProvider): void {
    if (!SAFE_ID.test(provider.providerId) || this.providers.has(provider.providerId)) {
      throw new LlmModelConfigurationError(this.providers.has(provider.providerId) ? 'MODEL_CONFIG_CONFLICT' : 'MODEL_CONFIG_INVALID', 'LLM provider kaydı geçerli değil.');
    }
    this.providers.set(provider.providerId, provider);
  }

  public async register(input: ModelConfigurationInput): Promise<ResolvedModelConfiguration> {
    validateInput(input);
    const key = configurationKey(input.scope, input.configurationId);
    if (this.configurations.has(key)) throw new LlmModelConfigurationError('MODEL_CONFIG_CONFLICT', 'Model configuration zaten mevcut.');
    const provider = this.providers.get(input.providerId);
    if (!provider) throw new LlmModelConfigurationError('MODEL_NOT_AVAILABLE', 'LLM provider bulunamadı.');
    const descriptor = (await provider.listModels()).find((model) => model.providerId === input.providerId && model.modelId === input.modelId);
    if (!descriptor) throw new LlmModelConfigurationError('MODEL_NOT_AVAILABLE', 'LLM modeli provider catalog içinde bulunamadı.');
    if (input.requireStructuredOutput && !descriptor.capabilities.structuredOutput) {
      throw new LlmModelConfigurationError('MODEL_CAPABILITY_MISMATCH', 'LLM modeli strict structured output yeteneğini karşılamıyor.');
    }
    this.configurations.set(key, { ...input, scope: { ...input.scope } });
    return resolved(input, descriptor);
  }

  public async resolve(scope: ModelConfigurationScope, configurationId: string): Promise<ResolvedModelConfiguration> {
    validateScope(scope);
    validateId(configurationId);
    const input = this.configurations.get(configurationKey(scope, configurationId));
    if (!input) {
      if ([...this.configurations.values()].some((config) => config.configurationId === configurationId)) {
        throw new LlmModelConfigurationError('MODEL_CONFIG_SCOPE_MISMATCH', 'Model configuration tenant veya project scope ile eşleşmiyor.');
      }
      throw new LlmModelConfigurationError('MODEL_CONFIG_NOT_FOUND', 'Model configuration bulunamadı.');
    }
    if (!input.enabled) throw new LlmModelConfigurationError('MODEL_CONFIG_DISABLED', 'Model configuration devre dışı.');
    const provider = this.providers.get(input.providerId);
    if (!provider) throw new LlmModelConfigurationError('MODEL_NOT_AVAILABLE', 'LLM provider bulunamadı.');
    const descriptor = (await provider.listModels()).find((model) => model.providerId === input.providerId && model.modelId === input.modelId);
    if (!descriptor) throw new LlmModelConfigurationError('MODEL_NOT_AVAILABLE', 'LLM modeli provider catalog içinde bulunamadı.');
    return resolved(input, descriptor);
  }
}

/** Test/dev catalog adapter only. It performs no network or model invocation. */
export class StaticLlmCatalogProvider implements LlmProvider {
  public constructor(public readonly providerId: string, private readonly models: ReadonlyArray<LlmModelDescriptor>) {}

  public async listModels(): Promise<ReadonlyArray<LlmModelDescriptor>> {
    return this.models.filter((model) => model.providerId === this.providerId).map((model) => ({ ...model, capabilities: { ...model.capabilities } }));
  }
}

function resolved(input: ModelConfigurationInput, descriptor: LlmModelDescriptor): ResolvedModelConfiguration {
  return {
    configurationVersion: LLM_MODEL_CONFIGURATION_VERSION,
    configurationId: input.configurationId,
    scope: { ...input.scope },
    providerId: input.providerId,
    modelId: input.modelId,
    useCase: input.useCase,
    maxOutputTokens: input.maxOutputTokens,
    capabilities: { ...descriptor.capabilities },
    strictSchemaRequired: true,
    allowPromptContentPersistence: false,
    allowNetworkTools: false,
    modelFingerprintSha256: createHash('sha256').update(`${input.providerId}:${input.modelId}:${JSON.stringify(descriptor.capabilities)}`).digest('hex')
  };
}

function validateInput(input: ModelConfigurationInput): void {
  if (input.configurationVersion !== LLM_MODEL_CONFIGURATION_VERSION) throw invalid();
  validateId(input.configurationId);
  validateScope(input.scope);
  validateId(input.providerId);
  validateId(input.modelId);
  if (!['TARGET_ANALYSIS', 'STRATEGY_PROPOSAL'].includes(input.useCase)
    || !Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > MAX_OUTPUT_TOKENS) {
    throw invalid();
  }
}

function validateScope(scope: ModelConfigurationScope): void {
  validateId(scope.tenantId);
  validateId(scope.projectId);
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw invalid();
}

function configurationKey(scope: ModelConfigurationScope, configurationId: string): string {
  return `${scope.tenantId}:${scope.projectId}:${configurationId}`;
}

function invalid(): LlmModelConfigurationError {
  return new LlmModelConfigurationError('MODEL_CONFIG_INVALID', 'LLM model configuration input geçerli değil.');
}
