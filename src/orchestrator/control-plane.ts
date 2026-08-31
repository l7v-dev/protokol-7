import { createHash } from 'node:crypto';

export type JobControlStatus = 'RUNNING' | 'PAUSE_DRAINING' | 'PAUSED' | 'CANCEL_DRAINING' | 'CANCELLED';

export type JobControlScope = {
  tenantId: string;
  jobId: string;
};

export type JobControlSnapshot = {
  scope: JobControlScope;
  status: JobControlStatus;
  activeDeliveryCount: number;
  dispatchAllowed: boolean;
  revision: number;
  updatedAt: string;
};

export type JobControlAuditEvent = {
  eventId: string;
  type: 'DISPATCH_ADMITTED' | 'DELIVERY_SETTLED' | 'PAUSE_REQUESTED' | 'PAUSED' | 'RESUMED' | 'CANCEL_REQUESTED' | 'CANCELLED';
  tenantId: string;
  jobId: string;
  status: JobControlStatus;
  activeDeliveryCount: number;
  occurredAt: string;
};

export class JobControlError extends Error {
  public constructor(public readonly code: 'JOB_CONTROL_INVALID' | 'JOB_CONTROL_NOT_FOUND' | 'JOB_CONTROL_CONFLICT', message: string) {
    super(message);
    this.name = 'JobControlError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Process-local control plane reference. It gates future dispatch and models
 * a graceful drain but does not cancel workers, publish messages or persist state.
 */
export class JobControlRegistry {
  private readonly controls = new Map<string, JobControlSnapshot>();
  private readonly audit = new Map<string, JobControlAuditEvent[]>();
  private sequence = 0;

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public initialize(scope: JobControlScope): JobControlSnapshot {
    validateScope(scope);
    const key = scopeKey(scope);
    const existing = this.controls.get(key);
    if (existing) return clone(existing);
    const initial: JobControlSnapshot = { scope: { ...scope }, status: 'RUNNING', activeDeliveryCount: 0, dispatchAllowed: true, revision: 1, updatedAt: this.now().toISOString() };
    this.controls.set(key, initial);
    return clone(initial);
  }

  public admitDispatch(scope: JobControlScope): JobControlSnapshot {
    const current = this.require(scope);
    if (!current.dispatchAllowed) throw new JobControlError('JOB_CONTROL_CONFLICT', 'Job kontrol durumu yeni dispatch kabul etmiyor.');
    return this.replace({ ...current, activeDeliveryCount: current.activeDeliveryCount + 1 }, 'DISPATCH_ADMITTED');
  }

  public settleDelivery(scope: JobControlScope): JobControlSnapshot {
    const current = this.require(scope);
    if (current.activeDeliveryCount === 0) throw new JobControlError('JOB_CONTROL_CONFLICT', 'Aktif delivery olmadan settle yapılamaz.');
    const activeDeliveryCount = current.activeDeliveryCount - 1;
    if (activeDeliveryCount === 0 && current.status === 'PAUSE_DRAINING') {
      return this.replace({ ...current, status: 'PAUSED', activeDeliveryCount, dispatchAllowed: false }, 'PAUSED');
    }
    if (activeDeliveryCount === 0 && current.status === 'CANCEL_DRAINING') {
      return this.replace({ ...current, status: 'CANCELLED', activeDeliveryCount, dispatchAllowed: false }, 'CANCELLED');
    }
    return this.replace({ ...current, activeDeliveryCount }, 'DELIVERY_SETTLED');
  }

  public requestPause(scope: JobControlScope): JobControlSnapshot {
    const current = this.require(scope);
    if (current.status !== 'RUNNING') throw new JobControlError('JOB_CONTROL_CONFLICT', 'Yalnız running job pause edilebilir.');
    if (current.activeDeliveryCount === 0) return this.replace({ ...current, status: 'PAUSED', dispatchAllowed: false }, 'PAUSED');
    return this.replace({ ...current, status: 'PAUSE_DRAINING', dispatchAllowed: false }, 'PAUSE_REQUESTED');
  }

  public resume(scope: JobControlScope): JobControlSnapshot {
    const current = this.require(scope);
    if (current.status !== 'PAUSED' || current.activeDeliveryCount !== 0) throw new JobControlError('JOB_CONTROL_CONFLICT', 'Yalnız fully paused job resume edilebilir.');
    return this.replace({ ...current, status: 'RUNNING', dispatchAllowed: true }, 'RESUMED');
  }

  public requestCancel(scope: JobControlScope): JobControlSnapshot {
    const current = this.require(scope);
    if (current.status === 'CANCELLED' || current.status === 'CANCEL_DRAINING') throw new JobControlError('JOB_CONTROL_CONFLICT', 'Job cancel zaten istenmiş veya tamamlanmış.');
    if (current.status === 'PAUSED') return this.replace({ ...current, status: 'CANCELLED', dispatchAllowed: false }, 'CANCELLED');
    if (current.status === 'PAUSE_DRAINING') return this.replace({ ...current, status: 'CANCEL_DRAINING', dispatchAllowed: false }, 'CANCEL_REQUESTED');
    if (current.activeDeliveryCount === 0) return this.replace({ ...current, status: 'CANCELLED', dispatchAllowed: false }, 'CANCELLED');
    return this.replace({ ...current, status: 'CANCEL_DRAINING', dispatchAllowed: false }, 'CANCEL_REQUESTED');
  }

  public get(scope: JobControlScope): JobControlSnapshot {
    return clone(this.require(scope));
  }

  public auditEvents(scope: JobControlScope): ReadonlyArray<JobControlAuditEvent> {
    validateScope(scope);
    return (this.audit.get(scopeKey(scope)) ?? []).map((event) => ({ ...event }));
  }

  private require(scope: JobControlScope): JobControlSnapshot {
    validateScope(scope);
    const control = this.controls.get(scopeKey(scope));
    if (!control) throw new JobControlError('JOB_CONTROL_NOT_FOUND', 'Job control scope bulunamadı.');
    return control;
  }

  private replace(next: JobControlSnapshot, eventType: JobControlAuditEvent['type']): JobControlSnapshot {
    const updated: JobControlSnapshot = { ...next, scope: { ...next.scope }, revision: next.revision + 1, updatedAt: this.now().toISOString() };
    const key = scopeKey(updated.scope);
    this.controls.set(key, updated);
    this.sequence += 1;
    const event: JobControlAuditEvent = {
      eventId: `job_control_${createHash('sha256').update(`${key}:${this.sequence}`).digest('hex').slice(0, 24)}`,
      type: eventType,
      tenantId: updated.scope.tenantId,
      jobId: updated.scope.jobId,
      status: updated.status,
      activeDeliveryCount: updated.activeDeliveryCount,
      occurredAt: updated.updatedAt
    };
    this.audit.set(key, [...(this.audit.get(key) ?? []), event]);
    return clone(updated);
  }
}

function validateScope(scope: JobControlScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.jobId)) {
    throw new JobControlError('JOB_CONTROL_INVALID', 'Job control scope geçerli değil.');
  }
}

function scopeKey(scope: JobControlScope): string {
  return `${scope.tenantId}:${scope.jobId}`;
}

function clone(snapshot: JobControlSnapshot): JobControlSnapshot {
  return { ...snapshot, scope: { ...snapshot.scope } };
}
