/**
 * Actor Reference Template — protokol-7
 *
 * This file serves as a canonical implementation blueprint for new actors.
 * Copy this file to src/actors/<category>/<name>-actor.ts and adapt:
 * 1. Replace "template-actor" with your kebab-case actorType in src/api/types.ts
 * 2. Define your specific options and result interfaces
 * 3. Implement domain-specific parsing and extraction logic
 *
 * All security invariants (SSRF Guard, timeout, duration telemetry) are pre-wired.
 */

import type { ActorResult, ActorRunContext, ActorTask, ActorType, IActor } from "../api/types";
import { safeRedirectFetch } from "../network/safe-redirect-fetcher";
import { SSRFGuard } from "../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Mozilla/5.0 (compatible; Protokol7Scraper/1.0; +https://protokol-7.local)";

/**
 * Task options interface specific to this actor.
 */
export interface TemplateActorTaskOptions {
  timeoutMs?: number;
  query?: string;
  limit?: number;
  customHeaders?: Record<string, string>;
}

/**
 * Result data payload returned on successful extraction.
 */
export interface TemplateActorResult {
  sourceUrl: string;
  totalItems: number;
  items: Array<{
    id: string;
    title: string;
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

export class TemplateActor implements IActor<TemplateActorResult> {
  // Cast to ActorType allows template to compile before new type is registered in src/api/types.ts
  readonly actorType = "template-actor" as unknown as ActorType;
  readonly description =
    "Reference template demonstrating standard actor lifecycle, SSRF defense, and telemetry.";

  async run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<TemplateActorResult>> {
    const startTime = context?.startTime || Date.now();
    const options = (task.options || {}) as TemplateActorTaskOptions;
    const timeoutMs = options.timeoutMs || task.options?.timeoutMs || DEFAULT_TIMEOUT_MS;
    const allowLocalNetwork = process.env.NODE_ENV === "test";

    try {
      // 1. Initial SSRF validation on targetUrl if explicitly provided as HTTP URL
      if (
        task.targetUrl &&
        (task.targetUrl.startsWith("http://") || task.targetUrl.startsWith("https://"))
      ) {
        const initialSsrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
          allowLocalNetwork,
        });

        if (!initialSsrfCheck.valid) {
          return {
            taskId: task.taskId,
            actorType: this.actorType,
            status: "failed",
            statusCode: 403,
            errorMessage: `SSRF validation failed: ${initialSsrfCheck.reason}`,
            executionDurationMs: Date.now() - startTime,
          };
        }
      }

      // 2. Resolve target endpoint
      const endpoint = this.buildEndpointUrl(task.targetUrl, options);

      // 3. SSRF validation on resolved endpoint
      const ssrfCheck = await SSRFGuard.validateUrlWithDns(endpoint, {
        allowLocalNetwork,
      });

      if (!ssrfCheck.valid) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: 403,
          errorMessage: `SSRF validation failed on target endpoint: ${ssrfCheck.reason}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 4. Dispatch request with timeout and redirect handling
      const response = await safeRedirectFetch(endpoint, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/plain, */*",
          ...options.customHeaders,
        },
        timeoutMs,
        allowLocalNetwork,
      });

      if (!response.ok) {
        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "failed",
          statusCode: response.status,
          errorMessage: `Upstream request failed with HTTP ${response.status}: ${response.statusText}`,
          executionDurationMs: Date.now() - startTime,
        };
      }

      // 5. Parse and extract domain records
      const rawText = await response.text();
      const extractedData = this.parseResponse(rawText, endpoint);

      // 6. Return standardized success result with duration telemetry
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: extractedData,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      // 7. Structured error capture (never swallow exceptions)
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        statusCode: 500,
        errorMessage: error instanceof Error ? error.message : String(error),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Constructs the upstream target URL from task parameters.
   */
  private buildEndpointUrl(targetUrl?: string, options?: TemplateActorTaskOptions): string {
    if (targetUrl) {
      return targetUrl;
    }
    const query = encodeURIComponent(options?.query || "");
    return `https://api.example.com/v1/search?q=${query}&limit=${options?.limit || 10}`;
  }

  /**
   * Normalizes raw upstream content into the strongly-typed TemplateActorResult contract.
   */
  private parseResponse(rawContent: string, sourceUrl: string): TemplateActorResult {
    try {
      const parsed = JSON.parse(rawContent);
      const items = Array.isArray(parsed) ? parsed : parsed.items || [];
      return {
        sourceUrl,
        totalItems: items.length,
        items: items.map((item: Record<string, unknown>, index: number) => ({
          id: String(item.id || `item-${index}`),
          title: String(item.title || "Untitled"),
          content: String(item.content || item.body || ""),
          metadata:
            typeof item.metadata === "object"
              ? (item.metadata as Record<string, unknown>)
              : undefined,
        })),
      };
    } catch {
      // Fallback for plain text responses
      return {
        sourceUrl,
        totalItems: 1,
        items: [
          {
            id: "raw-1",
            title: "Plain Text Extraction",
            content: rawContent.trim(),
          },
        ],
      };
    }
  }
}
