import type { ProxyCatalog, ProxyCatalogEntry, ProxyRequirement } from './catalog.js';
import type { ProxyHealthRegistry, ProxyHealthScore } from './health.js';

export type ProxyCostRate = {
  currency: string;
  requestCents: number;
  bytesCentsPerGb: number;
  leaseCentsPerHour: number;
};

export type ProxySelectionRequest = {
  requirement: ProxyRequirement;
  estimatedRequests: number;
  estimatedBytes: number;
  estimatedLeaseSeconds: number;
};

export type ProxySelectionCandidate = {
  proxyId: string;
  providerId: string;
  healthScore: number;
  costScore: number;
  totalScore: number;
  estimatedCostCents: number;
  currency: string;
  reasons: string[];
};

export type ProxySelectionDecision = {
  selected: ProxyCatalogEntry;
  candidate: ProxySelectionCandidate;
  considered: ProxySelectionCandidate[];
};

export class ProxySelectionError extends Error {
  public constructor(
    public readonly code: 'PROXY_SELECTION_INVALID' | 'NO_HEALTHY_PROXY',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ProxySelectionError';
  }
}

export class ProxySelectionPolicy {
  public constructor(
    private readonly catalog: ProxyCatalog,
    private readonly health: ProxyHealthRegistry,
    private readonly costRates: Map<string, ProxyCostRate>,
    private readonly options: {
      healthWeight: number;
      costWeight: number;
      excludeQuarantineRecommended: boolean;
    } = {
      healthWeight: 0.7,
      costWeight: 0.3,
      excludeQuarantineRecommended: true
    }
  ) {
    if (options.healthWeight < 0 || options.costWeight < 0 || options.healthWeight + options.costWeight <= 0) {
      throw new ProxySelectionError(
        'PROXY_SELECTION_INVALID',
        'Proxy selection weight değerleri geçerli değil.',
        false
      );
    }
  }

  public select(request: ProxySelectionRequest): ProxySelectionDecision {
    validateRequest(request);
    const entries = this.catalog.listEligible(request.requirement);
    const scored = entries
      .map((entry) => this.score(entry, request))
      .filter((item) => !this.options.excludeQuarantineRecommended || !item.health.quarantineRecommended);
    if (scored.length === 0) {
      throw new ProxySelectionError(
        'NO_HEALTHY_PROXY',
        'Proxy policy ve health sinyalleri için uygun proxy bulunamadı.',
        false
      );
    }

    const maxCost = Math.max(...scored.map((item) => item.estimatedCostCents), 1);
    const considered = scored
      .map(({ entry, health, estimatedCostCents, rate }) => {
        const healthScore = health.sampleCount === 0 ? 0.5 : health.score;
        const costScore = round(1 - (estimatedCostCents / maxCost));
        const totalScore = round(((healthScore * this.options.healthWeight) + (costScore * this.options.costWeight))
          / (this.options.healthWeight + this.options.costWeight));
        const reasons = [
          health.sampleCount === 0 ? 'health_sample_yok_neutral' : `health_score_${healthScore}`,
          `cost_${estimatedCostCents}${rate.currency}`,
          `geo_${entry.country ?? 'unspecified'}_${entry.region ?? 'unspecified'}`,
          `class_${entry.proxyClass}`
        ];
        return {
          proxyId: entry.proxyId,
          providerId: entry.providerId,
          healthScore: round(healthScore),
          costScore,
          totalScore,
          estimatedCostCents,
          currency: rate.currency,
          reasons
        } satisfies ProxySelectionCandidate;
      })
      .sort((left, right) => right.totalScore - left.totalScore || left.proxyId.localeCompare(right.proxyId));
    const candidate = considered[0];
    if (!candidate) {
      throw new ProxySelectionError(
        'NO_HEALTHY_PROXY',
        'Proxy selection sonucu üretilemedi.',
        false
      );
    }
    const selected = entries.find((entry) => entry.proxyId === candidate.proxyId);
    if (!selected) {
      throw new ProxySelectionError(
        'NO_HEALTHY_PROXY',
        'Seçilen proxy catalog içinde bulunamadı.',
        false
      );
    }
    return { selected, candidate, considered };
  }

  private score(
    entry: ProxyCatalogEntry,
    request: ProxySelectionRequest
  ): { entry: ProxyCatalogEntry; health: ProxyHealthScore; estimatedCostCents: number; rate: ProxyCostRate } {
    const rate = this.costRates.get(entry.providerId) ?? {
      currency: 'USD',
      requestCents: 0,
      bytesCentsPerGb: 0,
      leaseCentsPerHour: 0
    };
    const estimatedCostCents = round(
      (request.estimatedRequests * rate.requestCents)
      + ((request.estimatedBytes / (1024 ** 3)) * rate.bytesCentsPerGb)
      + ((request.estimatedLeaseSeconds / 3_600) * rate.leaseCentsPerHour)
    );
    return {
      entry,
      health: this.health.proxyScore(entry.providerId, entry.proxyId),
      estimatedCostCents,
      rate
    };
  }
}

function validateRequest(request: ProxySelectionRequest): void {
  if (!Number.isInteger(request.estimatedRequests) || request.estimatedRequests < 1
    || !Number.isFinite(request.estimatedBytes) || request.estimatedBytes < 0
    || !Number.isFinite(request.estimatedLeaseSeconds) || request.estimatedLeaseSeconds <= 0) {
    throw new ProxySelectionError(
      'PROXY_SELECTION_INVALID',
      'Proxy selection cost estimate değerleri geçerli değil.',
      false
    );
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
