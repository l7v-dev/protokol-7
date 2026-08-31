import { ApiError } from '../shared/http.js';

export type OrchestratorJobStatus =
  | 'CREATED'
  | 'DISPATCH_PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'EXTRACTING'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'RETRYING'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';

export type OrchestratorTaskStatus =
  | 'PENDING'
  | 'BLOCKED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'RETRYABLE_FAILED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';

const jobTransitions: Record<OrchestratorJobStatus, OrchestratorJobStatus[]> = {
  CREATED: ['DISPATCH_PENDING', 'CANCEL_REQUESTED'],
  DISPATCH_PENDING: ['QUEUED', 'FAILED', 'CANCEL_REQUESTED'],
  QUEUED: ['RUNNING', 'FAILED', 'CANCEL_REQUESTED'],
  RUNNING: ['EXTRACTING', 'VALIDATING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'RETRYING', 'CANCEL_REQUESTED'],
  EXTRACTING: ['VALIDATING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'RETRYING', 'CANCEL_REQUESTED'],
  VALIDATING: ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'RETRYING', 'CANCEL_REQUESTED'],
  COMPLETED: [],
  COMPLETED_WITH_ERRORS: ['RETRYING'],
  FAILED: ['RETRYING'],
  RETRYING: ['QUEUED', 'RUNNING', 'FAILED', 'CANCEL_REQUESTED'],
  CANCEL_REQUESTED: ['CANCELLED', 'FAILED'],
  CANCELLED: []
};

const taskTransitions: Record<OrchestratorTaskStatus, OrchestratorTaskStatus[]> = {
  PENDING: ['BLOCKED', 'CLAIMED', 'CANCEL_REQUESTED'],
  BLOCKED: ['PENDING', 'CANCEL_REQUESTED'],
  CLAIMED: ['RUNNING', 'PENDING', 'CANCEL_REQUESTED'],
  RUNNING: ['SUCCEEDED', 'RETRYABLE_FAILED', 'FAILED', 'TIMEOUT', 'CANCEL_REQUESTED'],
  SUCCEEDED: [],
  RETRYABLE_FAILED: ['PENDING', 'FAILED', 'CANCEL_REQUESTED'],
  FAILED: [],
  TIMEOUT: ['PENDING', 'FAILED', 'CANCEL_REQUESTED'],
  CANCEL_REQUESTED: ['CANCELLED', 'FAILED'],
  CANCELLED: []
};

export function canTransitionJob(from: OrchestratorJobStatus, to: OrchestratorJobStatus): boolean {
  return jobTransitions[from].includes(to);
}

export function canTransitionTask(from: OrchestratorTaskStatus, to: OrchestratorTaskStatus): boolean {
  return taskTransitions[from].includes(to);
}

export function assertJobTransition(from: OrchestratorJobStatus, to: OrchestratorJobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new ApiError({
      statusCode: 409,
      code: 'INVALID_STATE_TRANSITION',
      category: 'EXECUTION',
      message: `Job ${from} durumundan ${to} durumuna geçirilemez.`,
      retryable: false
    });
  }
}

export function assertTaskTransition(from: OrchestratorTaskStatus, to: OrchestratorTaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new ApiError({
      statusCode: 409,
      code: 'INVALID_STATE_TRANSITION',
      category: 'EXECUTION',
      message: `Task ${from} durumundan ${to} durumuna geçirilemez.`,
      retryable: false
    });
  }
}
