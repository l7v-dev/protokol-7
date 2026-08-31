import { createHash } from 'node:crypto';

import { ApiError } from '../shared/http.js';
import {
  canTransitionJob,
  canTransitionTask,
  type OrchestratorJobStatus,
  type OrchestratorTaskStatus
} from './lifecycle.js';

export type OrchestrationScope = {
  tenantId: string;
  jobId: string;
};

export type OrchestrationAuditEvent = {
  eventId: string;
  occurredAt: string;
  tenantId: string;
  jobId: string;
  entityType: 'JOB' | 'TASK';
  taskId?: string;
  fromStatus: string;
  toStatus: string;
  outcome: 'TRANSITIONED' | 'REJECTED';
  code: 'STATE_TRANSITIONED' | 'INVALID_STATE_TRANSITION';
};

export class OrchestrationStateRegistry {
  private readonly jobs = new Map<string, OrchestratorJobStatus>();
  private readonly tasks = new Map<string, OrchestratorTaskStatus>();
  private readonly events = new Map<string, OrchestrationAuditEvent[]>();
  private sequence = 0;

  public constructor(private readonly now: () => Date = () => new Date()) {}

  public initializeJob(scope: OrchestrationScope, status: OrchestratorJobStatus = 'CREATED'): OrchestratorJobStatus {
    validateScope(scope);
    const key = jobKey(scope);
    const existing = this.jobs.get(key);
    if (existing && existing !== status) throw conflict('JOB_ALREADY_INITIALIZED');
    this.jobs.set(key, existing ?? status);
    return existing ?? status;
  }

  public initializeTask(scope: OrchestrationScope, taskId: string, status: OrchestratorTaskStatus = 'PENDING'): OrchestratorTaskStatus {
    validateScope(scope);
    validateId(taskId);
    const key = taskKey(scope, taskId);
    const existing = this.tasks.get(key);
    if (existing && existing !== status) throw conflict('TASK_ALREADY_INITIALIZED');
    this.tasks.set(key, existing ?? status);
    return existing ?? status;
  }

  public transitionJob(scope: OrchestrationScope, toStatus: OrchestratorJobStatus): OrchestratorJobStatus {
    validateScope(scope);
    const key = jobKey(scope);
    const fromStatus = this.jobs.get(key);
    if (!fromStatus) throw notFound('JOB_NOT_INITIALIZED');
    if (!canTransitionJob(fromStatus, toStatus)) {
      this.record(scope, 'JOB', fromStatus, toStatus, 'REJECTED', 'INVALID_STATE_TRANSITION');
      throw transitionError();
    }
    this.jobs.set(key, toStatus);
    this.record(scope, 'JOB', fromStatus, toStatus, 'TRANSITIONED', 'STATE_TRANSITIONED');
    return toStatus;
  }

  public transitionTask(scope: OrchestrationScope, taskId: string, toStatus: OrchestratorTaskStatus): OrchestratorTaskStatus {
    validateScope(scope);
    validateId(taskId);
    const key = taskKey(scope, taskId);
    const fromStatus = this.tasks.get(key);
    if (!fromStatus) throw notFound('TASK_NOT_INITIALIZED');
    if (!canTransitionTask(fromStatus, toStatus)) {
      this.record(scope, 'TASK', fromStatus, toStatus, 'REJECTED', 'INVALID_STATE_TRANSITION', taskId);
      throw transitionError();
    }
    this.tasks.set(key, toStatus);
    this.record(scope, 'TASK', fromStatus, toStatus, 'TRANSITIONED', 'STATE_TRANSITIONED', taskId);
    return toStatus;
  }

  public jobStatus(scope: OrchestrationScope): OrchestratorJobStatus {
    validateScope(scope);
    const status = this.jobs.get(jobKey(scope));
    if (!status) throw notFound('JOB_NOT_INITIALIZED');
    return status;
  }

  public taskStatus(scope: OrchestrationScope, taskId: string): OrchestratorTaskStatus {
    validateScope(scope);
    validateId(taskId);
    const status = this.tasks.get(taskKey(scope, taskId));
    if (!status) throw notFound('TASK_NOT_INITIALIZED');
    return status;
  }

  public auditEvents(scope: OrchestrationScope): ReadonlyArray<OrchestrationAuditEvent> {
    validateScope(scope);
    return (this.events.get(jobKey(scope)) ?? []).map((event) => ({ ...event }));
  }

  private record(
    scope: OrchestrationScope,
    entityType: OrchestrationAuditEvent['entityType'],
    fromStatus: string,
    toStatus: string,
    outcome: OrchestrationAuditEvent['outcome'],
    code: OrchestrationAuditEvent['code'],
    taskId?: string
  ): void {
    this.sequence += 1;
    const event: OrchestrationAuditEvent = {
      eventId: `audit_${createHash('sha256').update(`${scope.tenantId}:${scope.jobId}:${this.sequence}`).digest('hex').slice(0, 24)}`,
      occurredAt: this.now().toISOString(),
      tenantId: scope.tenantId,
      jobId: scope.jobId,
      entityType,
      ...(taskId === undefined ? {} : { taskId }),
      fromStatus,
      toStatus,
      outcome,
      code
    };
    const key = jobKey(scope);
    this.events.set(key, [...(this.events.get(key) ?? []), event]);
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function validateScope(scope: OrchestrationScope): void {
  validateId(scope.tenantId);
  validateId(scope.jobId);
}

function validateId(value: string): void {
  if (!SAFE_ID.test(value)) throw new ApiError({ statusCode: 400, code: 'ORCHESTRATION_SCOPE_INVALID', category: 'VALIDATION', message: 'Orchestration scope geçerli değil.', retryable: false });
}

function jobKey(scope: OrchestrationScope): string {
  return `${scope.tenantId}:${scope.jobId}`;
}

function taskKey(scope: OrchestrationScope, taskId: string): string {
  return `${jobKey(scope)}:${taskId}`;
}

function transitionError(): ApiError {
  return new ApiError({ statusCode: 409, code: 'INVALID_STATE_TRANSITION', category: 'EXECUTION', message: 'Orchestration state transition geçerli değil.', retryable: false });
}

function conflict(code: 'JOB_ALREADY_INITIALIZED' | 'TASK_ALREADY_INITIALIZED'): ApiError {
  return new ApiError({ statusCode: 409, code, category: 'EXECUTION', message: 'Orchestration state yeniden başlatılamaz.', retryable: false });
}

function notFound(code: 'JOB_NOT_INITIALIZED' | 'TASK_NOT_INITIALIZED'): ApiError {
  return new ApiError({ statusCode: 404, code, category: 'EXECUTION', message: 'Orchestration state bulunamadı.', retryable: false });
}
