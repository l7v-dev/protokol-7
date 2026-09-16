/**
 * Upstream HTTP/SOCKS5 proxy manager and rotation engine.
 * Manages proxy pools, enforces rotation strategies (round-robin, random, domain-sticky),
 * tracks proxy health with failure quarantine, and supplies undici Dispatchers.
 */

import { ProxyAgent } from "undici";

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export type ProxyRotationStrategy = "round-robin" | "random" | "sticky-domain";

export interface ProxyManagerOptions {
  quarantineDurationMs?: number;
  maxConsecutiveFailures?: number;
}

interface ProxyHealthState {
  config: ProxyConfig;
  consecutiveFailures: number;
  quarantinedUntil: number;
  totalRequests: number;
  totalSuccesses: number;
}

export class ProxyManager {
  private readonly proxies = new Map<string, ProxyHealthState>();
  private readonly domainStickyMap = new Map<string, string>();
  private readonly dispatcherCache = new Map<string, ProxyAgent>();
  private roundRobinIndex = 0;

  private readonly quarantineDurationMs: number;
  private readonly maxConsecutiveFailures: number;

  constructor(options?: ProxyManagerOptions) {
    this.quarantineDurationMs = options?.quarantineDurationMs ?? 300000; // 5 minutes
    this.maxConsecutiveFailures = options?.maxConsecutiveFailures ?? 3;
  }

  /**
   * Parses and adds a proxy to the active pool.
   */
  addProxy(proxyInput: string | ProxyConfig): ProxyConfig {
    let config: ProxyConfig;

    if (typeof proxyInput === "string") {
      const parsed = new URL(proxyInput);
      const server = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
      config = {
        server,
        username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      };
    } else {
      config = { ...proxyInput };
    }

    const key = this.getProxyKey(config);
    if (!this.proxies.has(key)) {
      this.proxies.set(key, {
        config,
        consecutiveFailures: 0,
        quarantinedUntil: 0,
        totalRequests: 0,
        totalSuccesses: 0,
      });
    }

    return config;
  }

  /**
   * Adds an array of proxies to the pool.
   */
  addProxies(proxyList: Array<string | ProxyConfig>): void {
    for (const p of proxyList) {
      this.addProxy(p);
    }
  }

  /**
   * Generates a unique string key identifying a proxy.
   */
  private getProxyKey(config: ProxyConfig): string {
    return `${config.server}|${config.username ?? ""}`;
  }

  /**
   * Returns healthy (non-quarantined) proxies from pool.
   */
  getHealthyProxies(): ProxyConfig[] {
    const now = Date.now();
    const healthy: ProxyConfig[] = [];

    for (const state of this.proxies.values()) {
      if (state.quarantinedUntil <= now) {
        healthy.push(state.config);
      }
    }

    return healthy;
  }

  /**
   * Selects a proxy from the pool according to the requested strategy.
   */
  getProxy(options?: {
    domain?: string;
    strategy?: ProxyRotationStrategy;
  }): ProxyConfig | undefined {
    const healthy = this.getHealthyProxies();
    if (healthy.length === 0) {
      return undefined;
    }

    const strategy = options?.strategy ?? "round-robin";

    if (strategy === "sticky-domain" && options?.domain) {
      const normalizedDomain = options.domain.toLowerCase();
      const existingKey = this.domainStickyMap.get(normalizedDomain);
      if (existingKey) {
        const existingState = this.proxies.get(existingKey);
        if (existingState && existingState.quarantinedUntil <= Date.now()) {
          return existingState.config;
        }
      }

      // Assign new proxy to domain
      const chosen = healthy[Math.floor(Math.random() * healthy.length)];
      this.domainStickyMap.set(normalizedDomain, this.getProxyKey(chosen));
      return chosen;
    }

    if (strategy === "random") {
      return healthy[Math.floor(Math.random() * healthy.length)];
    }

    // Default: round-robin
    const proxy = healthy[this.roundRobinIndex % healthy.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % healthy.length;
    return proxy;
  }

  /**
   * Records a request failure against a proxy.
   * If consecutive failures exceed threshold, quarantines the proxy temporarily.
   */
  recordFailure(proxy: ProxyConfig | string): void {
    const key = typeof proxy === "string" ? proxy : this.getProxyKey(proxy);
    const state = this.proxies.get(key);
    if (!state) return;

    state.consecutiveFailures += 1;
    state.totalRequests += 1;

    if (state.consecutiveFailures >= this.maxConsecutiveFailures) {
      state.quarantinedUntil = Date.now() + this.quarantineDurationMs;
    }
  }

  /**
   * Records a successful request, resetting failure counters.
   */
  recordSuccess(proxy: ProxyConfig | string): void {
    const key = typeof proxy === "string" ? proxy : this.getProxyKey(proxy);
    const state = this.proxies.get(key);
    if (!state) return;

    state.consecutiveFailures = 0;
    state.quarantinedUntil = 0;
    state.totalRequests += 1;
    state.totalSuccesses += 1;
  }

  /**
   * Retrieves or creates a cached undici ProxyAgent for Node.js native fetch.
   */
  getDispatcher(proxy: ProxyConfig): ProxyAgent {
    const key = this.getProxyKey(proxy);
    let dispatcher = this.dispatcherCache.get(key);

    if (!dispatcher) {
      const proxyUrl = new URL(proxy.server);
      if (proxy.username && proxy.password) {
        proxyUrl.username = encodeURIComponent(proxy.username);
        proxyUrl.password = encodeURIComponent(proxy.password);
      }

      dispatcher = new ProxyAgent(proxyUrl.toString());
      this.dispatcherCache.set(key, dispatcher);
    }

    return dispatcher;
  }

  /**
   * Returns total count of proxies in pool.
   */
  size(): number {
    return this.proxies.size;
  }

  /**
   * Clears all proxies and caches.
   */
  clear(): void {
    this.proxies.clear();
    this.domainStickyMap.clear();
    this.dispatcherCache.clear();
    this.roundRobinIndex = 0;
  }
}

export const globalProxyManager = new ProxyManager();
