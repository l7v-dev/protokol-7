import { describe, expect, it } from 'vitest';

import { createMessageEnvelope, parseMessageEnvelope } from '../../src/queue/contracts.js';

describe('queue contracts', () => {
  it('creates a correlated job command envelope', () => {
    const message = createMessageEnvelope({
      messageType: 'job.create',
      schemaVersion: 1,
      tenantId: 'tenant_1',
      projectId: 'project_1',
      jobId: 'job_1',
      correlationId: 'corr_1',
      traceId: 'trace_1',
      producer: {
        service: 'api',
        version: '0.1.0'
      },
      payload: {
        idempotencyKey: 'idem_1'
      }
    });

    expect(message.messageId).toBeTypeOf('string');
    expect(message.issuedAt).toBeTypeOf('string');
    expect(message).toMatchObject({
      messageType: 'job.create',
      tenantId: 'tenant_1',
      jobId: 'job_1'
    });
  });

  it('rejects an envelope without tenant or correlation context', () => {
    expect(() => parseMessageEnvelope({
      messageId: 'message_1',
      messageType: 'task.execute',
      schemaVersion: 1,
      producer: { service: 'orchestrator', version: '0.1.0' },
      issuedAt: new Date().toISOString(),
      payload: {}
    })).toThrow();
  });

  it('rejects an unsupported message type', () => {
    expect(() => parseMessageEnvelope({
      messageId: 'message_1',
      messageType: 'unsupported',
      schemaVersion: 1,
      tenantId: 'tenant_1',
      correlationId: 'corr_1',
      traceId: 'trace_1',
      producer: { service: 'orchestrator', version: '0.1.0' },
      issuedAt: new Date().toISOString(),
      payload: {}
    })).toThrow();
  });
});
