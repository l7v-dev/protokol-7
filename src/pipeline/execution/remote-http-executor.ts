/**
 * Remote HTTP Execution Target.
 * Dispatches actor execution tasks to a remote Protokol-7 instance via REST API.
 */

import type { ExecutionResult, ExecutionTarget } from "./index";

export interface RemoteHttpExecutorOptions {
  endpoint: string;
  token?: string;
  fetchFn?: typeof fetch;
}

export class RemoteHttpExecutor implements ExecutionTarget {
  readonly name = "remote-http";
  private readonly endpoint: string;
  private readonly token?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: RemoteHttpExecutorOptions) {
    if (!options.endpoint) {
      throw new Error("RemoteHttpExecutor requires a non-empty endpoint URL.");
    }
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchFn = options.fetchFn || fetch;
  }

  async run(actorId: string, config: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const targetUrl = `${this.endpoint}/api/v1/store/actors/${encodeURIComponent(actorId)}/run`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await this.fetchFn(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          success: false,
          items: [],
          itemCount: 0,
          durationMs: Date.now() - startTime,
          error: `Remote execution returned HTTP ${response.status}: ${errorText || response.statusText}`,
        };
      }

      const body = (await response.json()) as Record<string, unknown>;
      const items = this.extractItems(body);

      return {
        success: true,
        items,
        itemCount: items.length,
        durationMs: Date.now() - startTime,
        metadata: {
          endpoint: this.endpoint,
          statusCode: response.status,
          remoteRunId: body.runId,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        items: [],
        itemCount: 0,
        durationMs: Date.now() - startTime,
        error: `Network failure contacting remote endpoint ${this.endpoint}: ${message}`,
      };
    }
  }

  private extractItems(body: Record<string, unknown>): unknown[] {
    if (Array.isArray(body)) {
      return body;
    }
    if (body.run && typeof body.run === "object") {
      const runObj = body.run as Record<string, unknown>;
      if (Array.isArray(runObj.items)) return runObj.items;
      if (Array.isArray(runObj.results)) return runObj.results;
      if (runObj.output && Array.isArray((runObj.output as Record<string, unknown>).items)) {
        return (runObj.output as Record<string, unknown>).items as unknown[];
      }
    }
    if (Array.isArray(body.items)) {
      return body.items;
    }
    if (Array.isArray(body.results)) {
      return body.results;
    }
    if (body.data && Array.isArray((body.data as Record<string, unknown>).items)) {
      return (body.data as Record<string, unknown>).items as unknown[];
    }
    return [body];
  }
}
