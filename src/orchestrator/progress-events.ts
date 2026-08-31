import { createHash } from 'node:crypto';

import { assertSafeOutboundUrl } from '../security/egress-policy.js';

export type ProgressScope = {
  tenantId: string;
  jobId: string;
};

export type ProgressEventType = 'JOB_STATE_CHANGED' | 'TASK_STATE_CHANGED' | 'TASK_PROGRESS' | 'DELIVERY_SETTLED' | 'CONTROL_CHANGED';

export type JobProgressEvent = {
  eventId: string;
  sequence: number;
  occurredAt: string;
  tenantId: string;
  jobId: string;
  type: ProgressEventType;
  status?: string;
  completedTaskCount?: number;
  totalTaskCount?: number;
};

export type JobProgressSnapshot = {
  scope: ProgressScope;
  lastSequence: number;
  currentStatus?: string;
  completedTaskCount: number;
  totalTaskCount: number;
  recentEvents: ReadonlyArray<JobProgressEvent>;
};

export type WebhookDeliveryIntent = {
  deliveryId: string;
  eventId: string;
  destinationFingerprintSha256: string;
  eventType: ProgressEventType;
  payloadChecksumSha256: string;
  retryable: false;
  allowBypass: false;
};

export class ProgressEventError extends Error {
  public constructor(public readonly code: 'PROGRESS_EVENT_INVALID' | 'PROGRESS_EVENT_SCOPE_NOT_FOUND' | 'WEBHOOK_DESTINATION_REJECTED', message: string) {
    super(message);
    this.name = 'ProgressEventError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_EVENTS_PER_JOB = 1_000;
const MAX_TOTAL_TASKS = 100_000;

/**
 * Process-local event reference for reconnect snapshots. It does not open a
 * WebSocket, dispatch webhooks, persist events, or accept raw payload values.
 */
export class JobProgressEventRegistry {
  private readonly eventsByScope = new Map<string, JobProgressEvent[]>();
  private readonly snapshotsByScope = new Map<string, Omit<JobProgressSnapshot, 'recentEvents'>>();

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public emit(scope: ProgressScope, event: Omit<JobProgressEvent, 'eventId' | 'sequence' | 'occurredAt' | 'tenantId' | 'jobId'>): JobProgressEvent {
    validateScope(scope);
    validateEvent(event);
    const key = scopeKey(scope);
    const currentEvents = this.eventsByScope.get(key) ?? [];
    const previous = this.snapshotsByScope.get(key) ?? { scope: { ...scope }, lastSequence: 0, completedTaskCount: 0, totalTaskCount: 0 };
    const totalTaskCount = event.totalTaskCount ?? previous.totalTaskCount;
    const completedTaskCount = event.completedTaskCount ?? previous.completedTaskCount;
    validateCounts(completedTaskCount, totalTaskCount);
    const sequence = previous.lastSequence + 1;
    const stored: JobProgressEvent = {
      eventId: `progress_${createHash('sha256').update(`${key}:${sequence}`).digest('hex').slice(0, 24)}`,
      sequence,
      occurredAt: this.now().toISOString(),
      tenantId: scope.tenantId,
      jobId: scope.jobId,
      type: event.type,
      ...(event.status === undefined ? {} : { status: event.status }),
      ...(event.completedTaskCount === undefined ? {} : { completedTaskCount }),
      ...(event.totalTaskCount === undefined ? {} : { totalTaskCount })
    };
    const nextEvents = [...currentEvents, stored].slice(-MAX_EVENTS_PER_JOB);
    const snapshot: Omit<JobProgressSnapshot, 'recentEvents'> = {
      scope: { ...scope },
      lastSequence: sequence,
      ...(event.status === undefined ? previous.currentStatus === undefined ? {} : { currentStatus: previous.currentStatus } : { currentStatus: event.status }),
      completedTaskCount,
      totalTaskCount
    };
    this.eventsByScope.set(key, nextEvents);
    this.snapshotsByScope.set(key, snapshot);
    return { ...stored };
  }

  public snapshot(scope: ProgressScope, afterSequence = 0): JobProgressSnapshot {
    validateScope(scope);
    if (!Number.isInteger(afterSequence) || afterSequence < 0) throw new ProgressEventError('PROGRESS_EVENT_INVALID', 'Progress sequence geçerli değil.');
    const key = scopeKey(scope);
    const snapshot = this.snapshotsByScope.get(key);
    if (!snapshot) throw new ProgressEventError('PROGRESS_EVENT_SCOPE_NOT_FOUND', 'Job progress scope bulunamadı.');
    return {
      ...snapshot,
      scope: { ...snapshot.scope },
      recentEvents: (this.eventsByScope.get(key) ?? []).filter((event) => event.sequence > afterSequence).map((event) => ({ ...event }))
    };
  }
}

/**
 * Creates a safe delivery intent only. The caller owns event transport and
 * must not interpret this as an HTTP request, retry instruction or bypass permission.
 */
export function createWebhookDeliveryIntent(destinationUrl: string, event: JobProgressEvent): WebhookDeliveryIntent {
  validateStoredEvent(event);
  try {
    const safeDestination = assertSafeOutboundUrl(destinationUrl);
    return {
      deliveryId: `webhook_${createHash('sha256').update(`${safeDestination.url}:${event.eventId}`).digest('hex').slice(0, 24)}`,
      eventId: event.eventId,
      destinationFingerprintSha256: sha256(`${safeDestination.protocol}//${safeDestination.hostname}:${safeDestination.port}`),
      eventType: event.type,
      payloadChecksumSha256: sha256(JSON.stringify(safeEventPayload(event))),
      retryable: false,
      allowBypass: false
    };
  } catch {
    throw new ProgressEventError('WEBHOOK_DESTINATION_REJECTED', 'Webhook destination policy tarafından reddedildi.');
  }
}

function validateScope(scope: ProgressScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.jobId)) throw new ProgressEventError('PROGRESS_EVENT_INVALID', 'Progress scope geçerli değil.');
}

