import type { AccessResultClass } from './reliability.js';
import type { MetricsRegistry } from '../shared/metrics.js';

export type ReliabilityEventOutcome =
  | 'SUCCESS'
  | 'FAILURE'
  | 'RETRY_ALLOWED'
  | 'RETRY_BUDGET_EXHAUSTED'
  | 'STRATEGY_ESCALATION'
  | 'CIRCUIT_BLOCKED'
  | 'ESCALATION_BUDGET_EXHAUSTED';

export type ReliabilityEvent = {
  tenantId: string;
  jobId?: string;
  taskId?: string;
  attemptId?: string;
  targetId?: string;
  providerId?: string;
  strategy: 'HTTP' | 'BROWSER';
  accessClass: AccessResultClass;
  outcome: ReliabilityEventOutcome;
  code?: string;
  retryDelaySource?: 'EXPONENTIAL_BACKOFF' | 'RETRY_AFTER';
  escalationAction?: 'NO_ESCALATION' | 'ESCALATE_BROWSER' | 'ROTATE_PROXY' | 'TERMINAL_BLOCK' | 'BUDGET_EXHAUSTED';
  durationMs?: number;
};

export type ReliabilityMetricSnapshot = {
  counters: Record<string, number>;
  recentEvents: ReadonlyArray<SafeReliabilityEvent>;
};

type SafeReliabilityEvent = Omit<ReliabilityEvent, 'code' | 'durationMs'> & {
  code?: string;
  durationMs?: number;
  recordedAt: string;
};

const ALLOWED_CODES = new Set([
  'HTTP_SUCCESS',
  'HTTP_RATE_LIMITED',
  'HTTP_TIMEOUT',
  'HTTP_AUTH_REQUIRED',
  'HTTP_PROXY_AUTH_REQUIRED',
  'HTTP_ANTI_BOT_BARRIER',
  'HTTP_POLICY_BLOCKED',
  'HTTP_CLIENT_ERROR',
  'HTTP_SERVER_ERROR',
  'HTTP_DEPENDENCY_FAILURE',
  'RETRY_BUDGET_EXCEEDED',
  'ESCALATION_BUDGET_EXCEEDED',
  'CIRCUIT_OPEN',
  'CIRCUIT_HALF_OPEN_BUSY',
  'RESOURCE_QUARANTINED'
]);

/**
 * Secret-safe reference projection for backend logs/metrics. It does not
 * persist raw response data or accept arbitrary label names from callers.
 */
export class ReliabilityTelemetryCollector {
  private readonly events: SafeReliabilityEvent[] = [];

  public constructor(
    private readonly metrics: MetricsRegistry,
    private readonly maxRecentEvents = 100,
    private readonly now: () => Date = () => new Date()
  ) {
    if (!Number.isInteger(maxRecentEvents) || maxRecentEvents < 1) {
      throw new Error('maxRecentEvents must be a positive integer.');
    }
  }

  public record(event: ReliabilityEvent): void {
    validateEvent(event);
    const safe = this.safeEvent(event);
    this.events.push(safe);
    while (this.events.length > this.maxRecentEvents) this.events.shift();
    this.metrics.increment('reliability_events_total', `${event.strategy}:${event.outcome}:${event.accessClass}`);
    if (event.outcome === 'FAILURE' || event.outcome === 'CIRCUIT_BLOCKED') {
      this.metrics.increment('reliability_failures_total', `${event.strategy}:${event.accessClass}`);
    }
    if (event.outcome === 'RETRY_ALLOWED' || event.outcome === 'RETRY_BUDGET_EXHAUSTED') {
      this.metrics.increment('reliability_retries_total', `${event.strategy}:${event.outcome}`);
    }
    if (event.outcome === 'STRATEGY_ESCALATION' || event.outcome === 'ESCALATION_BUDGET_EXHAUSTED') {
      this.metrics.increment('reliability_escalations_total', `${event.strategy}:${event.escalationAction ?? 'UNKNOWN'}`);
    }
    if (event.outcome === 'CIRCUIT_BLOCKED') {
      this.metrics.increment('reliability_circuit_blocks_total', `${event.strategy}:${event.accessClass}`);
    }
  }

  public snapshot(): ReliabilityMetricSnapshot {
    return {
      counters: this.metrics.snapshot(),
      recentEvents: this.events.map((event) => ({
        ...event,
        ...(event.code ? { code: event.code } : {})
      }))
    };
  }

  private safeEvent(event: ReliabilityEvent): SafeReliabilityEvent {
    return {
      tenantId: event.tenantId,
      ...(event.jobId ? { jobId: event.jobId } : {}),
      ...(event.taskId ? { taskId: event.taskId } : {}),
      ...(event.attemptId ? { attemptId: event.attemptId } : {}),
      ...(event.targetId ? { targetId: event.targetId } : {}),
      ...(event.providerId ? { providerId: event.providerId } : {}),
      strategy: event.strategy,
      accessClass: event.accessClass,
      outcome: event.outcome,
      ...(event.code && ALLOWED_CODES.has(event.code) ? { code: event.code } : {}),
      ...(event.retryDelaySource ? { retryDelaySource: event.retryDelaySource } : {}),
      ...(event.escalationAction ? { escalationAction: event.escalationAction } : {}),
      ...(event.durationMs === undefined ? {} : { durationMs: Math.max(0, Math.round(event.durationMs)) }),
      recordedAt: this.now().toISOString()
    };
  }
}

function validateEvent(event: ReliabilityEvent): void {
  if (!event.tenantId || !event.strategy || !event.accessClass || !event.outcome
    || (event.durationMs !== undefined && (!Number.isFinite(event.durationMs) || event.durationMs < 0))) {
    throw new Error('Reliability event geçerli değil.');
  }
}
