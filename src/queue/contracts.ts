import { z } from 'zod';

export type MessageType =
  | 'job.create'
  | 'job.cancel'
  | 'job.retry'
  | 'task.execute'
  | 'task.succeeded'
  | 'task.failed'
  | 'domain.event';

export type ProducerIdentity = {
  service: string;
  version: string;
};

export type MessageEnvelope<TPayload> = {
  messageId: string;
  messageType: MessageType;
  schemaVersion: number;
  tenantId: string;
  projectId?: string;
  jobId?: string;
  runId?: string;
  taskId?: string;
  attemptId?: string;
  correlationId: string;
  traceId: string;
  causationId?: string;
  producer: ProducerIdentity;
  issuedAt: string;
  deadlineAt?: string;
  payload: TPayload;
};

const messageTypeSchema = z.enum([
  'job.create',
  'job.cancel',
  'job.retry',
  'task.execute',
  'task.succeeded',
  'task.failed',
  'domain.event'
]);

export function isMessageType(value: string): value is MessageType {
  return messageTypeSchema.safeParse(value).success;
}

const messageEnvelopeSchema = z.object({
  messageId: z.string().min(1),
  messageType: messageTypeSchema,
  schemaVersion: z.number().int().positive(),
  tenantId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  attemptId: z.string().min(1).optional(),
  correlationId: z.string().min(1),
  traceId: z.string().min(1),
  causationId: z.string().min(1).optional(),
  producer: z.object({
    service: z.string().min(1),
    version: z.string().min(1)
  }),
  issuedAt: z.string().datetime({ offset: true }),
  deadlineAt: z.string().datetime({ offset: true }).optional(),
  payload: z.unknown()
});

export function parseMessageEnvelope(input: unknown): MessageEnvelope<unknown> {
  return messageEnvelopeSchema.parse(input) as MessageEnvelope<unknown>;
}

export function createMessageEnvelope<TPayload>(
  message: Omit<MessageEnvelope<TPayload>, 'messageId' | 'issuedAt'> & {
    messageId?: string;
    issuedAt?: string;
  }
): MessageEnvelope<TPayload> {
  const envelope: MessageEnvelope<TPayload> = {
    ...message,
    messageId: message.messageId ?? crypto.randomUUID(),
    issuedAt: message.issuedAt ?? new Date().toISOString()
  };

  return messageEnvelopeSchema.parse(envelope) as MessageEnvelope<TPayload>;
}
