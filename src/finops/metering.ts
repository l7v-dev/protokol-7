import type { UsageEventInput, UsageEventScope } from './usage-events.js';

export const MULTI_SOURCE_METERING_CONTRACT_VERSION = 'multi-source-metering/v1' as const;

export type MultiSourceMeteringInput = {
  meterId: string;
  scope: UsageEventScope;
  observedAt: string;
  measurements: {
    httpRequests: number;
    browserRuntimeSeconds: number;
    proxyRequests: number;
    proxyBytes: number;
    aiInputTokens: number;
    aiOutputTokens: number;
    storageGigabyteMonths: number;
    computeSeconds: number;
  };
};

export type MultiSourceMeteringProjection = {
  contractVersion: typeof MULTI_SOURCE_METERING_CONTRACT_VERSION;
  meterId: string;
  scope: UsageEventScope;
  observedAt: string;
  usageEvents: ReadonlyArray<UsageEventInput>;
};

export class MultiSourceMeteringError extends Error {
  public constructor(public readonly code: 'MULTI_SOURCE_METERING_INVALID', message: string) {
    super(message);
    this.name = 'MultiSourceMeteringError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_MEASUREMENT = 10_000_000;
const GIGABYTE = 1024 ** 3;
const MAX_PROXY_BYTES = 10_000 * GIGABYTE;

/**
 * Pure metering projection. It converts caller-supplied bounded numeric counts
 * into P14-T01 usage events but never reads HTTP/browser/proxy/AI/storage/
 * compute runtimes, invokes providers, persists records or calculates prices.
 */
export function projectMultiSourceUsage(input: MultiSourceMeteringInput): MultiSourceMeteringProjection {
  validate(input);
  const candidates: ReadonlyArray<{ category: UsageEventInput['category']; unit: UsageEventInput['unit']; quantity: number }> = [
    { category: 'HTTP_REQUEST', unit: 'request', quantity: input.measurements.httpRequests },
    { category: 'BROWSER_MINUTE', unit: 'minute', quantity: input.measurements.browserRuntimeSeconds / 60 },
    { category: 'PROXY_REQUEST', unit: 'request', quantity: input.measurements.proxyRequests },
    { category: 'PROXY_GB', unit: 'GB', quantity: input.measurements.proxyBytes / GIGABYTE },
    { category: 'AI_INPUT_TOKEN', unit: 'token', quantity: input.measurements.aiInputTokens },
    { category: 'AI_OUTPUT_TOKEN', unit: 'token', quantity: input.measurements.aiOutputTokens },
    { category: 'STORAGE_GB_MONTH', unit: 'GB-month', quantity: input.measurements.storageGigabyteMonths },
    { category: 'COMPUTE_SECOND', unit: 'second', quantity: input.measurements.computeSeconds }
  ];
  const usageEvents = candidates
    .filter((candidate) => candidate.quantity > 0)
    .map((candidate) => ({
      scope: { ...input.scope }, usageId: `${input.meterId}_${candidate.category.toLowerCase()}`, idempotencyKey: `${input.meterId}_${candidate.category.toLowerCase()}`,
      category: candidate.category, unit: candidate.unit, quantity: round(candidate.quantity), occurredAt: input.observedAt
    }));
  return { contractVersion: MULTI_SOURCE_METERING_CONTRACT_VERSION, meterId: input.meterId, scope: { ...input.scope }, observedAt: input.observedAt, usageEvents };
}

function validate(input: MultiSourceMeteringInput): void {
  if (!SAFE_ID.test(input.meterId) || !Object.values(input.scope).every((value) => SAFE_ID.test(value)) || !Number.isFinite(Date.parse(input.observedAt))
    || !Object.entries(input.measurements).every(([key, value]) => Number.isFinite(value) && value >= 0 && value <= (key === 'proxyBytes' ? MAX_PROXY_BYTES : MAX_MEASUREMENT))) throw invalid();
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function invalid(): MultiSourceMeteringError {
  return new MultiSourceMeteringError('MULTI_SOURCE_METERING_INVALID', 'Multi-source metering input geçerli değil.');
}
