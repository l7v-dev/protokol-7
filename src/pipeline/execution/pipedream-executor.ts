/**
 * Pipedream Remote Execution Target.
 * Dispatches extraction payloads to Pipedream webhook workflows for cloud orchestration.
 */

import type { ExecutionResult, ExecutionTarget } from "./index";

export interface PipedreamExecutorOptions {
  webhookUrl: string;
  token?: string;
  fetchFn?: typeof fetch;
}

export class PipedreamExecutor implements ExecutionTarget {
  readonly name = "pipedream";
  private readonly webhookUrl: string;
  private readonly token?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: PipedreamExecutorOptions) {
    if (!options.webhookUrl) {
      throw new Error("PipedreamExecutor requires a valid webhookUrl.");
    }
    this.webhookUrl = options.webhookUrl;
    this.token = options.token;
    this.fetchFn = options.fetchFn || fetch;
  }

  async run(actorId: string, config: Record<string, unknown>): Promise<ExecutionResult> {
    const startTime = Date.now();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const payload = {
      actorId,
      config,
      dispatchedAt: new Date().toISOString(),
    };

    try {
      const response = await this.fetchFn(this.webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        return {
          success: false,
          items: [],
          itemCount: 0,
          durationMs: Date.now() - startTime,
          error: `Pipedream trigger returned HTTP ${response.status}: ${errorText || response.statusText}`,
        };
      }

      let body: unknown = {};
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await response.json();
      }

      const items = Array.isArray(body)
        ? body
        : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>).items)
          ? ((body as Record<string, unknown>).items as unknown[])
          : [body];

      return {
        success: true,
        items,
        itemCount: items.length,
        durationMs: Date.now() - startTime,
        metadata: {
          webhookUrl: this.webhookUrl,
          statusCode: response.status,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        items: [],
        itemCount: 0,
        durationMs: Date.now() - startTime,
        error: `Pipedream execution dispatch failed: ${message}`,
      };
    }
  }
}
