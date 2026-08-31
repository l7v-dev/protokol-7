import { createHash } from 'node:crypto';

import type { ProxyCostRate } from './selection.js';

export type ProxyTariff = ProxyCostRate & {
  tariffId: string;
};

export type ProxyUsageCategory = 'PROXY_REQUEST' | 'PROXY_BYTES' | 'PROXY_LEASE';

export type ProxyUsageEventInput = {
  tenantId: string;
  projectId?: string;
  jobId?: string;
  taskId?: string;
  attemptId?: string;
  providerId: string;
  proxyId?: string;
  category: ProxyUsageCategory;
  quantity: number;
  unit: 'request' | 'GB' | 'hour';
  tariff: ProxyTariff;
  source: string;
  idempotencyKey: string;
  occurredAt?: Date;
  metadata?: Record<string, string>;
};

export type ProxyMeteringContext = Omit<ProxyUsageEventInput, 'category' | 'quantity' | 'unit' | 'idempotencyKey' | 'occurredAt' | 'metadata'> & {
  projectId: string;
  jobId: string;
  taskId: string;
  attemptId: string;
};

export type ProxyUsageEvent = ProxyUsageEventInput & {
  id: string;
  unitCostCents: number;
  estimatedCostCents: number;
  occurredAt: Date;
};

export type ProxyCostSummary = {
  tenantId: string;
  jobId?: string;
  attemptId?: string;
  currency: string;
  totalCostCents: number;
  byCategory: Record<ProxyUsageCategory, number>;
  eventCount: number;
};

export class ProxyCostError extends Error {
  public constructor(
    public readonly code: 'PROXY_USAGE_INVALID',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ProxyCostError';
  }
}

/**
 * Process-local reference implementation for immutable proxy usage events.
 * A persistence adapter can map these events to `usage_events` using the same
 * tenant/idempotency/category uniqueness boundary.
 */
export class ProxyCostMeter {
  private readonly events = new Map<string, ProxyUsageEvent>();

  public record(input: ProxyUsageEventInput): ProxyUsageEvent {
    validateInput(input);
    const key = `${input.tenantId}:${input.idempotencyKey}:${input.category}`;
    const existing = this.events.get(key);
    if (existing) {
      return cloneEvent(existing);
    }
    const unitCostCents = unitCostFor(input);
    const event: ProxyUsageEvent = {
      ...input,
      id: `usage_${hash(key)}`,
      unitCostCents,
      estimatedCostCents: round(input.quantity * unitCostCents),
      occurredAt: new Date(input.occurredAt ?? new Date()),
      ...(input.metadata ? { metadata: { ...input.metadata } } : {})
    };
    this.events.set(key, event);
    return cloneEvent(event);
  }

  public recordRequest(input: Omit<ProxyUsageEventInput, 'category' | 'quantity' | 'unit'> & { count?: number }): ProxyUsageEvent {
    return this.record({
      ...input,
      category: 'PROXY_REQUEST',
      quantity: input.count ?? 1,
      unit: 'request'
    });
  }

  public recordBytes(input: Omit<ProxyUsageEventInput, 'category' | 'quantity' | 'unit'> & { bytes: number }): ProxyUsageEvent {
    return this.record({
      ...input,
      category: 'PROXY_BYTES',
      quantity: input.bytes / (1024 ** 3),
      unit: 'GB'
    });
  }

  public recordLease(input: Omit<ProxyUsageEventInput, 'category' | 'quantity' | 'unit'> & { leaseSeconds: number }): ProxyUsageEvent {
    return this.record({
      ...input,
      category: 'PROXY_LEASE',
      quantity: input.leaseSeconds / 3_600,
      unit: 'hour'
    });
  }

  public recordAttemptRequest(input: ProxyMeteringContext & { count?: number; idempotencyKey: string; occurredAt?: Date; metadata?: Record<string, string> }): ProxyUsageEvent {
    return this.recordRequest(input);
  }

  public recordAttemptBytes(input: ProxyMeteringContext & { bytes: number; idempotencyKey: string; occurredAt?: Date; metadata?: Record<string, string> }): ProxyUsageEvent {
    return this.recordBytes(input);
  }

  public recordAttemptLease(input: ProxyMeteringContext & { leaseSeconds: number; idempotencyKey: string; occurredAt?: Date; metadata?: Record<string, string> }): ProxyUsageEvent {
    return this.recordLease(input);
  }

  public summary(input: { tenantId: string; jobId?: string; attemptId?: string }): ProxyCostSummary {
    const selected = [...this.events.values()].filter((event) => event.tenantId === input.tenantId
      && (input.jobId === undefined || event.jobId === input.jobId)
      && (input.attemptId === undefined || event.attemptId === input.attemptId));
    const currency = selected[0]?.tariff.currency ?? 'USD';
    const byCategory: Record<ProxyUsageCategory, number> = {
      PROXY_REQUEST: 0,
      PROXY_BYTES: 0,
      PROXY_LEASE: 0
    };
    for (const event of selected) {
      byCategory[event.category] = round(byCategory[event.category] + event.estimatedCostCents);
    }
    return {
      tenantId: input.tenantId,
      ...(input.jobId ? { jobId: input.jobId } : {}),
      ...(input.attemptId ? { attemptId: input.attemptId } : {}),
      currency,
      totalCostCents: round(selected.reduce((total, event) => total + event.estimatedCostCents, 0)),
      byCategory,
      eventCount: selected.length
    };
  }

  public get eventCount(): number {
    return this.events.size;
  }
}

function unitCostFor(input: ProxyUsageEventInput): number {
  switch (input.category) {
    case 'PROXY_REQUEST': return input.tariff.requestCents;
    case 'PROXY_BYTES': return input.tariff.bytesCentsPerGb;
    case 'PROXY_LEASE': return input.tariff.leaseCentsPerHour;
  }
}

function validateInput(input: ProxyUsageEventInput): void {
  if (!input.tenantId || !input.providerId || !input.idempotencyKey || !input.source
    || !input.tariff.tariffId || !input.tariff.currency
    || !Number.isFinite(input.quantity) || input.quantity < 0
    || !Number.isFinite(input.tariff.requestCents) || input.tariff.requestCents < 0
    || !Number.isFinite(input.tariff.bytesCentsPerGb) || input.tariff.bytesCentsPerGb < 0
    || !Number.isFinite(input.tariff.leaseCentsPerHour) || input.tariff.leaseCentsPerHour < 0) {
    throw new ProxyCostError('PROXY_USAGE_INVALID', 'Proxy usage event veya tariff geçerli değil.', false);
  }
  if ((input.category === 'PROXY_REQUEST' && input.unit !== 'request')
    || (input.category === 'PROXY_BYTES' && input.unit !== 'GB')
    || (input.category === 'PROXY_LEASE' && input.unit !== 'hour')) {
    throw new ProxyCostError('PROXY_USAGE_INVALID', 'Proxy usage category/unit eşleşmesi geçerli değil.', false);
  }
  if (input.metadata && Object.keys(input.metadata).some((key) => /authorization|cookie|credential|password|secret|session|token/i.test(key))) {
    throw new ProxyCostError('PROXY_USAGE_INVALID', 'Proxy usage metadata secret alanı içeremez.', false);
  }
}

function cloneEvent(event: ProxyUsageEvent): ProxyUsageEvent {
  return {
    ...event,
    tariff: { ...event.tariff },
    occurredAt: new Date(event.occurredAt),
    ...(event.metadata ? { metadata: { ...event.metadata } } : {})
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
