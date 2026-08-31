import { describe, expect, it } from 'vitest';

import { ProviderTariffError, ProviderTariffRegistry } from '../../src/finops/tariffs.js';

const scope = { tenantId: 'tenant_1', projectId: 'project_1' };
const first = { tariffId: 'tariff_1', scope, providerId: 'provider_1', currency: 'USD' as const, effectiveFrom: '2026-01-01T00:00:00.000Z', rates: [{ category: 'HTTP_REQUEST' as const, unit: 'request' as const, unitPriceMicros: 12000 }] };

describe('immutable provider tariff and pricing configuration', () => {
  it('resolves historical usage against the effective immutable tariff version without retroactive change', () => {
    const registry = new ProviderTariffRegistry();
    registry.register(first);
    registry.register({ ...first, tariffId: 'tariff_2', effectiveFrom: '2026-02-01T00:00:00.000Z', rates: [{ category: 'HTTP_REQUEST', unit: 'request', unitPriceMicros: 15000 }] });

    expect(registry.resolve(scope, 'provider_1', 'HTTP_REQUEST', '2026-01-15T00:00:00.000Z')).toMatchObject({ tariffId: 'tariff_1', unitPriceMicros: 12000, currency: 'USD' });
    expect(registry.resolve(scope, 'provider_1', 'HTTP_REQUEST', '2026-02-15T00:00:00.000Z')).toMatchObject({ tariffId: 'tariff_2', unitPriceMicros: 15000, currency: 'USD' });
  });

  it('is idempotent only for an identical tariff and prevents cross-tenant resolution', () => {
    const registry = new ProviderTariffRegistry();
    const registered = registry.register(first);
    expect(registry.register(first)).toEqual(registered);
    expect(() => registry.resolve({ tenantId: 'tenant_2', projectId: 'project_1' }, 'provider_1', 'HTTP_REQUEST', '2026-01-15T00:00:00.000Z')).toThrow(ProviderTariffError);
    expect(() => registry.register({ ...first, currency: 'EUR' })).toThrow(ProviderTariffError);
  });

  it('rejects arbitrary provider configuration, mismatched category-unit, duplicate rates and invalid resolution input fail-closed', () => {
    const registry = new ProviderTariffRegistry();
    expect(() => registry.register({ ...first, currency: 'TRY' as never })).toThrow(ProviderTariffError);
    expect(() => registry.register({ ...first, rates: [{ category: 'HTTP_REQUEST', unit: 'token' as never, unitPriceMicros: 1 }] })).toThrow(ProviderTariffError);
    expect(() => registry.register({ ...first, rates: [first.rates[0]!, first.rates[0]!] })).toThrow(ProviderTariffError);
    expect(() => registry.resolve(scope, 'provider_1', 'CUSTOM' as never, 'bad-time')).toThrow(ProviderTariffError);
  });
});
