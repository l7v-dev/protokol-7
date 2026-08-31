import { describe, expect, it } from 'vitest';

import { StaticLlmCatalogProvider, ModelConfigurationRegistry, LLM_MODEL_CONFIGURATION_VERSION } from '../../src/strategy/llm-provider.js';
import { StrategyProposalError, StrategyProposalRegistry } from '../../src/strategy/proposal-approval.js';
import { DeterministicStrategyRules, STRATEGY_RULE_CONTRACT_VERSION } from '../../src/strategy/strategy-rules.js';
import { TARGET_ANALYZER_CONTRACT_VERSION, TargetAnalyzer } from '../../src/strategy/target-analyzer.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1', targetId: 'target_1', jobId: 'job_1' };

async function readyInputs() {
  const analysis = new TargetAnalyzer(() => new Date('2026-08-27T00:00:00.000Z')).analyze({
    contractVersion: TARGET_ANALYZER_CONTRACT_VERSION,
    scope: { tenantId: scope.tenantId, projectId: scope.projectId, targetId: scope.targetId },
    target: { seedUrl: 'https://example.com', allowedHosts: ['example.com'], allowedPorts: [443], status: 'ACTIVE' },
    observedSignals: ['JAVASCRIPT_RENDERING_OBSERVED']
  });
  const configRegistry = new ModelConfigurationRegistry();
  configRegistry.registerProvider(new StaticLlmCatalogProvider('provider_1', [{ providerId: 'provider_1', modelId: 'model_1', capabilities: { structuredOutput: true, tools: false, vision: false, reasoning: false } }]));
  const configuration = await configRegistry.register({ configurationVersion: LLM_MODEL_CONFIGURATION_VERSION, configurationId: 'config_1', scope: { tenantId: scope.tenantId, projectId: scope.projectId }, providerId: 'provider_1', modelId: 'model_1', useCase: 'STRATEGY_PROPOSAL', enabled: true, maxOutputTokens: 256, requireStructuredOutput: true });
  const recommendation = new DeterministicStrategyRules().recommend({ contractVersion: STRATEGY_RULE_CONTRACT_VERSION, analysis, policy: { allowBrowserRendering: true, allowProxyRotation: false, browserFallbackAvailable: true } });
  return { analysis, configuration, recommendation };
}

describe('strategy proposal and policy approval contracts', () => {
  it('creates an idempotent, secret-safe pending proposal that cannot become a worker action', async () => {
    const registry = new StrategyProposalRegistry(() => new Date('2026-08-27T00:00:00.000Z'));
    const { analysis, configuration, recommendation } = await readyInputs();
    const first = registry.create(scope, analysis, configuration, recommendation, 8_500);
    const second = registry.create(scope, analysis, configuration, recommendation, 8_500);

    expect(first).toEqual(second);
    expect(first).toMatchObject({ candidate: 'BROWSER_RENDER', status: 'PENDING_POLICY', allowWorkerAction: false, allowBypass: false });
    expect(JSON.stringify(first)).not.toContain('prompt');
    expect(JSON.stringify(first)).not.toContain('apiKey');
  });

  it('requires an explicit policy decision, audits it, and retains no action authorization after approval', async () => {
    const registry = new StrategyProposalRegistry(() => new Date('2026-08-27T00:00:00.000Z'));
    const { analysis, configuration, recommendation } = await readyInputs();
    const proposal = registry.create(scope, analysis, configuration, recommendation, 8_500);
    const approval = { approverId: 'policy_operator', decision: 'APPROVE' as const, reasonCode: 'POLICY_REVIEWED', decidedAt: '2026-08-27T00:01:00.000Z' };
    const decision = registry.decide(scope, proposal.proposalId, approval);

    expect(decision).toMatchObject({ status: 'POLICY_APPROVED', actionAllowed: false, allowBypass: false });
    expect(registry.decide(scope, proposal.proposalId, approval)).toEqual(decision);
    expect(registry.auditEvents(scope).map((event) => event.action)).toEqual(['PROPOSAL_CREATED', 'POLICY_APPROVED']);
  });

  it('rejects policy-blocked/NONE/cross-scope proposals and conflicting approval decisions fail-closed', async () => {
    const registry = new StrategyProposalRegistry();
    const { analysis, configuration, recommendation } = await readyInputs();
    const proposal = registry.create(scope, analysis, configuration, recommendation, 8_500);
    registry.decide(scope, proposal.proposalId, { approverId: 'policy_operator', decision: 'REJECT', reasonCode: 'POLICY_REJECTED', decidedAt: '2026-08-27T00:01:00.000Z' });

    expect(() => registry.decide(scope, proposal.proposalId, { approverId: 'another_operator', decision: 'APPROVE', reasonCode: 'OVERRIDE', decidedAt: '2026-08-27T00:02:00.000Z' })).toThrowError(expect.objectContaining({ code: 'STRATEGY_PROPOSAL_CONFLICT' }));
    expect(() => registry.create(scope, { ...analysis, policy: { ...analysis.policy, allowed: false } }, configuration, recommendation, 8_500)).toThrowError(expect.objectContaining({ code: 'STRATEGY_PROPOSAL_POLICY_BLOCKED' }));
    expect(() => registry.decide({ ...scope, tenantId: 'tenant_2' }, proposal.proposalId, { approverId: 'policy_operator', decision: 'APPROVE', reasonCode: 'POLICY_REVIEWED', decidedAt: '2026-08-27T00:01:00.000Z' })).toThrow(StrategyProposalError);
  });
});
