export class ProxyHealthError extends Error {
  public constructor(
    public readonly code: 'PROXY_HEALTH_SAMPLE_INVALID' | 'PROXY_HEALTH_NOT_FOUND' | 'PROXY_HEALTH_CONFIG_INVALID',
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ProxyHealthError';
  }
}

export type ProxyHealthSample = {
  providerId: string;
  proxyId?: string;
  success: boolean;
  latencyMs: number;
  occurredAt?: Date;
  failureClass?: string;
};

export type ProxyHealthScore = {
  scope: 'provider' | 'proxy';
  providerId: string;
  proxyId?: string;
  sampleCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageLatencyMs: number;
  score: number;
  healthy: boolean;
  quarantineRecommended: boolean;
  lastSampleAt?: Date;
};

export type ProxyHealthRegistryConfig = {
  windowSize: number;
  minSamples: number;
  minSuccessRate: number;
  minScore: number;
  latencyReferenceMs: number;
};

export class ProxyHealthRegistry {
  private readonly samples = new Map<string, ProxyHealthSample[]>();

  public constructor(
    private readonly config: ProxyHealthRegistryConfig = {
      windowSize: 20,
      minSamples: 5,
      minSuccessRate: 0.8,
      minScore: 0.7,
      latencyReferenceMs: 1000
    }
  ) {
    if (
      !Number.isInteger(config.windowSize) ||
      config.windowSize < 1 ||
      !Number.isInteger(config.minSamples) ||
      config.minSamples < 1 ||
      config.minSuccessRate < 0 ||
      config.minSuccessRate > 1 ||
      config.minScore < 0 ||
      config.minScore > 1 ||
      config.latencyReferenceMs <= 0
    ) {
      throw new ProxyHealthError(
        'PROXY_HEALTH_CONFIG_INVALID',
        'Proxy health registry konfigürasyonu geçerli değil.',
        false
      );
    }
  }

  public record(sample: ProxyHealthSample): void {
    if (
      !sample.providerId ||
      !Number.isFinite(sample.latencyMs) ||
      sample.latencyMs < 0
    ) {
      throw new ProxyHealthError(
        'PROXY_HEALTH_SAMPLE_INVALID',
        'Proxy health numunesi geçerli değil.',
        false
      );
    }

    const key = keyFor(sample.providerId, sample.proxyId);
    const existing = this.samples.get(key) ?? [];
    const item: ProxyHealthSample = {
      ...sample,
      occurredAt: sample.occurredAt ?? new Date()
    };
    existing.push(item);

    if (existing.length > this.config.windowSize) {
      existing.shift();
    }
    this.samples.set(key, existing);
  }

  public providerScore(providerId: string): ProxyHealthScore {
    return this.computeScore('provider', providerId, undefined);
  }

  public proxyScore(providerId: string, proxyId: string): ProxyHealthScore {
    return this.computeScore('proxy', providerId, proxyId);
  }

  public clear(providerId: string, proxyId?: string): void {
    const key = keyFor(providerId, proxyId);
    this.samples.delete(key);
  }

  private computeScore(
    scope: 'provider' | 'proxy',
    providerId: string,
    proxyId?: string
  ): ProxyHealthScore {
    const key = keyFor(providerId, proxyId);
    const samples = this.samples.get(key) ?? [];
    const sampleCount = samples.length;

    if (sampleCount === 0) {
      return {
        scope,
        providerId,
        ...(proxyId !== undefined ? { proxyId } : {}),
        sampleCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 1.0,
        averageLatencyMs: 0,
        score: 1.0,
        healthy: scope === 'provider',
        quarantineRecommended: false
      };
    }

    const successCount = samples.filter((s) => s.success).length;
    const failureCount = sampleCount - successCount;
    const successRate = round(successCount / sampleCount);
    const totalLatency = samples.reduce((acc, s) => acc + s.latencyMs, 0);
    const averageLatencyMs = round(totalLatency / sampleCount);

    const latencyPenalty = Math.min(1.0, averageLatencyMs / (this.config.latencyReferenceMs * 2));
    const score = round(Math.max(0, (successRate * 0.7) + ((1 - latencyPenalty) * 0.3)));

    const healthy =
      sampleCount >= this.config.minSamples
        ? successRate >= this.config.minSuccessRate && score >= this.config.minScore
        : scope === 'provider';

    const quarantineRecommended =
      sampleCount >= this.config.minSamples && (!healthy || successRate < this.config.minSuccessRate);

    const lastSampleAt = samples[samples.length - 1]?.occurredAt;

    return {
      scope,
      providerId,
      ...(proxyId !== undefined ? { proxyId } : {}),
      sampleCount,
      successCount,
      failureCount,
      successRate,
      averageLatencyMs,
      score,
      healthy,
      quarantineRecommended,
      ...(lastSampleAt !== undefined ? { lastSampleAt } : {})
    };
  }
}

function keyFor(providerId: string, proxyId?: string): string {
  return proxyId ? `${providerId}:${proxyId}` : providerId;
}

function round(val: number): number {
  return Math.round(val * 10000) / 10000;
}
