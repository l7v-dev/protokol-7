import { createHash } from 'node:crypto';

import type { ResolvedModelConfiguration } from './llm-provider.js';
import type { StrategyCandidate, StrategyRecommendation } from './strategy-rules.js';
import type { TargetAnalyzerOutput } from './target-analyzer.js';

export const STRATEGY_PROPOSAL_CONTRACT_VERSION = 'strategy-proposal/v1' as const;

export type StrategyProposalScope = {
  tenantId: string;
  projectId: string;
  targetId: string;
  jobId: string;
};

export type StrategyProposal = {
  contractVersion: typeof STRATEGY_PROPOSAL_CONTRACT_VERSION;
  proposalId: string;
  scope: StrategyProposalScope;
  analysisId: string;
  modelConfigurationId: string;
  candidate: Exclude<StrategyCandidate, 'NONE'>;
  ruleReason: string;
  confidenceBps: number;
  proposalFingerprintSha256: string;
  createdAt: string;
  status: 'PENDING_POLICY';
  allowWorkerAction: false;
  allowBypass: false;
};

export type PolicyApprovalInput = {
  approverId: string;
  decision: 'APPROVE' | 'REJECT';
  reasonCode: string;
  decidedAt: string;
};

export type StrategyProposalDecision = {
  proposalId: string;
  scope: StrategyProposalScope;
  status: 'POLICY_APPROVED' | 'POLICY_REJECTED';
  approverId: string;
  reasonCode: string;
  decidedAt: string;
  actionAllowed: false;
  allowBypass: false;
};

export type StrategyProposalAuditEvent = {
  eventId: string;
  occurredAt: string;
  tenantId: string;
  projectId: string;
  targetId: string;
  jobId: string;
  proposalId: string;
  action: 'PROPOSAL_CREATED' | 'POLICY_APPROVED' | 'POLICY_REJECTED';
  candidate: Exclude<StrategyCandidate, 'NONE'>;
  reasonCode: string;
  approverId?: string;
};

