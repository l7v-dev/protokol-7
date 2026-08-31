import { createHash } from 'node:crypto';

export const STRATEGY_VERSION_CONTRACT_VERSION = 'strategy-version/v1' as const;

export type StrategyVersionScope = {
  tenantId: string;
  projectId: string;
};

export type StrategyVersionInput = {
  contractVersion: typeof STRATEGY_VERSION_CONTRACT_VERSION;
  strategyKey: string;
  ruleFingerprintSha256: string;
  createdAt: string;
};

export type StrategyVersion = StrategyVersionInput & {
  versionId: string;
  versionNumber: number;
};

export type StrategyOutcomeInput = {
  outcomeId: string;
  proposalId: string;
  versionId: string;
  outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'POLICY_BLOCKED';
  qualityScoreBps: number;
  costUnits: number;
  recordedAt: string;
};

export type StrategyFeedbackInput = {
  feedbackId: string;
  proposalId: string;
  versionId: string;
  verdict: 'ACCEPTED' | 'REJECTED' | 'NEEDS_REVIEW';
  reasonCode: string;
  recordedAt: string;
};

export type StrategyImpactSummary = {
  scope: StrategyVersionScope;
  versionId: string;
  outcomeCount: number;
  feedbackCount: number;
  succeededCount: number;
  failedCount: number;
  cancelledCount: number;
  policyBlockedCount: number;
  averageQualityScoreBps: number;
  totalCostUnits: number;
};

