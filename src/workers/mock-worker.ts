import { createHash } from 'node:crypto';

import type { Job, Worker } from 'bullmq';

import { createMessageEnvelope, parseMessageEnvelope, type MessageEnvelope } from '../queue/contracts.js';
import { QUEUE_NAMES, type QueueRuntime } from '../queue/runtime.js';

export type TaskExecutePayload = {
  taskType: 'HTTP_FETCH' | 'BROWSER_FETCH' | 'CRAWL_DISCOVERY' | 'EXTRACT' | 'VALIDATE' | 'PUBLISH' | 'EXPORT';
  payload: Record<string, unknown>;
};

export type MockWorkerResult = {
  status: 'SUCCEEDED' | 'FAILED';
  resultRef?: Record<string, unknown>;
  errorCode?: string;
  retryable?: boolean;
};

export function executeMockTask(payload: TaskExecutePayload): MockWorkerResult {
  if (payload.payload.simulateFailure === true) {
    return {
      status: 'FAILED',
      errorCode: 'MOCK_TASK_FAILURE',
      retryable: true
    };
  }

  const body = JSON.stringify({ taskType: payload.taskType, payload: payload.payload });
  const checksum = createHash('sha256').update(body).digest('hex');

  return {
    status: 'SUCCEEDED',
    resultRef: {
      kind: 'mock-result',
      recordCount: 1,
      checksumSha256: checksum
    }
  };
}

export class MockWorker {
  private worker: Worker | null = null;

  public constructor(
    private readonly queue: QueueRuntime,
    private readonly serviceName = 'mock-worker',
    private readonly serviceVersion = '0.1.0'
  ) {}

  public start(concurrency = 2): void {
    this.worker = this.queue.createWorker<TaskExecutePayload, string>(
      QUEUE_NAMES.taskExecute,
      async (job) => this.process(job),
      concurrency
    );
  }

  public async process(job: Job<MessageEnvelope<TaskExecutePayload>>): Promise<string> {
    const message = parseMessageEnvelope(job.data) as MessageEnvelope<TaskExecutePayload>;
    if (message.messageType !== 'task.execute' || !message.taskId || !message.attemptId) {
      return message.messageId;
    }

    const result = executeMockTask(message.payload);
    const resultMessage = createMessageEnvelope({
      messageId: `result_${message.messageId}`,
      messageType: result.status === 'SUCCEEDED' ? 'task.succeeded' : 'task.failed',
      schemaVersion: 1,
      tenantId: message.tenantId,
      ...(message.projectId ? { projectId: message.projectId } : {}),
      ...(message.jobId ? { jobId: message.jobId } : {}),
      ...(message.runId ? { runId: message.runId } : {}),
      taskId: message.taskId,
      attemptId: message.attemptId,
      correlationId: message.correlationId,
      traceId: message.traceId,
      causationId: message.messageId,
      producer: {
        service: this.serviceName,
        version: this.serviceVersion
      },
      payload: result
    });

    await this.queue.add(QUEUE_NAMES.taskResults, resultMessage);
    return message.taskId;
  }

  public async close(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }
}
