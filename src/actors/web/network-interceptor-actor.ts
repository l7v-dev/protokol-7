import { BrowserPool, type PooledBrowserSession } from "../../browser/browser-pool";
import type {
  ActorResult,
  ActorRunContext,
  ActorTask,
  IActor,
  InterceptedApiResponse,
  NetworkInterceptorResult,
  NetworkInterceptorTaskOptions,
} from "../../api/types";
import { SSRFGuard } from "../../network/ssrf-guard";
import { matchUrlPattern } from "../../network/url-pattern-matcher";

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_CAPTURED = 50;
const DEFAULT_IDLE_WAIT_MS = 1000;

export class NetworkInterceptorActor implements IActor<NetworkInterceptorResult> {
  readonly actorType = "network-interceptor" as const;
  readonly description =
    "Headless browser actor that intercepts and extracts background XHR and Fetch JSON API network responses.";

  async run(
    task: ActorTask,
    _context: ActorRunContext
  ): Promise<ActorResult<NetworkInterceptorResult>> {
    const startTime = Date.now();
    const options: NetworkInterceptorTaskOptions = task.options?.networkInterceptorOptions ?? {};
    const timeoutMs = options.timeoutMs ?? task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxCaptured = options.maxCapturedRequests ?? DEFAULT_MAX_CAPTURED;
    const idleWaitMs = options.waitForNetworkIdleMs ?? DEFAULT_IDLE_WAIT_MS;

    const allowLocalNetwork = process.env.NODE_ENV === "test";
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(task.targetUrl, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: `SSRF validation failed: ${ssrfCheck.reason}`,
        executionDurationMs: Date.now() - startTime,
      };
    }

    let session: PooledBrowserSession | undefined;

    try {
      session = await BrowserPool.acquireSession({
        blockAssets: false,
        timeoutMs,
        allowLocalNetwork,
      });

      const page = session.page;
      const capturedResponses: InterceptedApiResponse[] = [];
      const inFlightResponses = new Set<Promise<void>>();

      page.on("response", (response) => {
        if (capturedResponses.length >= maxCaptured) return;

        const op = (async () => {
          const url = response.url();
          if (options.urlPatterns && options.urlPatterns.length > 0) {
            const matches = options.urlPatterns.some((pattern) => matchUrlPattern(url, pattern));
            if (!matches) return;
          }

          const headers = response.headers();
          const contentType = headers["content-type"] || "";
          const isJson = contentType.includes("application/json") || url.endsWith(".json");

          if (isJson || (options.urlPatterns && options.urlPatterns.length > 0)) {
            try {
              const responseJson = await response.json();
              const request = response.request();
              let requestPayload: unknown;

              const postData = request.postData();
              if (postData) {
                try {
                  requestPayload = JSON.parse(postData);
                } catch {
                  requestPayload = postData;
                }
              }

              if (capturedResponses.length < maxCaptured) {
                capturedResponses.push({
                  url,
                  method: request.method(),
                  statusCode: response.status(),
                  headers: options.captureHeaders ? headers : {},
                  requestPayload,
                  responseJson,
                  timestamp: Date.now(),
                });
              }
            } catch {
              // Non-JSON or streaming payload skipped
            }
          }
        })();

        inFlightResponses.add(op);
        op.finally(() => inFlightResponses.delete(op));
      });

      await page.goto(task.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });

      try {
        await page.waitForLoadState("networkidle", { timeout: Math.min(timeoutMs, 5000) });
      } catch {
        // Fallback gracefully if continuous polling prevents idle
      }

      if (idleWaitMs > 0) {
        await page.waitForTimeout(idleWaitMs);
      }

      // Await in-flight response processing before tearing down browser context
      if (inFlightResponses.size > 0) {
        await Promise.allSettled(Array.from(inFlightResponses));
      }

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode: 200,
        data: {
          pageUrl: task.targetUrl,
          totalCaptured: capturedResponses.length,
          responses: capturedResponses,
        },
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        executionDurationMs: Date.now() - startTime,
      };
    } finally {
      if (session) {
        await session.release();
      }
    }
  }
}
