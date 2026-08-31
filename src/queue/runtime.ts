import { Queue, Worker, type JobsOptions, type Processor } from 'bullmq';
import { Redis } from 'ioredis';

import type { AppConfig } from '../config/env.js';
import type { MessageEnvelope } from './contracts.js';

export const QUEUE_NAMES = {
  jobCommands: 'job.commands',
  taskExecute: 'task.execute',
  taskResults: 'task.results',
  domainEvents: 'domain.events',
  deadLetter: 'dead-letter'
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export class QueueRuntime {
  private readonly connection: Redis;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Set<Worker>();

  public constructor(
    private readonly config: Pick<AppConfig, 'redisUrl' | 'queuePrefix'>
  ) {
    this.connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true
    });
  }

  public getQueue(name: QueueName): Queue {
    const existing = this.queues.get(name);
    if (existing) {
      return existing;
    }

    const queue = new Queue(name, {
      connection: this.connection,
      prefix: this.config.queuePrefix,
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 1000
      }
    });
    this.queues.set(name, queue);
    return queue;
  }

  public async add<TPayload>(
    name: QueueName,
    envelope: MessageEnvelope<TPayload>,
    options?: JobsOptions
  ): Promise<string> {
    const queue = this.getQueue(name);
    const job = await queue.add(envelope.messageType, envelope, {
      jobId: envelope.messageId,
      ...options
    });
    return job.id ?? envelope.messageId;
  }

  public createWorker<TPayload, TResult>(
    name: QueueName,
    processor: Processor<MessageEnvelope<TPayload>, TResult>,
    concurrency = 1
  ): Worker<MessageEnvelope<TPayload>, TResult> {
    const worker = new Worker<MessageEnvelope<TPayload>, TResult>(name, processor, {
      connection: this.connection,
      prefix: this.config.queuePrefix,
      concurrency
    });
    this.workers.add(worker);
    return worker;
  }

  public async healthCheck(): Promise<void> {
    await this.connection.ping();
  }

  public async close(): Promise<void> {
    await Promise.all([...this.workers].map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    if (this.connection.status === 'wait') {
      this.connection.disconnect();
      return;
    }
    await this.connection.quit();
  }
}
