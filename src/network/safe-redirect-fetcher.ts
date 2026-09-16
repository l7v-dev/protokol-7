/**
 * SSRF-guarded HTTP fetcher with safe manual redirect traversal.
 * Resolves redirects iteratively, verifies destination IPs against private/cloud metadata
 * boundaries at every hop, and prevents redirect loops and DNS rebinding attacks.
 */

import { globalProxyManager, type ProxyConfig } from "./proxy-manager";
import { type RetryOptions, withRetry } from "./retry-handler";
import { SSRFGuard } from "./ssrf-guard";

export interface SafeFetchOptions extends RequestInit {
  maxRedirects?: number;
  allowLocalNetwork?: boolean;
  timeoutMs?: number;
  proxy?: ProxyConfig;
  retryOptions?: RetryOptions;
}

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const DEFAULT_MAX_REDIRECTS = 5;

export async function safeRedirectFetch(
  initialUrl: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const allowLocalNetwork = options.allowLocalNetwork ?? false;
  const timeoutMs = options.timeoutMs;

  let currentUrl = initialUrl;
  let currentMethod = (options.method || "GET").toUpperCase();
  let currentBody = options.body;
  const currentHeaders = new Headers(options.headers || {});

  const visitedUrls = new Set<string>();
  visitedUrls.add(currentUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // 1. Validate destination URL and DNS resolution before dispatching network request
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(currentUrl, {
      allowLocalNetwork,
    });
    if (!ssrfCheck.valid) {
      throw new Error(`SSRF validation failed: ${ssrfCheck.reason ?? "Prohibited destination"}`);
    }

    const controller = new AbortController();
    let timeoutTimer: NodeJS.Timeout | undefined;

    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);
    }

    // Combine user signal if provided
    const signals = [controller.signal];
    if (options.signal) {
      signals.push(options.signal);
    }
    const combinedSignal =
      typeof AbortSignal.any === "function" ? AbortSignal.any(signals) : controller.signal;

    const dispatcher = options.proxy ? globalProxyManager.getDispatcher(options.proxy) : undefined;

    let response: Response;
    try {
      const executeAttempt = async () => {
        return await fetch(currentUrl, {
          ...options,
          method: currentMethod,
          headers: currentHeaders,
          body: currentBody,
          redirect: "manual",
          signal: combinedSignal,
          // undici ProxyAgent dispatcher for upstream proxy routing
          dispatcher,
        } as RequestInit);
      };

      if (options.retryOptions && (options.retryOptions.maxRetries ?? 0) > 0) {
        response = await withRetry(executeAttempt, options.retryOptions);
      } else {
        response = await executeAttempt();
      }
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
      }
    }

    // If not a redirect, return final response
    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return response;
    }

    // Extract redirect location
    const location = response.headers.get("location");
    if (!location) {
      return response; // No location header provided, return as-is
    }

    // Resolve relative or absolute target URL
    let nextUrl: string;
    try {
      nextUrl = new URL(location, currentUrl).toString();
    } catch {
      throw new Error(`Malformed redirect Location header: '${location}'`);
    }

    if (visitedUrls.has(nextUrl)) {
      throw new Error(`Redirect loop detected at URL: '${nextUrl}'`);
    }
    visitedUrls.add(nextUrl);

    // RFC 9110 Method rewrites on redirects:
    // 303: Always rewrite to GET
    // 301, 302: Commonly rewritten to GET if previously POST
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && currentMethod === "POST")
    ) {
      currentMethod = "GET";
      currentBody = undefined;
      currentHeaders.delete("content-length");
      currentHeaders.delete("content-type");
    }

    currentUrl = nextUrl;
  }

  throw new Error(`Maximum redirect limit of ${maxRedirects} exceeded.`);
}