export class StrategyFeedbackError extends Error {
  public constructor(
    public readonly code: 'STRATEGY_VERSION_INVALID' | 'STRATEGY_VERSION_NOT_FOUND' | 'STRATEGY_VERSION_CONFLICT' | 'STRATEGY_VERSION_SCOPE_MISMATCH',
    message: string
  ) {
    super(message);
    this.name = 'StrategyFeedbackError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const MAX_RECORDS_PER_VERSION = 10_000;

/**
 * Process-local immutable version and outcome/feedback reference. It does not
 * retain raw content, invoke models, change strategies, charge costs, or dispatch execution.
 */
export class StrategyFeedbackRegistry {
  private readonly versionsByScope = new Map<string, StrategyVersion[]>();
  private readonly outcomesByVersion = new Map<string, StrategyOutcomeInput[]>();
  private readonly feedbackByVersion = new Map<string, StrategyFeedbackInput[]>();

  public createVersion(scope: StrategyVersionScope, input: StrategyVersionInput): StrategyVersion {
    validateScope(scope);
    validateVersionInput(input);
    const versions = this.versionsByScope.get(scopeKey(scope)) ?? [];
    const duplicate = versions.find((version) => version.strategyKey === input.strategyKey && version.ruleFingerprintSha256 === input.ruleFingerprintSha256);
    if (duplicate) return { ...duplicate };
    const versionNumber = versions.filter((version) => version.strategyKey === input.strategyKey).length + 1;
    const versionId = `strategy_${createHash('sha256').update(`${scopeKey(scope)}:${input.strategyKey}:${versionNumber}:${input.ruleFingerprintSha256}`).digest('hex').slice(0, 24)}`;
    const version: StrategyVersion = { ...input, versionId, versionNumber };
    this.versionsByScope.set(scopeKey(scope), [...versions, version]);
    return { ...version };
  }

  public listVersions(scope: StrategyVersionScope, strategyKey: string): ReadonlyArray<StrategyVersion> {
    validateScope(scope);
    validateId(strategyKey);
    return (this.versionsByScope.get(scopeKey(scope)) ?? []).filter((version) => version.strategyKey === strategyKey).map((version) => ({ ...version }));
  }

  public recordOutcome(scope: StrategyVersionScope, input: StrategyOutcomeInput): StrategyOutcomeInput {
    validateScope(scope);
    validateOutcome(input);
    this.requireVersion(scope, input.versionId);
    const key = versionKey(scope, input.versionId);
    const records = this.outcomesByVersion.get(key) ?? [];
    if (records.length >= MAX_RECORDS_PER_VERSION) throw new StrategyFeedbackError('STRATEGY_VERSION_INVALID', 'Strategy outcome kayıt sınırı aşıldı.');
    const duplicate = records.find((record) => record.outcomeId === input.outcomeId);
    if (duplicate) {
      if (JSON.stringify(duplicate) === JSON.stringify(input)) return { ...duplicate };
      throw new StrategyFeedbackError('STRATEGY_VERSION_CONFLICT', 'Strategy outcome kimliği farklı içerikle tekrar kullanılamaz.');
    }
    const record = { ...input };
    this.outcomesByVersion.set(key, [...records, record]);
    return { ...record };
  }

  public recordFeedback(scope: StrategyVersionScope, input: StrategyFeedbackInput): StrategyFeedbackInput {
    validateScope(scope);
    validateFeedback(input);
    this.requireVersion(scope, input.versionId);
    const key = versionKey(scope, input.versionId);
    const records = this.feedbackByVersion.get(key) ?? [];
    if (records.length >= MAX_RECORDS_PER_VERSION) throw new StrategyFeedbackError('STRATEGY_VERSION_INVALID', 'Strategy feedback kayıt sınırı aşıldı.');
    const duplicate = records.find((record) => record.feedbackId === input.feedbackId);
    if (duplicate) {
      if (JSON.stringify(duplicate) === JSON.stringify(input)) return { ...duplicate };
      throw new StrategyFeedbackError('STRATEGY_VERSION_CONFLICT', 'Strategy feedback kimliği farklı içerikle tekrar kullanılamaz.');
    }
    const record = { ...input };
    this.feedbackByVersion.set(key, [...records, record]);
    return { ...record };
  }

  public impact(scope: StrategyVersionScope, versionId: string): StrategyImpactSummary {
    validateScope(scope);
    validateId(versionId);
    this.requireVersion(scope, versionId);
    const key = versionKey(scope, versionId);
    const outcomes = this.outcomesByVersion.get(key) ?? [];
    const feedback = this.feedbackByVersion.get(key) ?? [];
    return {
      scope: { ...scope },
      versionId,
      outcomeCount: outcomes.length,
      feedbackCount: feedback.length,
      succeededCount: outcomes.filter((outcome) => outcome.outcome === 'SUCCEEDED').length,
      failedCount: outcomes.filter((outcome) => outcome.outcome === 'FAILED').length,
      cancelledCount: outcomes.filter((outcome) => outcome.outcome === 'CANCELLED').length,
      policyBlockedCount: outcomes.filter((outcome) => outcome.outcome === 'POLICY_BLOCKED').length,
      averageQualityScoreBps: outcomes.length === 0 ? 0 : Math.round(outcomes.reduce((total, outcome) => total + outcome.qualityScoreBps, 0) / outcomes.length),
      totalCostUnits: outcomes.reduce((total, outcome) => total + outcome.costUnits, 0)
    };
  }

  private requireVersion(scope: StrategyVersionScope, versionId: string): StrategyVersion {
    const version = (this.versionsByScope.get(scopeKey(scope)) ?? []).find((candidate) => candidate.versionId === versionId);
    if (version) return version;
    if ([...this.versionsByScope.values()].flat().some((candidate) => candidate.versionId === versionId)) {
      throw new StrategyFeedbackError('STRATEGY_VERSION_SCOPE_MISMATCH', 'Strategy version tenant veya project scope ile eşleşmiyor.');
    }
    throw new StrategyFeedbackError('STRATEGY_VERSION_NOT_FOUND', 'Strategy version bulunamadı.');
  }
}

function validateVersionInput(input: StrategyVersionInput): void {
  if (input.contractVersion !== STRATEGY_VERSION_CONTRACT_VERSION || !SAFE_ID.test(input.strategyKey) || !SHA256.test(input.ruleFingerprintSha256) || !Number.isFinite(Date.parse(input.createdAt))) throw invalid();
}

function validateOutcome(input: StrategyOutcomeInput): void {
  if (!SAFE_ID.test(input.outcomeId) || !SAFE_ID.test(input.proposalId) || !SAFE_ID.test(input.versionId)
    || !['SUCCEEDED', 'FAILED', 'CANCELLED', 'POLICY_BLOCKED'].includes(input.outcome)
    || !Number.isInteger(input.qualityScoreBps) || input.qualityScoreBps < 0 || input.qualityScoreBps > 10_000
    || !Number.isInteger(input.costUnits) || input.costUnits < 0 || !Number.isFinite(Date.parse(input.recordedAt))) throw invalid();
}

function validateFeedback(input: StrategyFeedbackInput): void {
  if (!SAFE_ID.test(input.feedbackId) || !SAFE_ID.test(input.proposalId) || !SAFE_ID.test(input.versionId) || !SAFE_ID.test(input.reasonCode)
    || !['ACCEPTED', 'REJECTED', 'NEEDS_REVIEW'].includes(input.verdict) || !Number.isFinite(Date.parse(input.recordedAt))) throw invalid();
}

function validateScope(scope: StrategyVersionScope): void {
  validateId(scope.tenantId);
  validateId(scope.projectId);
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw invalid();
}

function scopeKey(scope: StrategyVersionScope): string {
  return `${scope.tenantId}:${scope.projectId}`;
}

function versionKey(scope: StrategyVersionScope, versionId: string): string {
  return `${scopeKey(scope)}:${versionId}`;
}

function invalid(): StrategyFeedbackError {
  return new StrategyFeedbackError('STRATEGY_VERSION_INVALID', 'Strategy version/feedback input geçerli değil.');
}
