import { describe, expect, it } from 'vitest';

import { TARGET_ANALYZER_CONTRACT_VERSION, TargetAnalyzer, TargetAnalyzerError } from '../../src/strategy/target-analyzer.js';

const analyzer = () => new TargetAnalyzer(() => new Date('2026-08-27T00:00:00.000Z'));
const input = {
  contractVersion: TARGET_ANALYZER_CONTRACT_VERSION,
  scope: { tenantId: 'tenant_1', projectId: 'project_1', targetId: 'target_1' },
  target: { seedUrl: 'https://example.com/catalog', allowedHosts: ['example.com'], allowedPorts: [443], status: 'ACTIVE' as const },
  observedSignals: ['HTML_DOCUMENT', 'STRUCTURED_DATA_PRESENT'] as const
};

describe('versioned target analyzer contract', () => {
  it('returns deterministic, secret-safe target capabilities and a non-actionable policy result', () => {
    const output = analyzer().analyze(input);

    expect(output).toMatchObject({
      contractVersion: TARGET_ANALYZER_CONTRACT_VERSION,
      target: { protocol: 'https:', hostname: 'example.com', port: 443, allowedHostCount: 1, allowedPortCount: 1 },
      capabilities: { htmlDocumentObserved: true, structuredDataObserved: true, javascriptRenderingObserved: false },
      policy: { allowed: true, allowStrategyProposal: false, allowWorkerAction: false, allowBypass: false }
    });
    expect(output.inputFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(output)).not.toContain('catalog');
    expect(JSON.stringify(output)).not.toContain('authorization');
  });

  it('returns a terminal non-actionable policy result for inactive targets after safe egress validation', () => {
    const output = analyzer().analyze({ ...input, target: { ...input.target, status: 'PAUSED' } });

    expect(output.policy).toEqual({ allowed: false, reason: 'TARGET_NOT_ACTIVE', allowStrategyProposal: false, allowWorkerAction: false, allowBypass: false });
  });

  it('rejects unsafe targets, port/host mismatches, forged versions and unbounded signals fail-closed', () => {
    expect(() => analyzer().analyze({ ...input, target: { ...input.target, seedUrl: 'http://127.0.0.1/private', allowedHosts: ['127.0.0.1'], allowedPorts: [80] } })).toThrowError(expect.objectContaining({ code: 'TARGET_ANALYZER_POLICY_BLOCKED' }));
    expect(() => analyzer().analyze({ ...input, target: { ...input.target, allowedPorts: [8443] } })).toThrowError(expect.objectContaining({ code: 'TARGET_ANALYZER_POLICY_BLOCKED' }));
    expect(() => analyzer().analyze({ ...input, contractVersion: 'target-analyzer/v0' })).toThrow(TargetAnalyzerError);
    expect(() => analyzer().analyze({ ...input, observedSignals: ['HTML_DOCUMENT', 'HTML_DOCUMENT'] })).toThrowError(expect.objectContaining({ code: 'TARGET_ANALYZER_INVALID' }));
  });
});
