import type { OutboxRecord, OutboxRepository } from '../database/repositories/outbox-repository.js';
import { createMessageEnvelope, isMessageType, type MessageEnvelope, type MessageType } from './contracts.js';
import { QUEUE_NAMES, type QueueName, type QueueRuntime } from './runtime.js';

export type OutboxPublisherOptions = {
  serviceName: string;
  serviceVersion: string;
  retryDelayMs?: number;
};

export type PublishBatchResult = {
  scanned: number;
  published: number;
  failed: number;
};

function queueForMessage(messageType: MessageType): QueueName {
  if (messageType === 'task.execute') {
    return QUEUE_NAMES.taskExecute;
  }

  if (messageType === 'task.succeeded' || messageType === 'task.failed') {
    return QUEUE_NAMES.taskResults;
  }

  if (messageType === 'domain.event') {
    return QUEUE_NAMES.domainEvents;
  }

  return QUEUE_NAMES.jobCommands;
}

function buildEnvelope(
  record: OutboxRecord,
  options: OutboxPublisherOptions
): MessageEnvelope<unknown> {
  if (!isMessageType(record.messageType)) {
    throw new Error(`Unsupported outbox message type: ${record.messageType}`);
  }

  return createMessageEnvelope({
    messageId: record.id,
    messageType: record.messageType,
    schemaVersion: record.schemaVersion,
    tenantId: record.tenantId,
    correlationId: record.correlationId,
    traceId: record.correlationId,
    ...(record.causationId ? { causationId: record.causationId } : {}),
    producer: {
      service: options.serviceName,
      version: options.serviceVersion
    },
    payload: record.payload
  });
}

export class OutboxPublisher {
  public constructor(
    private readonly repository: OutboxRepository,
    private readonly queue: QueueRuntime,
    private readonly options: OutboxPublisherOptions
  ) {}

  public async publishBatch(limit = 50): Promise<PublishBatchResult> {
    const ids = await this.repository.listPendingIds(limit);
    let published = 0;
    let failed = 0;

    for (const id of ids) {
      const record = await this.repository.claim(id);
      if (!record) {
        continue;
      }

      try {
        const envelope = buildEnvelope(record, this.options);
        await this.queue.add(queueForMessage(envelope.messageType), envelope);
        await this.repository.markPublished(record.id);
        published += 1;
      } catch (error) {
        failed += 1;
        const errorCode = error instanceof Error ? 'OUTBOX_PUBLISH_FAILED' : 'OUTBOX_PUBLISH_UNKNOWN_ERROR';
        const retryDelayMs = this.options.retryDelayMs ?? 5_000;
        await this.repository.markFailed(
          record.id,
          errorCode,
          new Date(Date.now() + retryDelayMs)
        );
      }
    }

    return {
      scanned: ids.length,
      published,
      failed
    };
  }

  public async reconcile(staleAfterMs = 300_000): Promise<number> {
    const staleBefore = new Date(Date.now() - staleAfterMs);
    return this.repository.requeueStalePublishing(staleBefore);
  }
}
