/**
 * Fast wildcard pattern matcher for filtering URLs during crawling and scraping.
 */

export function isValidUrlPattern(pattern: string): boolean {
  if (!pattern || typeof pattern !== "string") return false;
  const trimmed = pattern.trim();
  if (trimmed.length === 0 || trimmed.length > 255) return false;
  // We allow up to one or two asterisks
  return trimmed.split("*").length <= 3;
}

export function matchUrlPattern(url: string, pattern: string): boolean {
  const normalizedUrl = url.toLowerCase().trim();
  const normalizedPattern = pattern.toLowerCase().trim();

  // Match all
  if (normalizedPattern === "*") {
    return true;
  }

  // Exact or substring match if no wildcard
  if (!normalizedPattern.includes("*")) {
    return normalizedUrl.includes(normalizedPattern);
  }

  // Starts with * -> ends with suffix
  if (normalizedPattern.startsWith("*") && !normalizedPattern.slice(1).includes("*")) {
    return normalizedUrl.endsWith(normalizedPattern.slice(1));
  }

  // Ends with * -> starts with prefix
  if (normalizedPattern.endsWith("*") && !normalizedPattern.slice(0, -1).includes("*")) {
    return normalizedUrl.startsWith(normalizedPattern.slice(0, -1));
  }

  // Asterisk in middle: prefix*suffix
  const parts = normalizedPattern.split("*");
  if (parts.length === 2) {
    const [prefix, suffix] = parts;
    return normalizedUrl.startsWith(prefix) && normalizedUrl.endsWith(suffix);
  }

  // Fallback regex conversion for multi-wildcard
  try {
    const escaped = normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(normalizedUrl);
  } catch {
    return false;
  }
}
