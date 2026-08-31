export const TELEMETRY_GOVERNANCE_CONTRACT_VERSION = 'telemetry-governance/v1' as const;

export type TelemetrySignal = 'TRACE' | 'METRIC' | 'STRUCTURED_LOG' | 'ALERT_DECISION';
export type TelemetryAccessRole = 'OBSERVABILITY_READER' | 'SRE_OPERATOR' | 'SECURITY_AUDITOR' | 'DATA_QUALITY_READER';

export type TelemetryScope = { tenantId: string; projectId: string };

export type TelemetryRetentionReview = {
  contractVersion: typeof TELEMETRY_GOVERNANCE_CONTRACT_VERSION;
  scope: TelemetryScope;
  signal: TelemetrySignal;
  capturedAt: string;
  reviewedAt: string;
  retentionDays: number;
  expiresAt: string;
  status: 'RETENTION_ACTIVE' | 'RETENTION_EXPIRED';
  allowsDestructiveAction: false;
};

export type TelemetryAccessDecision = {
  contractVersion: typeof TELEMETRY_GOVERNANCE_CONTRACT_VERSION;
  scope: TelemetryScope;
  signal: TelemetrySignal;
  role: TelemetryAccessRole;
  allowed: boolean;
  reason: 'ROLE_ALLOWED' | 'ROLE_DENIED' | 'SCOPE_MISMATCH';
};

export type TelemetryCompletenessReport = {
  contractVersion: typeof TELEMETRY_GOVERNANCE_CONTRACT_VERSION;
  scope: TelemetryScope;
  checkedAt: string;
  expectedSignalCount: 4;
  observedSignalCount: number;
  missingSignals: ReadonlyArray<TelemetrySignal>;
  complete: boolean;
};

export class TelemetryGovernanceError extends Error {
  public constructor(public readonly code: 'TELEMETRY_GOVERNANCE_INVALID', message: string) {
    super(message);
    this.name = 'TelemetryGovernanceError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SIGNALS: ReadonlyArray<TelemetrySignal> = ['TRACE', 'METRIC', 'STRUCTURED_LOG', 'ALERT_DECISION'];
const RETENTION_DAYS: Readonly<Record<TelemetrySignal, number>> = {
  TRACE: 14,
  METRIC: 30,
  STRUCTURED_LOG: 30,
  ALERT_DECISION: 90
};
const ALLOWED_SIGNALS_BY_ROLE: Readonly<Record<TelemetryAccessRole, ReadonlyArray<TelemetrySignal>>> = {
  OBSERVABILITY_READER: ['METRIC', 'ALERT_DECISION'],
  SRE_OPERATOR: ['TRACE', 'METRIC', 'STRUCTURED_LOG', 'ALERT_DECISION'],
  SECURITY_AUDITOR: ['STRUCTURED_LOG', 'ALERT_DECISION'],
  DATA_QUALITY_READER: ['METRIC', 'ALERT_DECISION']
};

/**
 * Pure telemetry-governance evaluator. It stores no telemetry, reads no sink,
 * grants no session, deletes nothing and never exposes payloads, contacts,
 * raw log/trace content, credentials or arbitrary retention policies.
 */
export class TelemetryGovernanceEvaluator {
  public reviewRetention(input: { scope: TelemetryScope; signal: TelemetrySignal; capturedAt: string; reviewedAt: string }): TelemetryRetentionReview {
    validateScope(input.scope);
    validateSignal(input.signal);
    if (!isTime(input.capturedAt) || !isTime(input.reviewedAt) || Date.parse(input.reviewedAt) < Date.parse(input.capturedAt)) throw invalid();
    const retentionDays = RETENTION_DAYS[input.signal];
    const expiresAt = new Date(Date.parse(input.capturedAt) + retentionDays * 86_400_000).toISOString();
    return {
      contractVersion: TELEMETRY_GOVERNANCE_CONTRACT_VERSION,
      scope: { ...input.scope }, signal: input.signal, capturedAt: input.capturedAt, reviewedAt: input.reviewedAt,
      retentionDays, expiresAt,
      status: Date.parse(input.reviewedAt) >= Date.parse(expiresAt) ? 'RETENTION_EXPIRED' : 'RETENTION_ACTIVE',
      allowsDestructiveAction: false
    };
  }

  public reviewAccess(input: { scope: TelemetryScope; authorizationScope: TelemetryScope; signal: TelemetrySignal; role: TelemetryAccessRole }): TelemetryAccessDecision {
    validateScope(input.scope);
    validateScope(input.authorizationScope);
    validateSignal(input.signal);
    if (!Object.hasOwn(ALLOWED_SIGNALS_BY_ROLE, input.role)) throw invalid();
    const sameScope = input.scope.tenantId === input.authorizationScope.tenantId && input.scope.projectId === input.authorizationScope.projectId;
    const allowed = sameScope && ALLOWED_SIGNALS_BY_ROLE[input.role].includes(input.signal);
    return {
      contractVersion: TELEMETRY_GOVERNANCE_CONTRACT_VERSION,
      scope: { ...input.scope }, signal: input.signal, role: input.role, allowed,
      reason: !sameScope ? 'SCOPE_MISMATCH' : allowed ? 'ROLE_ALLOWED' : 'ROLE_DENIED'
    };
  }

  public reviewCompleteness(input: { scope: TelemetryScope; checkedAt: string; observations: ReadonlyArray<{ signal: TelemetrySignal; observed: boolean }> }): TelemetryCompletenessReport {
    validateScope(input.scope);
    if (!isTime(input.checkedAt) || input.observations.length !== SIGNALS.length) throw invalid();
    const observations = new Map<TelemetrySignal, boolean>();
    for (const observation of input.observations) {
      validateSignal(observation.signal);
      if (typeof observation.observed !== 'boolean' || observations.has(observation.signal)) throw invalid();
      observations.set(observation.signal, observation.observed);
    }
    if (observations.size !== SIGNALS.length) throw invalid();
    const missingSignals = SIGNALS.filter((signal) => observations.get(signal) !== true);
    return {
      contractVersion: TELEMETRY_GOVERNANCE_CONTRACT_VERSION,
      scope: { ...input.scope }, checkedAt: input.checkedAt, expectedSignalCount: 4,
      observedSignalCount: SIGNALS.length - missingSignals.length,
      missingSignals, complete: missingSignals.length === 0
    };
  }
}

function validateScope(scope: TelemetryScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.projectId)) throw invalid();
}

function validateSignal(signal: TelemetrySignal): void {
  if (!SIGNALS.includes(signal)) throw invalid();
}

function isTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function invalid(): TelemetryGovernanceError {
  return new TelemetryGovernanceError('TELEMETRY_GOVERNANCE_INVALID', 'Telemetry governance input geçerli değil.');
}
