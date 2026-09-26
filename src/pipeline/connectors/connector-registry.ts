/**
 * Connector Registry managing storage and remote execution connectors.
 */

import { type ConnectorConfig, PipelineError } from "../schema";
import { resolveConnectorConfig } from "./env-resolver";

export class ConnectorRegistry {
  private readonly connectors = new Map<string, ConnectorConfig>();

  constructor(initialConnectors?: Record<string, ConnectorConfig>) {
    if (initialConnectors) {
      for (const [name, config] of Object.entries(initialConnectors)) {
        this.register(name, config);
      }
    }
  }

  register(name: string, config: ConnectorConfig): void {
    this.connectors.set(name, config);
  }

  has(name: string): boolean {
    return this.connectors.has(name);
  }

  get(name: string): ConnectorConfig | undefined {
    return this.connectors.get(name);
  }

  /**
   * Retrieves and resolves a connector configuration by evaluating all environment variable tokens.
   */
  resolve<T extends ConnectorConfig = ConnectorConfig>(
    name: string,
    env: NodeJS.ProcessEnv = process.env
  ): T {
    const raw = this.connectors.get(name);
    if (!raw) {
      const available = Array.from(this.connectors.keys()).sort().join(", ");
      throw new PipelineError(
        `Connector '${name}' is not registered in connector registry. Available connectors: ${available || "none"}`,
        "CONNECTOR_NOT_FOUND",
        { requestedConnector: name, availableCount: this.connectors.size }
      );
    }

    return resolveConnectorConfig(raw, env) as T;
  }

  list(): Array<{ name: string; type: string }> {
    return Array.from(this.connectors.entries()).map(([name, config]) => ({
      name,
      type: config.type,
    }));
  }
}
