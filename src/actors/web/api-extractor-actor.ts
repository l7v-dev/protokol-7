/**
 * High-throughput REST API extraction actor.
 * Provides authenticated HTTP querying, multi-mode pagination,
 * JSON schema projection, and SSRF security validation.
 */

import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  ApiExtractorResult,
  ApiExtractorTaskOptions,
  IActor,
} from "../../api/types";
import { safeRedirectFetch } from "../../network/safe-redirect-fetcher";
import { SSRFGuard } from "../../network/ssrf-guard";

const DEFAULT_TIMEOUT_MS = 25000;
const USER_AGENT = "Protokol7ApiExtractor/1.0 (+https://protokol-7.local)";

export class ApiExtractorActor implements IActor<ApiExtractorResult> {
  readonly actorType = "api-extractor" as const;
  readonly description =
    "REST and JSON API extractor supporting Bearer/API-key auth, multi-mode pagination, and field projection.";

  /**
   * Helper to retrieve nested values by dot notation (e.g., 'data.items' or 'meta.next_cursor').
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== "object") return undefined;
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  /**
   * Filters object or array of objects to only retain specified keys.
   */
  private applyProjection(data: unknown, keys?: string[]): unknown {
    if (!keys || keys.length === 0 || !data) return data;

    const projectObject = (item: Record<string, unknown>) => {
      const projected: Record<string, unknown> = {};
      for (const key of keys) {
        if (key.includes(".")) {
          projected[key] = this.getNestedValue(item, key);
        } else if (key in item) {
          projected[key] = item[key];
        }
      }
      return projected;
    };

    if (Array.isArray(data)) {
      return data.map((item) =>
        item && typeof item === "object" ? projectObject(item as Record<string, unknown>) : item
      );
    }

    if (typeof data === "object") {
      return projectObject(data as Record<string, unknown>);
    }

    return data;
  }

  async run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ApiExtractorResult>> {
    const startTime = Date.now();
    const timeout = task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const apiOptions: ApiExtractorTaskOptions = task.options?.apiOptions ?? {};

    // SSRF Validation
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, {
      allowLocalNetwork: process.env.NODE_ENV === "test",
    });

    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: ssrfCheck.reason ?? "Target API URL blocked by security policy.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const method = (apiOptions.method ?? "GET").toUpperCase();
    const pagination = apiOptions.pagination;

    try {
      if (!pagination || pagination.maxPages === 1) {
        // Single Request Execution
        const result = await this.executeRequest(task.targetUrl, method, apiOptions, timeout);

        const projectedData = this.applyProjection(result.data, apiOptions.projectionKeys);

        return {
          taskId: task.taskId,
          actorType: this.actorType,
          status: "completed",
          statusCode: result.status,
          data: {
            statusCode: result.status,
            headers: result.headers,
            data: projectedData,
            itemCount: Array.isArray(projectedData) ? projectedData.length : undefined,
          },
          executionDurationMs: Date.now() - startTime,
        };
      }

      // Paginated Execution Loop
      const accumulatedItems: unknown[] = [];
      let currentPage = 1;
      let currentOffset = 0;
      let totalPagesFetched = 0;
      let nextCursor: string | undefined;
      const maxPages = pagination.maxPages ?? 5;
      const pageSize = pagination.pageSize ?? 20;
      let lastStatusCode = 200;
      let lastHeaders: Record<string, string> = {};

      for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
        const urlObj = new URL(task.targetUrl);

        if (pagination.type === "page") {
          const pageParam = pagination.pageParam ?? "page";
          const limitParam = pagination.limitParam ?? "limit";
          urlObj.searchParams.set(pageParam, String(currentPage));
          urlObj.searchParams.set(limitParam, String(pageSize));
        } else if (pagination.type === "offset") {
          const offsetParam = pagination.pageParam ?? "offset";
          const limitParam = pagination.limitParam ?? "limit";
          urlObj.searchParams.set(offsetParam, String(currentOffset));
          urlObj.searchParams.set(limitParam, String(pageSize));
        } else if (pagination.type === "cursor") {
          if (pageIdx > 0 && !nextCursor) {
            break; // No further cursor
          }
          if (nextCursor) {
            const cursorParam = pagination.pageParam ?? "cursor";
            urlObj.searchParams.set(cursorParam, nextCursor);
          }
        }

        const pageRes = await this.executeRequest(urlObj.toString(), method, apiOptions, timeout);
        lastStatusCode = pageRes.status;
        lastHeaders = pageRes.headers;

        if (pageRes.status < 200 || pageRes.status >= 300) {
          break;
        }

        totalPagesFetched++;
        const rawPageData = pageRes.data;

        // Extract items array from page data
        let pageItems: unknown[] = [];
        if (Array.isArray(rawPageData)) {
          pageItems = rawPageData;
        } else if (rawPageData && typeof rawPageData === "object") {
          // Look for items array in common fields: data, items, results
          const record = rawPageData as Record<string, unknown>;
          const candidate = record.data || record.items || record.results;
          if (Array.isArray(candidate)) {
            pageItems = candidate;
          } else {
            pageItems = [rawPageData];
          }
        }

        accumulatedItems.push(...pageItems);

        // Check cursor extraction
        if (pagination.type === "cursor" && pagination.cursorPath) {
          const extractedCursor = this.getNestedValue(rawPageData, pagination.cursorPath);
          nextCursor = typeof extractedCursor === "string" ? extractedCursor : undefined;
        }

        // Check if page returned fewer items than requested
        if (pageItems.length < pageSize && pagination.type !== "cursor") {
          break;
        }

        currentPage += 1;
        currentOffset += pageSize;
      }

      const finalProjected = this.applyProjection(accumulatedItems, apiOptions.projectionKeys);

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: lastStatusCode,
        data: {
          statusCode: lastStatusCode,
          headers: lastHeaders,
          data: finalProjected,
          itemCount: Array.isArray(finalProjected) ? finalProjected.length : undefined,
          paginationMetadata: {
            totalPagesFetched,
            hasMore: !!nextCursor,
            nextCursor,
          },
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const isTimeout =
        error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async executeRequest(
    url: string,
    method: string,
    options: ApiExtractorTaskOptions,
    timeoutMs: number
  ): Promise<{ status: number; headers: Record<string, string>; data: unknown }> {
    const urlObj = new URL(url);

    // Append queryParams
    if (options.queryParams) {
      for (const [key, val] of Object.entries(options.queryParams)) {
        if (val !== undefined && val !== null) {
          urlObj.searchParams.set(key, String(val));
        }
      }
    }

    // Prepare headers
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...options.headers,
    };

    // Inject Bearer Token
    if (options.bearerToken) {
      headers.Authorization = `Bearer ${options.bearerToken}`;
    }

    // Inject API Key
    if (options.apiKey) {
      if (options.apiKey.in === "query") {
        urlObj.searchParams.set(options.apiKey.name, options.apiKey.value);
      } else {
        headers[options.apiKey.name] = options.apiKey.value;
      }
    }

    // Body handling
    let bodyPayload: string | undefined;
    if (method !== "GET" && method !== "HEAD" && options.body !== undefined) {
      bodyPayload = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }

    const response = await safeRedirectFetch(urlObj.toString(), {
      method,
      headers,
      body: bodyPayload,
      timeoutMs,
      allowLocalNetwork: process.env.NODE_ENV === "test",
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const contentType = response.headers.get("content-type") || "";
    let data: unknown;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      status: response.status,
      headers: responseHeaders,
      data,
    };
  }
}