export class StrategyProposalError extends Error {
  public constructor(
    public readonly code: 'STRATEGY_PROPOSAL_INVALID' | 'STRATEGY_PROPOSAL_NOT_FOUND' | 'STRATEGY_PROPOSAL_CONFLICT' | 'STRATEGY_PROPOSAL_SCOPE_MISMATCH' | 'STRATEGY_PROPOSAL_POLICY_BLOCKED',
    message: string
  ) {
    super(message);
    this.name = 'StrategyProposalError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_PROPOSALS_PER_SCOPE = 1_000;

/**
 * Process-local proposal and policy-decision reference. It does not call an LLM,
 * execute a recommendation, publish a command, mutate target policy or bypass controls.
 */
export class StrategyProposalRegistry {
  private readonly proposals = new Map<string, StrategyProposal>();
  private readonly decisions = new Map<string, StrategyProposalDecision>();
  private readonly auditByScope = new Map<string, StrategyProposalAuditEvent[]>();
  private sequence = 0;

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public create(
    scope: StrategyProposalScope,
    analysis: TargetAnalyzerOutput,
    configuration: ResolvedModelConfiguration,
    recommendation: StrategyRecommendation,
    confidenceBps: number
  ): StrategyProposal {
    validateScope(scope);
    validateLinkedInputs(scope, analysis, configuration, recommendation, confidenceBps);
    if (recommendation.candidate === 'NONE') {
      throw new StrategyProposalError('STRATEGY_PROPOSAL_POLICY_BLOCKED', 'Action içermeyen strategy recommendation proposal olamaz.');
    }
    const key = scopeKey(scope);
    if (countScope(this.proposals, key) >= MAX_PROPOSALS_PER_SCOPE) throw new StrategyProposalError('STRATEGY_PROPOSAL_INVALID', 'Strategy proposal sınırı aşıldı.');
    const proposalFingerprintSha256 = fingerprint(scope, analysis.analysisId, configuration.configurationId, recommendation.candidate, recommendation.reason, confidenceBps);
    const proposalId = `proposal_${proposalFingerprintSha256.slice(0, 24)}`;
    const existing = this.proposals.get(proposalKey(scope, proposalId));
    if (existing) return cloneProposal(existing);
    const proposal: StrategyProposal = {
      contractVersion: STRATEGY_PROPOSAL_CONTRACT_VERSION,
      proposalId,
      scope: { ...scope },
      analysisId: analysis.analysisId,
      modelConfigurationId: configuration.configurationId,
      candidate: recommendation.candidate,
      ruleReason: recommendation.reason,
      confidenceBps,
      proposalFingerprintSha256,
      createdAt: this.now().toISOString(),
      status: 'PENDING_POLICY',
      allowWorkerAction: false,
      allowBypass: false
    };
    this.proposals.set(proposalKey(scope, proposalId), proposal);
    this.recordAudit(proposal, 'PROPOSAL_CREATED', 'PROPOSAL_CREATED');
    return cloneProposal(proposal);
  }

  public decide(scope: StrategyProposalScope, proposalId: string, input: PolicyApprovalInput): StrategyProposalDecision {
    validateScope(scope);
    validateId(proposalId);
    validateDecision(input);
    const proposal = this.requireProposal(scope, proposalId);
    const existing = this.decisions.get(proposalKey(scope, proposalId));
    if (existing) {
      if (existing.status === (input.decision === 'APPROVE' ? 'POLICY_APPROVED' : 'POLICY_REJECTED') && existing.approverId === input.approverId && existing.reasonCode === input.reasonCode) return { ...existing, scope: { ...existing.scope } };
      throw new StrategyProposalError('STRATEGY_PROPOSAL_CONFLICT', 'Strategy proposal için policy kararı zaten kaydedilmiş.');
    }
    const decision: StrategyProposalDecision = {
      proposalId,
      scope: { ...scope },
      status: input.decision === 'APPROVE' ? 'POLICY_APPROVED' : 'POLICY_REJECTED',
      approverId: input.approverId,
      reasonCode: input.reasonCode,
      decidedAt: input.decidedAt,
      actionAllowed: false,
      allowBypass: false
    };
    this.decisions.set(proposalKey(scope, proposalId), decision);
    this.recordAudit(proposal, input.decision === 'APPROVE' ? 'POLICY_APPROVED' : 'POLICY_REJECTED', input.reasonCode, input.approverId);
    return { ...decision, scope: { ...decision.scope } };
  }

  public auditEvents(scope: StrategyProposalScope): ReadonlyArray<StrategyProposalAuditEvent> {
    validateScope(scope);
    return (this.auditByScope.get(scopeKey(scope)) ?? []).map((event) => ({ ...event }));
  }

  private requireProposal(scope: StrategyProposalScope, proposalId: string): StrategyProposal {
    const proposal = this.proposals.get(proposalKey(scope, proposalId));
    if (proposal) return proposal;
    if ([...this.proposals.values()].some((candidate) => candidate.proposalId === proposalId)) {
      throw new StrategyProposalError('STRATEGY_PROPOSAL_SCOPE_MISMATCH', 'Strategy proposal tenant/project/target/job scope ile eşleşmiyor.');
    }
    throw new StrategyProposalError('STRATEGY_PROPOSAL_NOT_FOUND', 'Strategy proposal bulunamadı.');
  }

  private recordAudit(proposal: StrategyProposal, action: StrategyProposalAuditEvent['action'], reasonCode: string, approverId?: string): void {
    this.sequence += 1;
    const event: StrategyProposalAuditEvent = {
      eventId: `strategy_audit_${createHash('sha256').update(`${scopeKey(proposal.scope)}:${this.sequence}`).digest('hex').slice(0, 24)}`,
      occurredAt: this.now().toISOString(),
      tenantId: proposal.scope.tenantId,
      projectId: proposal.scope.projectId,
      targetId: proposal.scope.targetId,
      jobId: proposal.scope.jobId,
      proposalId: proposal.proposalId,
      action,
      candidate: proposal.candidate,
      reasonCode,
      ...(approverId === undefined ? {} : { approverId })
    };
    const key = scopeKey(proposal.scope);
    this.auditByScope.set(key, [...(this.auditByScope.get(key) ?? []), event]);
  }
}

function validateLinkedInputs(scope: StrategyProposalScope, analysis: TargetAnalyzerOutput, configuration: ResolvedModelConfiguration, recommendation: StrategyRecommendation, confidenceBps: number): void {
  if (analysis.contractVersion !== 'target-analyzer/v1'
    || configuration.configurationVersion !== 'llm-model-config/v1'
    || recommendation.contractVersion !== 'strategy-rules/v1'
    || !analysis.policy.allowed || !recommendation.policy.analyzerAllowed
    || !recommendation.policy.requiresPolicyApproval || recommendation.policy.allowWorkerAction || recommendation.policy.allowBypass
    || recommendation.candidate === 'NONE'
    || analysis.scope.tenantId !== scope.tenantId || analysis.scope.projectId !== scope.projectId || analysis.scope.targetId !== scope.targetId
    || configuration.scope.tenantId !== scope.tenantId || configuration.scope.projectId !== scope.projectId
    || recommendation.analysisId !== analysis.analysisId
    || !Number.isInteger(confidenceBps) || confidenceBps < 0 || confidenceBps > 10_000) {
    throw new StrategyProposalError('STRATEGY_PROPOSAL_POLICY_BLOCKED', 'Strategy proposal policy koşullarını karşılamıyor.');
  }
}

function validateDecision(input: PolicyApprovalInput): void {
  validateId(input.approverId);
  validateId(input.reasonCode);
  if (!['APPROVE', 'REJECT'].includes(input.decision) || !Number.isFinite(Date.parse(input.decidedAt))) {
    throw new StrategyProposalError('STRATEGY_PROPOSAL_INVALID', 'Policy approval input geçerli değil.');
  }
}

function validateScope(scope: StrategyProposalScope): void {
  if (![scope.tenantId, scope.projectId, scope.targetId, scope.jobId].every((value) => SAFE_ID.test(value))) {
    throw new StrategyProposalError('STRATEGY_PROPOSAL_INVALID', 'Strategy proposal scope geçerli değil.');
  }
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw new StrategyProposalError('STRATEGY_PROPOSAL_INVALID', 'Strategy proposal kimliği geçerli değil.');
}

function scopeKey(scope: StrategyProposalScope): string {
  return `${scope.tenantId}:${scope.projectId}:${scope.targetId}:${scope.jobId}`;
}

function proposalKey(scope: StrategyProposalScope, proposalId: string): string {
  return `${scopeKey(scope)}:${proposalId}`;
}

function fingerprint(scope: StrategyProposalScope, analysisId: string, configurationId: string, candidate: string, reason: string, confidenceBps: number): string {
  return createHash('sha256').update(JSON.stringify({ scope, analysisId, configurationId, candidate, reason, confidenceBps })).digest('hex');
}

function countScope(records: Map<string, StrategyProposal>, key: string): number {
  return [...records.keys()].filter((recordKey) => recordKey.startsWith(`${key}:`)).length;
}

function cloneProposal(proposal: StrategyProposal): StrategyProposal {
  return { ...proposal, scope: { ...proposal.scope } };
}
