/**
 * Server-Side Request Forgery (SSRF) and Private Network Guard.
 * Validates URLs and IP addresses to prevent access to internal networks,
 * loopback devices, and cloud instance metadata endpoints.
 */

import * as dns from "node:dns/promises";
import * as net from "node:net";

export interface SSRFValidationResult {
  valid: boolean;
  hostname?: string;
  ip?: string;
  reason?: string;
}

export interface SSRFGuardOptions {
  allowLocalNetwork?: boolean;
}

export class SSRFGuard {
  private static readonly CLOUD_METADATA_HOSTNAMES = new Set([
    "metadata.google.internal",
    "metadata.internal",
    "instance-data",
    "169.254.169.254",
  ]);

  /**
   * Determines whether an IPv4 address belongs to a private, loopback, link-local, or reserved subnet.
   */
  static isPrivateIPv4(ip: string): boolean {
    const parts = ip.split(".").map((segment) => parseInt(segment, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed is treated as dangerous
    }

    const [a, b] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 10.0.0.0/8 (RFC 1918 Private)
    if (a === 10) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 169.254.0.0/16 (Link-local / Cloud Metadata)
    if (a === 169 && b === 254) return true;

    // 172.16.0.0/12 (RFC 1918 Private)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && parts[2] === 0) return true;

    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && parts[2] === 2) return true;

    // 192.168.0.0/16 (RFC 1918 Private)
    if (a === 192 && b === 168) return true;

    // 198.18.0.0/15 (Network benchmark tests)
    if (a === 198 && (b === 18 || b === 19)) return true;

    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && parts[2] === 100) return true;

    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && parts[2] === 113) return true;

    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 (Reserved for future use)
    if (a >= 240) return true;

    return false;
  }

  /**
   * Determines whether an IPv6 address belongs to a loopback, unique local, or link-local subnet.
   */
  static isPrivateIPv6(ip: string): boolean {
    const normalized = ip.toLowerCase().trim();

    // Loopback
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;

    // Unspecified
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;

    // IPv4-mapped IPv6 (::ffff:x.x.x.x)
    if (normalized.startsWith("::ffff:")) {
      const v4Part = normalized.slice(7);
      if (net.isIPv4(v4Part)) {
        return this.isPrivateIPv4(v4Part);
      }
      return true;
    }

    // Unique Local Addresses (fc00::/7 -> fc00 to fdff)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;

    // Link-Local Unicast (fe80::/10 -> fe80 to febf)
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }

    // Multicast (ff00::/8)
    if (normalized.startsWith("ff")) return true;

    return false;
  }

  /**
   * Checks if the given IP address is private, loopback, or reserved.
   */
  static isPrivateIp(ip: string): boolean {
    const family = net.isIP(ip);
    if (family === 4) {
      return this.isPrivateIPv4(ip);
    }
    if (family === 6) {
      return this.isPrivateIPv6(ip);
    }
    return true;
  }

  /**
   * Synchronously validates a URL string against known dangerous protocols,
   * cloud metadata hostnames, and explicit private IP literals.
   */
  static validateUrl(rawUrl: string, options?: SSRFGuardOptions): SSRFValidationResult {
    if (!rawUrl || typeof rawUrl !== "string") {
      return { valid: false, reason: "URL cannot be empty." };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { valid: false, reason: "Malformed URL syntax." };
    }

    // Protocol check: Only HTTP and HTTPS
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        valid: false,
        reason: `Unsupported protocol '${parsed.protocol}'. Only HTTP and HTTPS are permitted.`,
      };
    }

    const hostname = parsed.hostname.toLowerCase().trim();

    // Strip enclosing brackets from IPv6 hostnames
    const cleanHost = hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

    // Cloud metadata hostnames
    if (this.CLOUD_METADATA_HOSTNAMES.has(cleanHost)) {
      return {
        valid: false,
        hostname: cleanHost,
        reason: "Access to cloud instance metadata services is blocked for security.",
      };
    }

    // Localhost hostname check
    if (cleanHost === "localhost" || cleanHost.endsWith(".localhost")) {
      if (options?.allowLocalNetwork) {
        return { valid: true, hostname: cleanHost };
      }
      return {
        valid: false,
        hostname: cleanHost,
        reason: "Access to localhost or loopback domains is blocked.",
      };
    }

    // IP Literal check
    const ipFamily = net.isIP(cleanHost);
    if (ipFamily !== 0) {
      if (this.isPrivateIp(cleanHost)) {
        if (options?.allowLocalNetwork) {
          return { valid: true, hostname: cleanHost, ip: cleanHost };
        }
        return {
          valid: false,
          hostname: cleanHost,
          ip: cleanHost,
          reason: `Access to private/internal IP address '${cleanHost}' is prohibited.`,
        };
      }
    }

    return { valid: true, hostname: cleanHost };
  }

  /**
   * Asynchronously resolves the DNS records of the URL's hostname and verifies
   * that resolved IPs do not point to private internal network addresses (prevents DNS rebinding).
   */
  static async validateUrlWithDns(
    rawUrl: string,
    options?: SSRFGuardOptions
  ): Promise<SSRFValidationResult> {
    const staticCheck = this.validateUrl(rawUrl, options);
    if (!staticCheck.valid) {
      return staticCheck;
    }

    const hostname = staticCheck.hostname!;

    // If it's already an IP literal and passed static check, no need for DNS lookup
    if (net.isIP(hostname) !== 0) {
      return staticCheck;
    }

    try {
      const addresses = await dns.lookup(hostname, { all: true });

      for (const addr of addresses) {
        if (this.isPrivateIp(addr.address)) {
          if (options?.allowLocalNetwork) {
            return { valid: true, hostname, ip: addr.address };
          }
          return {
            valid: false,
            hostname,
            ip: addr.address,
            reason: `Hostname '${hostname}' resolved to prohibited internal IP address '${addr.address}'.`,
          };
        }
      }

      return { valid: true, hostname, ip: addresses[0]?.address };
    } catch (error) {
      return {
        valid: false,
        hostname,
        reason: `DNS resolution failed for hostname '${hostname}': ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
