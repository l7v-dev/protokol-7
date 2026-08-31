import { createHash } from 'node:crypto';

import { unitForCostCategory, type CostCategory, type UsageEventScope, type UsageUnit } from './usage-events.js';

export const TARIFF_CONFIGURATION_CONTRACT_VERSION = 'tariff-configuration/v1' as const;

export type TariffCurrency = 'USD' | 'EUR';
export type ProviderTariffScope = Pick<UsageEventScope, 'tenantId' | 'projectId'>;
export type ProviderTariffRate = { category: CostCategory; unit: UsageUnit; unitPriceMicros: number };
export type ProviderTariffInput = {
  tariffId: string;
  scope: ProviderTariffScope;
  providerId: string;
  currency: TariffCurrency;
  effectiveFrom: string;
  rates: ReadonlyArray<ProviderTariffRate>;
};

export type ProviderTariff = ProviderTariffInput & {
  contractVersion: typeof TARIFF_CONFIGURATION_CONTRACT_VERSION;
  tariffFingerprintSha256: string;
};

export class ProviderTariffError extends Error {
  public constructor(public readonly code: 'TARIFF_CONFIGURATION_INVALID' | 'TARIFF_CONFIGURATION_CONFLICT' | 'TARIFF_CONFIGURATION_NOT_FOUND', message: string) {
    super(message);
    this.name = 'ProviderTariffError';
  }
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_RATE_MICROS = 1_000_000_000_000;
const MAX_RATES = 9;

/**
 * Process-local immutable tariff configuration registry. It accepts only a
 * closed cost-category/unit vocabulary and integer micro-prices; it does not
 * import provider pricing, convert currencies, calculate charges, persist or
 * mutate historic usage events, invoice, bill or execute a payment.
 */
export class ProviderTariffRegistry {
  private readonly tariffs = new Map<string, ProviderTariff>();

  public register(input: ProviderTariffInput): ProviderTariff {
    validateInput(input);
    const tariff = createTariff(input);
    const key = tariffKey(input.scope, input.providerId, input.effectiveFrom);
    const existing = this.tariffs.get(key);
    if (existing !== undefined) {
      if (existing.tariffFingerprintSha256 === tariff.tariffFingerprintSha256) return clone(existing);
      throw new ProviderTariffError('TARIFF_CONFIGURATION_CONFLICT', 'Aynı provider effective-date için tariff farklı içerikle tekrar kullanılamaz.');
    }
    this.tariffs.set(key, tariff);
    return clone(tariff);
  }

  public resolve(scope: ProviderTariffScope, providerId: string, category: CostCategory, occurredAt: string): ProviderTariffRate & Pick<ProviderTariff, 'tariffId' | 'currency' | 'effectiveFrom' | 'tariffFingerprintSha256'> {
    validateScope(scope);
    if (!SAFE_ID.test(providerId) || !isCategory(category) || !isTime(occurredAt)) throw invalid();
    const effective = [...this.tariffs.values()]
      .filter((tariff) => sameScope(tariff.scope, scope) && tariff.providerId === providerId && Date.parse(tariff.effectiveFrom) <= Date.parse(occurredAt))
      .sort((left, right) => Date.parse(right.effectiveFrom) - Date.parse(left.effectiveFrom))[0];
    if (effective === undefined) throw new ProviderTariffError('TARIFF_CONFIGURATION_NOT_FOUND', 'Usage zamanı için etkin provider tariff bulunamadı.');
    const rate = effective.rates.find((candidate) => candidate.category === category);
    if (rate === undefined) throw new ProviderTariffError('TARIFF_CONFIGURATION_NOT_FOUND', 'Usage category için provider tariff rate bulunamadı.');
    return { ...rate, tariffId: effective.tariffId, currency: effective.currency, effectiveFrom: effective.effectiveFrom, tariffFingerprintSha256: effective.tariffFingerprintSha256 };
  }
}

function createTariff(input: ProviderTariffInput): ProviderTariff {
  const normalized: ProviderTariffInput = { ...input, scope: { ...input.scope }, rates: input.rates.map((rate) => ({ ...rate })).sort((left, right) => left.category.localeCompare(right.category)) };
  return {
    contractVersion: TARIFF_CONFIGURATION_CONTRACT_VERSION,
    ...normalized,
    tariffFingerprintSha256: createHash('sha256').update(JSON.stringify(normalized)).digest('hex')
  };
}

function validateInput(input: ProviderTariffInput): void {
  validateScope(input.scope);
  if (!SAFE_ID.test(input.tariffId) || !SAFE_ID.test(input.providerId) || !['USD', 'EUR'].includes(input.currency) || !isTime(input.effectiveFrom)
    || input.rates.length < 1 || input.rates.length > MAX_RATES) throw invalid();
  const categories = new Set<CostCategory>();
  for (const rate of input.rates) {
    if (!isCategory(rate.category) || rate.unit !== unitForCostCategory(rate.category) || !Number.isSafeInteger(rate.unitPriceMicros) || rate.unitPriceMicros < 0 || rate.unitPriceMicros > MAX_RATE_MICROS || categories.has(rate.category)) throw invalid();
    categories.add(rate.category);
  }
}

function validateScope(scope: ProviderTariffScope): void {
  if (!SAFE_ID.test(scope.tenantId) || !SAFE_ID.test(scope.projectId)) throw invalid();
}

function isCategory(category: string): category is CostCategory {
  try {
    unitForCostCategory(category as CostCategory);
    return true;
  } catch {
    return false;
  }
}

function isTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function tariffKey(scope: ProviderTariffScope, providerId: string, effectiveFrom: string): string {
  return `${scope.tenantId}:${scope.projectId}:${providerId}:${effectiveFrom}`;
}

function sameScope(left: ProviderTariffScope, right: ProviderTariffScope): boolean {
  return left.tenantId === right.tenantId && left.projectId === right.projectId;
}

function clone(tariff: ProviderTariff): ProviderTariff {
  return { ...tariff, scope: { ...tariff.scope }, rates: tariff.rates.map((rate) => ({ ...rate })) };
}

function invalid(): ProviderTariffError {
  return new ProviderTariffError('TARIFF_CONFIGURATION_INVALID', 'Provider tariff configuration geçerli değil.');
}
