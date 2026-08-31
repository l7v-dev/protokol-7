import { describe, expect, it } from 'vitest';

import { JobControlError, JobControlRegistry } from '../../src/orchestrator/control-plane.js';

const scope = { tenantId: 'tenant_1', jobId: 'job_1' };
const registry = () => new JobControlRegistry(() => new Date('2026-08-27T00:00:00.000Z'));

describe('JobControlRegistry', () => {
  it('stops new dispatch during pause drain and resumes only after active work settles', () => {
    const controls = registry();
    controls.initialize(scope);
    controls.admitDispatch(scope);
    const draining = controls.requestPause(scope);

    expect(draining).toMatchObject({ status: 'PAUSE_DRAINING', activeDeliveryCount: 1, dispatchAllowed: false });
    expect(() => controls.admitDispatch(scope)).toThrowError(expect.objectContaining({ code: 'JOB_CONTROL_CONFLICT' }));
    expect(controls.settleDelivery(scope)).toMatchObject({ status: 'PAUSED', activeDeliveryCount: 0, dispatchAllowed: false });
    expect(controls.resume(scope)).toMatchObject({ status: 'RUNNING', dispatchAllowed: true });
  });

  it('drains active delivery before cancellation and prevents future dispatch after terminal cancel', () => {
    const controls = registry();
    controls.initialize(scope);
    controls.admitDispatch(scope);
    expect(controls.requestCancel(scope)).toMatchObject({ status: 'CANCEL_DRAINING', activeDeliveryCount: 1, dispatchAllowed: false });
    expect(controls.settleDelivery(scope)).toMatchObject({ status: 'CANCELLED', activeDeliveryCount: 0, dispatchAllowed: false });
    expect(() => controls.admitDispatch(scope)).toThrowError(expect.objectContaining({ code: 'JOB_CONTROL_CONFLICT' }));
    expect(controls.auditEvents(scope).map((event) => event.type)).toEqual(['DISPATCH_ADMITTED', 'CANCEL_REQUESTED', 'CANCELLED']);
  });

  it('keeps state tenant-job scoped and rejects conflicting invalid control operations', () => {
    const controls = registry();
    controls.initialize(scope);
    expect(() => controls.get({ tenantId: 'tenant_2', jobId: 'job_1' })).toThrowError(expect.objectContaining({ code: 'JOB_CONTROL_NOT_FOUND' }));
    expect(() => controls.resume(scope)).toThrow(JobControlError);
    expect(() => controls.settleDelivery(scope)).toThrow(JobControlError);
    expect(() => controls.initialize({ tenantId: 'bad id', jobId: 'job_1' })).toThrow(JobControlError);
    expect(JSON.stringify(controls.auditEvents(scope))).not.toContain('authorization');
  });
});
