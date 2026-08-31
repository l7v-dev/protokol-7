export type CounterName =
  | 'http_requests_total'
  | 'http_request_errors_total'
  | 'reliability_events_total'
  | 'reliability_failures_total'
  | 'reliability_retries_total'
  | 'reliability_escalations_total'
  | 'reliability_circuit_blocks_total';

type CounterKey = `${CounterName}:${string}`;

export class MetricsRegistry {
  private readonly counters = new Map<CounterKey, number>();

  public increment(name: CounterName, label: string): void {
    const key: CounterKey = `${name}:${label}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  public snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters.entries());
  }
}
