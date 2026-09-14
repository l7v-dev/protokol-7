/**
 * Utility for sanitizing, validating, and normalizing URLs for scraping actors.
 * Integrates SSRFGuard for defense against private and metadata networks.
 */

import { SSRFGuard, SSRFGuardOptions } from "./ssrf-guard";

export interface UrlNormalizationResult {
  valid: boolean;
  url?: string;
  errorMessage?: string;
}

export function normalizeUrl(
  rawUrl: string,
  options?: SSRFGuardOptions
): UrlNormalizationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, errorMessage: "URL cannot be empty." };
  }

  let trimmed = rawUrl.trim();

  // If protocol missing, default to https://
  if (!trimmed.includes("://")) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);

    // Validate protocol
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        valid: false,
        errorMessage: `Invalid protocol '${parsed.protocol}'. Only HTTP and HTTPS are supported.`,
      };
    }

    // SSRF & private IP check
    const effectiveOptions = options ?? {
      allowLocalNetwork: process.env.NODE_ENV === "test",
    };

    const ssrfCheck = SSRFGuard.validateUrl(trimmed, effectiveOptions);
    if (!ssrfCheck.valid) {
      return {
        valid: false,
        errorMessage: ssrfCheck.reason ?? "Target URL blocked by security policy.",
      };
    }

    const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const TLD_REGEX = /\.[a-zA-Z]{2,}$/;
    const isLocalhost = parsed.hostname === "localhost";
    const isIpv4 = IPV4_REGEX.test(parsed.hostname);
    const hasValidTld = TLD_REGEX.test(parsed.hostname);

    if (!isLocalhost && !isIpv4 && !hasValidTld) {
      return {
        valid: false,
        errorMessage: `Invalid hostname or top-level domain in '${parsed.hostname}'.`,
      };
    }

    // Strip trailing slash from pathname
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    } else if (pathname === "/") {
      pathname = "";
    }

    const normalized = `${parsed.origin}${pathname}${parsed.search}`;
    return { valid: true, url: normalized };
  } catch (error) {
    return {
      valid: false,
      errorMessage: error instanceof Error ? error.message : "Malformed URL.",
    };
  }
}
