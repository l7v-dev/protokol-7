import { createHash } from 'node:crypto';

export const USAGE_EVENT_CONTRACT_VERSION = 'usage-event/v1' as const;

export type CostCategory = 'HTTP_REQUEST' | 'BROWSER_MINUTE' | 'PROXY_REQUEST' | 'PROXY_GB' | 'AI_INPUT_TOKEN' | 'AI_OUTPUT_TOKEN' | 'STORAGE_GB_MONTH' | 'COMPUTE_SECOND' | 'RETRY_ATTEMPT';
export type UsageUnit = 'request' | 'minute' | 'GB' | 'token' | 'GB-month' | 'second' | 'attempt';

export type UsageEventScope = { tenantId: string; projectId: string; jobId: string; taskId: string; attemptId: string };

export type UsageEventInput = {
  scope: UsageEventScope;
  usageId: string;
  idempotencyKey: string;
  category: CostCategory;
  unit: UsageUnit;
  quantity: number;
  occurredAt: string;
};

export type UsageEvent = UsageEventInput & {
  contractVersion: typeof USAGE_EVENT_CONTRACT_VERSION;
  usageFingerprintSha256: string;
};

export class UsageEventError extends Error {
  public constructor(public readonly code: 'USAGE_EVENT_INVALID' | 'USAGE_EVENT_CONFLICT', message: string) {
    super(message);
    this.name = 'UsageEventError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_QUANTITY = 10_000_000;
const UNITS: Readonly<Record<CostCategory, UsageUnit>> = {
  HTTP_REQUEST: 'request',
  BROWSER_MINUTE: 'minute',
  PROXY_REQUEST: 'request',
  PROXY_GB: 'GB',
  AI_INPUT_TOKEN: 'token',
  AI_OUTPUT_TOKEN: 'token',
  STORAGE_GB_MONTH: 'GB-month',
  COMPUTE_SECOND: 'second',
  RETRY_ATTEMPT: 'attempt'
};

/**
 * Process-local immutable usage-event ledger. It accepts no price, currency,
 * tariff, provider detail, metadata, URL, payload, record, credential or raw
 * model/error content; downstream pricing and persistence remain separate work.
 */
export class UsageEventRegistry {
  private readonly events = new Map<string, UsageEvent>();

  public record(input: UsageEventInput): UsageEvent {
    validate(input);
    const key = eventKey(input.scope, input.idempotencyKey, input.category);
    const candidate = createEvent(input);
    const existing = this.events.get(key);
    if (existing !== undefined) {
      if (existing.usageFingerprintSha256 === candidate.usageFingerprintSha256) return clone(existing);
      throw new UsageEventError('USAGE_EVENT_CONFLICT', 'Usage event idempotency anahtarı farklı içerikle tekrar kullanılamaz.');
    }
    this.events.set(key, candidate);
    return clone(candidate);
  }

  public get(scope: UsageEventScope, usageId: string): UsageEvent | null {
    validateScope(scope);
    if (!SAFE_ID.test(usageId)) throw invalid();
    const event = [...this.events.values()].find((candidate) => candidate.usageId === usageId && sameScope(candidate.scope, scope));
    return event === undefined ? null : clone(event);
  }
}

export function unitForCostCategory(category: CostCategory): UsageUnit {
  if (!Object.hasOwn(UNITS, category)) throw invalid();
  return UNITS[category];
}

function createEvent(input: UsageEventInput): UsageEvent {
  const normalized: UsageEventInput = { scope: { ...input.scope }, usageId: input.usageId, idempotencyKey: input.idempotencyKey, category: input.category, unit: input.unit, quantity: input.quantity, occurredAt: input.occurredAt };
  return {
    contractVersion: USAGE_EVENT_CONTRACT_VERSION,
    ...normalized,
    usageFingerprintSha256: createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  };
}

function validate(input: UsageEventInput): void {
  validateScope(input.scope);
  if (!SAFE_ID.test(input.usageId) || !SAFE_ID.test(input.idempotencyKey)
    || !Object.hasOwn(UNITS, input.category) || input.unit !== UNITS[input.category]
    || !Number.isFinite(input.quantity) || input.quantity < 0 || input.quantity > MAX_QUANTITY
    || !Number.isFinite(Date.parse(input.occurredAt))) throw invalid();
}

function validateScope(scope: UsageEventScope): void {
  if (!Object.values(scope).every((value) => SAFE_ID.test(value))) throw invalid();
}

function eventKey(scope: UsageEventScope, idempotencyKey: string, category: CostCategory): string {
  return `${scope.tenantId}:${scope.projectId}:${scope.jobId}:${scope.taskId}:${scope.attemptId}:${idempotencyKey}:${category}`;
}

function sameScope(left: UsageEventScope, right: UsageEventScope): boolean {
  return left.tenantId === right.tenantId && left.projectId === right.projectId && left.jobId === right.jobId && left.taskId === right.taskId && left.attemptId === right.attemptId;
}

function clone(event: UsageEvent): UsageEvent {
  return { ...event, scope: { ...event.scope } };
}

function invalid(): UsageEventError {
  return new UsageEventError('USAGE_EVENT_INVALID', 'Usage event input geçerli değil.');
}
