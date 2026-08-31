import { describe, expect, it } from 'vitest';

import {
  ProxyCostError,
  ProxyCostMeter,
  type ProxyMeteringContext,
  type ProxyUsageEventInput
} from '../../src/proxy/cost.js';

const base: Omit<ProxyUsageEventInput, 'category' | 'quantity' | 'unit'> = {
  tenantId: 'tenant_1',
  projectId: 'project_1',
  jobId: 'job_1',
  taskId: 'task_1',
  attemptId: 'attempt_1',
  providerId: 'provider_test',
  proxyId: 'proxy_1',
  tariff: {
    tariffId: 'tariff_1',
    currency: 'USD',
    requestCents: 0.02,
    bytesCentsPerGb: 1.5,
    leaseCentsPerHour: 0.5
  },
  source: 'proxy-provider-test',
  idempotencyKey: 'event_1'
};

describe('ProxyCostMeter', () => {
  it('records request, bytes and lease events and aggregates attempt cost', () => {
    const meter = new ProxyCostMeter();
    const request = meter.recordRequest({ ...base, count: 3 });
    const bytes = meter.recordBytes({ ...base, idempotencyKey: 'event_2', bytes: 1024 ** 3 });
    const lease = meter.recordLease({ ...base, idempotencyKey: 'event_3', leaseSeconds: 1_800 });

    expect(request).toMatchObject({ category: 'PROXY_REQUEST', quantity: 3, unitCostCents: 0.02, estimatedCostCents: 0.06 });
    expect(bytes).toMatchObject({ category: 'PROXY_BYTES', quantity: 1, unitCostCents: 1.5, estimatedCostCents: 1.5 });
    expect(lease).toMatchObject({ category: 'PROXY_LEASE', quantity: 0.5, unitCostCents: 0.5, estimatedCostCents: 0.25 });
    expect(meter.summary({ tenantId: 'tenant_1', jobId: 'job_1', attemptId: 'attempt_1' })).toMatchObject({
      currency: 'USD',
      totalCostCents: 1.81,
      eventCount: 3,
      byCategory: {
        PROXY_REQUEST: 0.06,
        PROXY_BYTES: 1.5,
        PROXY_LEASE: 0.25
      }
    });
  });

  it('deduplicates the same tenant/idempotency/category key and isolates tenant summaries', () => {
    const meter = new ProxyCostMeter();
    const first = meter.recordRequest({ ...base, count: 2 });
    const duplicate = meter.recordRequest({ ...base, count: 999 });
    meter.recordRequest({ ...base, tenantId: 'tenant_2', idempotencyKey: 'event_1', count: 1 });

    expect(duplicate).toEqual(first);
    expect(meter.eventCount).toBe(2);
    expect(meter.summary({ tenantId: 'tenant_1' }).totalCostCents).toBe(0.04);
    expect(meter.summary({ tenantId: 'tenant_2' }).totalCostCents).toBe(0.02);
  });

  it('provides attempt-scoped request/bytes/lease attribution helpers', () => {
    const meter = new ProxyCostMeter();
    const context: ProxyMeteringContext = {
      ...base,
      projectId: 'project_1',
      jobId: 'job_1',
      taskId: 'task_1',
      attemptId: 'attempt_1'
    };

    meter.recordAttemptRequest({ ...context, idempotencyKey: 'attempt_request', count: 2 });
    meter.recordAttemptBytes({ ...context, idempotencyKey: 'attempt_bytes', bytes: 1024 ** 3 });
    meter.recordAttemptLease({ ...context, idempotencyKey: 'attempt_lease', leaseSeconds: 3_600 });

    expect(meter.summary({ tenantId: 'tenant_1', jobId: 'job_1', attemptId: 'attempt_1' })).toMatchObject({
      totalCostCents: 2.04,
      eventCount: 3
    });
  });

  it('keeps metadata clone-safe and creates deterministic usage ids', () => {
    const meter = new ProxyCostMeter();
    const event = meter.recordRequest({ ...base, metadata: { region: 'TR' } });
    if (event.metadata?.region) {
      event.metadata.region = 'changed';
    }
    const duplicate = meter.recordRequest({ ...base, metadata: { region: 'other' } });

    expect(duplicate.id).toBe(event.id);
    expect(duplicate.metadata).toEqual({ region: 'TR' });
  });

  it('rejects invalid quantities, tariff values and category units', () => {
    const meter = new ProxyCostMeter();
    expect(() => meter.record({ ...base, category: 'PROXY_BYTES', quantity: -1, unit: 'GB' })).toThrowError(
      expect.objectContaining({ code: 'PROXY_USAGE_INVALID', retryable: false })
    );
    expect(() => meter.record({ ...base, category: 'PROXY_REQUEST', quantity: 1, unit: 'GB' })).toThrowError(
      expect.objectContaining({ code: 'PROXY_USAGE_INVALID', retryable: false })
    );
    expect(() => meter.record({ ...base, category: 'PROXY_LEASE', quantity: 1, unit: 'hour', tariff: { ...base.tariff, requestCents: -1 } })).toThrowError(
      expect.objectContaining({ code: 'PROXY_USAGE_INVALID', retryable: false })
    );
    expect(() => meter.recordRequest({ ...base, metadata: { authorization: 'Bearer hidden' } })).toThrowError(
      expect.objectContaining({ code: 'PROXY_USAGE_INVALID', retryable: false })
    );
    expect(new ProxyCostError('PROXY_USAGE_INVALID', 'invalid', false).name).toBe('ProxyCostError');
  });
});
