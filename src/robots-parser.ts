/**
 * Robots Exclusion Protocol (robots.txt) parser and policy engine.
 * Parses User-agent groups, Disallow/Allow directives, and Crawl-delay rules
 * with origin-level in-memory caching and SSRF validation.
 */

import { SSRFGuard } from "./ssrf-guard";

export interface RobotsRule {
  type: "allow" | "disallow";
  pattern: string;
}

export interface UserAgentGroup {
  userAgents: string[];
  rules: RobotsRule[];
  crawlDelaySeconds?: number;
}

export class RobotsParser {
  private readonly groups: UserAgentGroup[] = [];
  private static readonly cache = new Map<string, { parser: RobotsParser; expiresAt: number }>();
  private static readonly CACHE_TTL_MS = 3600000; // 1 hour

  constructor(content?: string) {
    if (content) {
      this.parse(content);
    }
  }

  /**
   * Parses raw robots.txt markup into structured User-agent groups.
   */
  parse(content: string): void {
    const lines = content.split(/\r?\n/);
    let currentUserAgents: string[] = [];
    let currentRules: RobotsRule[] = [];
    let currentCrawlDelay: number | undefined;

    const commitGroup = () => {
      if (currentUserAgents.length > 0) {
        this.groups.push({
          userAgents: [...currentUserAgents],
          rules: [...currentRules],
          crawlDelaySeconds: currentCrawlDelay,
        });
      }
      currentUserAgents = [];
      currentRules = [];
      currentCrawlDelay = undefined;
    };

    for (const rawLine of lines) {
      // Strip comments and trim whitespace
      const commentIdx = rawLine.indexOf("#");
      const line = (commentIdx !== -1 ? rawLine.slice(0, commentIdx) : rawLine).trim();
      if (!line) continue;

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;

      const field = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();

      if (field === "user-agent") {
        // If we previously had rules, this begins a new group
        if (currentRules.length > 0 || currentCrawlDelay !== undefined) {
          commitGroup();
        }
        currentUserAgents.push(value.toLowerCase());
      } else if (field === "disallow") {
        if (value === "") {
          // Empty Disallow means allow all
          currentRules.push({ type: "allow", pattern: "/" });
        } else {
          currentRules.push({ type: "disallow", pattern: value });
        }
      } else if (field === "allow") {
        if (value !== "") {
          currentRules.push({ type: "allow", pattern: value });
        }
      } else if (field === "crawl-delay") {
        const parsedDelay = parseFloat(value);
        if (!Number.isNaN(parsedDelay) && parsedDelay >= 0) {
          currentCrawlDelay = parsedDelay;
        }
      }
    }

    commitGroup();
  }

  /**
   * Finds the best matching UserAgentGroup for a given client User-Agent.
   * Matches specific bot tokens first, then falls back to wildcard '*'.
   */
  private findMatchingGroup(userAgent: string): UserAgentGroup | undefined {
    const targetUa = userAgent.toLowerCase();

    // 1. Look for specific token match (e.g. 'agentsmithbot')
    for (const group of this.groups) {
      for (const ua of group.userAgents) {
        if (ua !== "*" && targetUa.includes(ua)) {
          return group;
        }
      }
    }

    // 2. Fall back to wildcard group '*'
    return this.groups.find((g) => g.userAgents.includes("*"));
  }

  /**
   * Matches a URL pathname against a robots.txt rule pattern.
   * Supports standard prefix matching, '*' wildcards, and '$' end anchors.
   */
  private matchPattern(pathname: string, pattern: string): boolean {
    if (pattern === "/" || pattern === "") return true;

    // Convert pattern to regex
    const hasEndAnchor = pattern.endsWith("$");
    const cleanPattern = hasEndAnchor ? pattern.slice(0, -1) : pattern;

    // Escape regex special characters except '*'
    const escaped = cleanPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");

    const regex = new RegExp(`^${escaped}${hasEndAnchor ? "$" : ""}`);
    return regex.test(pathname);
  }

  /**
   * Checks whether the specified URL or path is allowed to be crawled.
   */
  isAllowed(urlOrPath: string, userAgent = "AgentSmithBot"): boolean {
    let targetPath = urlOrPath;
    try {
      const parsed = new URL(
        urlOrPath.startsWith("http") ? urlOrPath : `https://example.com${urlOrPath}`
      );
      targetPath = `${parsed.pathname || "/"}${parsed.search || ""}`;
    } catch {
      // Keep as-is if parsing fails
    }

    const group = this.findMatchingGroup(userAgent);
    if (!group || group.rules.length === 0) {
      return true; // No rules mean unrestricted access
    }

    // Evaluate matching rules; longest matching pattern wins
    let bestMatch: RobotsRule | null = null;
    let longestLength = -1;

    for (const rule of group.rules) {
      if (this.matchPattern(targetPath, rule.pattern)) {
        if (rule.pattern.length > longestLength) {
          longestLength = rule.pattern.length;
          bestMatch = rule;
        }
      }
    }

    if (!bestMatch) {
      return true;
    }

    return bestMatch.type === "allow";
  }

  /**
   * Retrieves crawl delay in seconds specified in robots.txt for the given User-Agent.
   */
  getCrawlDelay(userAgent = "AgentSmithBot"): number | undefined {
    const group = this.findMatchingGroup(userAgent);
    return group?.crawlDelaySeconds;
  }

  /**
   * Fetches, parses, and caches robots.txt for the target URL origin with SSRF protection.
   */
  static async fetchForOrigin(
    targetUrl: string,
    options?: { timeoutMs?: number; allowLocalNetwork?: boolean }
  ): Promise<RobotsParser> {
    let origin: string;
    try {
      const parsed = new URL(targetUrl);
      origin = parsed.origin;
    } catch {
      return new RobotsParser();
    }

    const now = Date.now();
    const cached = this.cache.get(origin);
    if (cached && cached.expiresAt > now) {
      return cached.parser;
    }

    const robotsUrl = `${origin}/robots.txt`;

    // Validate SSRF before making request
    const ssrfCheck = SSRFGuard.validateUrl(robotsUrl, {
      allowLocalNetwork: options?.allowLocalNetwork ?? process.env.NODE_ENV === "test",
    });

    if (!ssrfCheck.valid) {
      const fallback = new RobotsParser();
      this.cache.set(origin, { parser: fallback, expiresAt: now + this.CACHE_TTL_MS });
      return fallback;
    }

    try {
      const response = await fetch(robotsUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AgentSmithBot/1.0; +https://agent-smith.local)",
        },
        signal: AbortSignal.timeout(options?.timeoutMs ?? 5000),
      });

      if (!response.ok) {
        // If robots.txt returns 404 or error, everything is allowed
        const emptyParser = new RobotsParser();
        this.cache.set(origin, { parser: emptyParser, expiresAt: now + this.CACHE_TTL_MS });
        return emptyParser;
      }

      const text = await response.text();
      const parser = new RobotsParser(text);
      this.cache.set(origin, { parser, expiresAt: now + this.CACHE_TTL_MS });
      return parser;
    } catch {
      const fallbackParser = new RobotsParser();
      this.cache.set(origin, { parser: fallbackParser, expiresAt: now + this.CACHE_TTL_MS });
      return fallbackParser;
    }
  }

  /**
   * Clears the robots.txt in-memory cache.
   */
  static clearCache(): void {
    this.cache.clear();
  }
}
