import { describe, expect, it } from 'vitest';

import { createWebhookDeliveryIntent, JobProgressEventRegistry, ProgressEventError } from '../../src/orchestrator/progress-events.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1' };
const registry = () => new JobProgressEventRegistry(() => new Date('2026-08-27T00:00:00.000Z'));

describe('job progress event and webhook intent contracts', () => {
  it('returns reconnect-safe snapshot events after a requested sequence without raw payloads', () => {
    const events = registry();
    events.emit(scope, { type: 'JOB_STATE_CHANGED', status: 'RUNNING', totalTaskCount: 2 });
    events.emit(scope, { type: 'TASK_PROGRESS', completedTaskCount: 1 });
    const snapshot = events.snapshot(scope, 1);

    expect(snapshot).toMatchObject({ lastSequence: 2, currentStatus: 'RUNNING', completedTaskCount: 1, totalTaskCount: 2 });
    expect(snapshot.recentEvents).toEqual([expect.objectContaining({ sequence: 2, type: 'TASK_PROGRESS', completedTaskCount: 1 })]);
    expect(JSON.stringify(snapshot)).not.toContain('authorization');
  });

  it('creates deterministic, egress-guarded webhook intents without dispatch or bypass signals', () => {
    const events = registry();
    const event = events.emit(scope, { type: 'CONTROL_CHANGED', status: 'PAUSED' });
    const intent = createWebhookDeliveryIntent('https://hooks.example.com/events', event);

    expect(intent).toMatchObject({ eventId: event.eventId, eventType: 'CONTROL_CHANGED', retryable: false, allowBypass: false });
    expect(intent.destinationFingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => createWebhookDeliveryIntent('http://127.0.0.1:8080/hook', event)).toThrowError(expect.objectContaining({ code: 'WEBHOOK_DESTINATION_REJECTED' }));
  });

  it('rejects invalid counts, sequence, scope and forged webhook events fail-closed', () => {
    const events = registry();
    expect(() => events.emit(scope, { type: 'TASK_PROGRESS', completedTaskCount: 3, totalTaskCount: 2 })).toThrow(ProgressEventError);
    events.emit(scope, { type: 'JOB_STATE_CHANGED', status: 'RUNNING' });
    expect(() => events.snapshot(scope, -1)).toThrow(ProgressEventError);
    expect(() => events.snapshot({ tenantId: 'tenant_2', jobId: 'job_1' })).toThrowError(expect.objectContaining({ code: 'PROGRESS_EVENT_SCOPE_NOT_FOUND' }));
    expect(() => createWebhookDeliveryIntent('https://hooks.example.com', { eventId: 'bad id', sequence: 1, occurredAt: 'x', tenantId: 'tenant_1', jobId: 'job_1', type: 'JOB_STATE_CHANGED' })).toThrow(ProgressEventError);
  });
});
