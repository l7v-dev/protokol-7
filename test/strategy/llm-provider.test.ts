import { describe, expect, it } from 'vitest';

import { LLM_MODEL_CONFIGURATION_VERSION, LlmModelConfigurationError, ModelConfigurationRegistry, StaticLlmCatalogProvider } from '../../src/strategy/llm-provider.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const provider = () => new StaticLlmCatalogProvider('provider_fixture', [{
  providerId: 'provider_fixture',
  modelId: 'model_structured',
  capabilities: { structuredOutput: true, tools: false, vision: false, reasoning: false }
}]);
const configuration = { configurationVersion: LLM_MODEL_CONFIGURATION_VERSION, configurationId: 'config_1', scope, providerId: 'provider_fixture', modelId: 'model_structured', useCase: 'TARGET_ANALYSIS' as const, enabled: true, maxOutputTokens: 512, requireStructuredOutput: true };

describe('LLM provider abstraction and model configuration contracts', () => {
  it('binds a provider-neutral catalog model to a secret-safe, non-actionable resolved configuration', async () => {
    const registry = new ModelConfigurationRegistry();
    registry.registerProvider(provider());
    const registered = await registry.register(configuration);
    const resolved = await registry.resolve(scope, 'config_1');

    expect(registered).toEqual(resolved);
    expect(resolved).toMatchObject({ providerId: 'provider_fixture', modelId: 'model_structured', strictSchemaRequired: true, allowPromptContentPersistence: false, allowNetworkTools: false });
    expect(resolved.modelFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(resolved)).not.toContain('apiKey');
    expect(JSON.stringify(resolved)).not.toContain('prompt');
  });

  it('rejects unavailable models, unsupported structured-output configurations, duplicates and disabled configurations', async () => {
    const registry = new ModelConfigurationRegistry();
    registry.registerProvider(provider());
    await expect(registry.register({ ...configuration, modelId: 'missing_model' })).rejects.toMatchObject({ code: 'MODEL_NOT_AVAILABLE' });
    await registry.register({ ...configuration, enabled: false });
    await expect(registry.register({ ...configuration, enabled: false })).rejects.toMatchObject({ code: 'MODEL_CONFIG_CONFLICT' });
    await expect(registry.resolve(scope, 'config_1')).rejects.toMatchObject({ code: 'MODEL_CONFIG_DISABLED' });
  });

  it('rejects cross-scope resolution, malformed configuration input and provider conflicts fail-closed', async () => {
    const registry = new ModelConfigurationRegistry();
    registry.registerProvider(provider());
    await registry.register(configuration);

    await expect(registry.resolve({ tenantId: 'tenant_2', projectId: 'project_1' }, 'config_1')).rejects.toMatchObject({ code: 'MODEL_CONFIG_SCOPE_MISMATCH' });
    await expect(registry.register({ ...configuration, configurationId: 'bad id' })).rejects.toBeInstanceOf(LlmModelConfigurationError);
    expect(() => registry.registerProvider(provider())).toThrowError(expect.objectContaining({ code: 'MODEL_CONFIG_CONFLICT' }));
  });
});