function validateEvent(event: Omit<JobProgressEvent, 'eventId' | 'sequence' | 'occurredAt' | 'tenantId' | 'jobId'>): void {
  if (!['JOB_STATE_CHANGED', 'TASK_STATE_CHANGED', 'TASK_PROGRESS', 'DELIVERY_SETTLED', 'CONTROL_CHANGED'].includes(event.type)
    || event.status !== undefined && (!SAFE_ID.test(event.status) || event.status.length > 128)) {
    throw new ProgressEventError('PROGRESS_EVENT_INVALID', 'Progress event geçerli değil.');
  }
  validateCounts(event.completedTaskCount ?? 0, event.totalTaskCount ?? 0, true);
}

function validateCounts(completed: number, total: number, partial = false): void {
  if (!Number.isInteger(completed) || !Number.isInteger(total) || completed < 0 || total < 0 || total > MAX_TOTAL_TASKS || !partial && completed > total) {
    throw new ProgressEventError('PROGRESS_EVENT_INVALID', 'Progress count geçerli değil.');
  }
}

function validateStoredEvent(event: JobProgressEvent): void {
  validateScope(event);
  if (!SAFE_ID.test(event.eventId) || !Number.isInteger(event.sequence) || event.sequence < 1 || !['JOB_STATE_CHANGED', 'TASK_STATE_CHANGED', 'TASK_PROGRESS', 'DELIVERY_SETTLED', 'CONTROL_CHANGED'].includes(event.type)) {
    throw new ProgressEventError('PROGRESS_EVENT_INVALID', 'Webhook progress event geçerli değil.');
  }
}

function safeEventPayload(event: JobProgressEvent): Pick<JobProgressEvent, 'eventId' | 'sequence' | 'occurredAt' | 'tenantId' | 'jobId' | 'type' | 'status' | 'completedTaskCount' | 'totalTaskCount'> {
  return { ...event };
}

function scopeKey(scope: ProgressScope): string {
  return `${scope.tenantId}:${scope.jobId}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
