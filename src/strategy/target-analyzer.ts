import { createHash } from 'node:crypto';

import { assertSafeOutboundUrl } from '../security/egress-policy.js';

export const TARGET_ANALYZER_CONTRACT_VERSION = 'target-analyzer/v1' as const;

export type TargetAnalysisScope = {
  tenantId: string;
  projectId: string;
  targetId: string;
};

export type TargetAnalysisSignal = 'HTML_DOCUMENT' | 'JSON_DOCUMENT' | 'XML_DOCUMENT' | 'STRUCTURED_DATA_PRESENT' | 'JAVASCRIPT_RENDERING_OBSERVED';

export type TargetAnalyzerInput = {
  contractVersion: typeof TARGET_ANALYZER_CONTRACT_VERSION;
  scope: TargetAnalysisScope;
  target: {
    seedUrl: string;
    allowedHosts: ReadonlyArray<string>;
    allowedPorts: ReadonlyArray<number>;
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';
  };
  observedSignals: ReadonlyArray<TargetAnalysisSignal>;
};

export type TargetAnalysisPolicyResult = {
  allowed: boolean;
  reason: 'TARGET_ACTIVE_AND_EGRESS_ALLOWED' | 'TARGET_NOT_ACTIVE';
  allowStrategyProposal: false;
  allowWorkerAction: false;
  allowBypass: false;
};

export type TargetAnalyzerOutput = {
  contractVersion: typeof TARGET_ANALYZER_CONTRACT_VERSION;
  analysisId: string;
  analyzedAt: string;
  scope: TargetAnalysisScope;
  target: {
    protocol: 'http:' | 'https:';
    hostname: string;
    port: number;
    allowedHostCount: number;
    allowedPortCount: number;
  };
  capabilities: {
    htmlDocumentObserved: boolean;
    jsonDocumentObserved: boolean;
    xmlDocumentObserved: boolean;
    structuredDataObserved: boolean;
    javascriptRenderingObserved: boolean;
  };
  policy: TargetAnalysisPolicyResult;
  inputFingerprintSha256: string;
};

export class TargetAnalyzerError extends Error {
  public constructor(
    public readonly code: 'TARGET_ANALYZER_INVALID' | 'TARGET_ANALYZER_POLICY_BLOCKED',
    message: string
  ) {
    super(message);
    this.name = 'TargetAnalyzerError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_SIGNALS = 16;
const KNOWN_SIGNALS = new Set<TargetAnalysisSignal>(['HTML_DOCUMENT', 'JSON_DOCUMENT', 'XML_DOCUMENT', 'STRUCTURED_DATA_PRESENT', 'JAVASCRIPT_RENDERING_OBSERVED']);

/**
 * Deterministic Target Analyzer contract. It validates policy-safe target metadata
 * and signals only; it does not fetch a target, invoke an LLM, select a strategy or dispatch work.
 */
export class TargetAnalyzer {
  public constructor(private readonly now: () => Date = () => new Date()) {}

  public analyze(input: TargetAnalyzerInput): TargetAnalyzerOutput {
    validateInput(input);
    let safeUrl: ReturnType<typeof assertSafeOutboundUrl>;
    try {
      safeUrl = assertSafeOutboundUrl(input.target.seedUrl, [...input.target.allowedHosts]);
    } catch {
      throw new TargetAnalyzerError('TARGET_ANALYZER_POLICY_BLOCKED', 'Target Analyzer egress policy nedeniyle çalıştırılamaz.');
    }
    if (!input.target.allowedPorts.includes(safeUrl.port)) {
      throw new TargetAnalyzerError('TARGET_ANALYZER_POLICY_BLOCKED', 'Target Analyzer port policy nedeniyle çalıştırılamaz.');
    }
    const active = input.target.status === 'ACTIVE';
    const fingerprint = fingerprintInput(input, safeUrl.protocol, safeUrl.hostname, safeUrl.port);
    const analysisId = `analysis_${createHash('sha256').update(`${scopeKey(input.scope)}:${fingerprint}`).digest('hex').slice(0, 24)}`;
    const signals = new Set(input.observedSignals);
    return {
      contractVersion: TARGET_ANALYZER_CONTRACT_VERSION,
      analysisId,
      analyzedAt: this.now().toISOString(),
      scope: { ...input.scope },
      target: {
        protocol: safeUrl.protocol,
        hostname: safeUrl.hostname,
        port: safeUrl.port,
        allowedHostCount: input.target.allowedHosts.length,
        allowedPortCount: input.target.allowedPorts.length
      },
      capabilities: {
        htmlDocumentObserved: signals.has('HTML_DOCUMENT'),
        jsonDocumentObserved: signals.has('JSON_DOCUMENT'),
        xmlDocumentObserved: signals.has('XML_DOCUMENT'),
        structuredDataObserved: signals.has('STRUCTURED_DATA_PRESENT'),
        javascriptRenderingObserved: signals.has('JAVASCRIPT_RENDERING_OBSERVED')
      },
      policy: active
        ? { allowed: true, reason: 'TARGET_ACTIVE_AND_EGRESS_ALLOWED', allowStrategyProposal: false, allowWorkerAction: false, allowBypass: false }
        : { allowed: false, reason: 'TARGET_NOT_ACTIVE', allowStrategyProposal: false, allowWorkerAction: false, allowBypass: false },
      inputFingerprintSha256: fingerprint
    };
  }
}

function validateInput(input: TargetAnalyzerInput): void {
  if (input.contractVersion !== TARGET_ANALYZER_CONTRACT_VERSION) throw invalid();
  if (![input.scope.tenantId, input.scope.projectId, input.scope.targetId].every((value) => SAFE_ID.test(value))) throw invalid();
  if (!Array.isArray(input.target.allowedHosts) || input.target.allowedHosts.length === 0 || input.target.allowedHosts.length > MAX_SIGNALS
    || !input.target.allowedHosts.every((host) => /^[a-z0-9.-]{1,253}$/i.test(host))
    || !Array.isArray(input.target.allowedPorts) || input.target.allowedPorts.length === 0 || input.target.allowedPorts.length > MAX_SIGNALS
    || !input.target.allowedPorts.every((port) => Number.isInteger(port) && port >= 1 && port <= 65_535)
    || new Set(input.target.allowedHosts.map((host) => host.toLowerCase())).size !== input.target.allowedHosts.length
    || new Set(input.target.allowedPorts).size !== input.target.allowedPorts.length
    || !['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'].includes(input.target.status)
    || !Array.isArray(input.observedSignals) || input.observedSignals.length > MAX_SIGNALS || new Set(input.observedSignals).size !== input.observedSignals.length
    || !input.observedSignals.every((signal) => KNOWN_SIGNALS.has(signal))) {
    throw invalid();
  }
}

function fingerprintInput(input: TargetAnalyzerInput, protocol: string, hostname: string, port: number): string {
  return createHash('sha256').update(JSON.stringify({
    contractVersion: input.contractVersion,
    scope: input.scope,
    target: { protocol, hostname, port, allowedHosts: [...input.target.allowedHosts].map((host) => host.toLowerCase()).sort(), allowedPorts: [...input.target.allowedPorts].sort(), status: input.target.status },
    observedSignals: [...input.observedSignals].sort()
  })).digest('hex');
}

function scopeKey(scope: TargetAnalysisScope): string {
  return `${scope.tenantId}:${scope.projectId}:${scope.targetId}`;
}

function invalid(): TargetAnalyzerError {
  return new TargetAnalyzerError('TARGET_ANALYZER_INVALID', 'Target Analyzer input contract geçerli değil.');
}
