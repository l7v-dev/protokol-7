import type { Job, Worker } from 'bullmq';

import type { TaskRepository } from '../database/repositories/task-repository.js';
import { BrowserFallbackPolicy } from '../browser/fallback.js';
import { parseMessageEnvelope, type MessageEnvelope } from '../queue/contracts.js';
import { QUEUE_NAMES, type QueueRuntime } from '../queue/runtime.js';

export type JobCreatePayload = {
  jobId: string;
  projectId: string;
  targetId: string;
  schemaId: string;
  triggerType: 'MANUAL' | 'SCHEDULED' | 'API' | 'RETRY';
  input: Record<string, unknown>;
};

export type TaskResultPayload = {
  resultRef?: Record<string, unknown>;
  errorCode?: string;
  retryable?: boolean;
};

export type OrchestratorOptions = {
  serviceName: string;
  serviceVersion: string;
  concurrency?: number;
};

export class Orchestrator {
  private readonly workers = new Set<Worker>();
  private readonly fallbackPolicy = new BrowserFallbackPolicy();

  public constructor(
    private readonly tasks: TaskRepository,
    private readonly queue: QueueRuntime,
    private readonly options: OrchestratorOptions
  ) {}

  public start(): void {
    const commandWorker = this.queue.createWorker<JobCreatePayload, string>(
      QUEUE_NAMES.jobCommands,
      async (job) => this.handleJobCommand(job),
      this.options.concurrency ?? 2
    );
    const resultWorker = this.queue.createWorker<TaskResultPayload, string>(
      QUEUE_NAMES.taskResults,
      async (job) => this.handleTaskResult(job),
      this.options.concurrency ?? 2
    );

    this.workers.add(commandWorker);
    this.workers.add(resultWorker);
  }

  public async handleJobCommand(job: Job<MessageEnvelope<JobCreatePayload>>): Promise<string> {
    const message = parseMessageEnvelope(job.data) as MessageEnvelope<JobCreatePayload>;

    if (message.messageType !== 'job.create') {
      return message.messageId;
    }

    const payload = message.payload;
    const taskId = `task_${payload.jobId}_initial`;
    const attemptId = `attempt_${payload.jobId}_initial_1`;
    const runId = `run_${payload.jobId}`;
    const strategy = this.fallbackPolicy.chooseInitial({
      requestedStrategy: payload.input.strategy,
      allowBrowser: payload.input.allowBrowser === true
    });
    const taskType = strategy.strategy === 'BROWSER' ? 'BROWSER_FETCH' : 'HTTP_FETCH';

    await this.tasks.planInitialTask({
      taskId,
      attemptId,
      tenantId: message.tenantId,
      jobId: payload.jobId,
      runId,
      taskType,
      payload: {
        projectId: payload.projectId,
        targetId: payload.targetId,
        schemaId: payload.schemaId,
        strategy: strategy.strategy,
        strategyReason: strategy.reason,
        input: payload.input
      },
      correlationId: message.correlationId
    });

    return taskId;
  }

  public async handleTaskResult(job: Job<MessageEnvelope<TaskResultPayload>>): Promise<string> {
    const message = parseMessageEnvelope(job.data) as MessageEnvelope<TaskResultPayload>;

    if (!message.taskId || !message.attemptId) {
      throw new Error('Task result message requires taskId and attemptId.');
    }

    if (message.messageType === 'task.succeeded') {
      await this.tasks.markSucceeded(
        message.tenantId,
        message.taskId,
        message.attemptId,
        message.payload.resultRef ?? {}
      );
      return message.taskId;
    }

    if (message.messageType === 'task.failed') {
      await this.tasks.markFailed(
        message.tenantId,
        message.taskId,
        message.attemptId,
        message.payload.errorCode ?? 'TASK_FAILED',
        message.payload.retryable ?? false
      );
      return message.taskId;
    }

    return message.messageId;
  }

  public async close(): Promise<void> {
    await Promise.all([...this.workers].map((worker) => worker.close()));
    this.workers.clear();
  }

  public get serviceIdentity(): { service: string; version: string } {
    return {
      service: this.options.serviceName,
      version: this.options.serviceVersion
    };
  }
}
