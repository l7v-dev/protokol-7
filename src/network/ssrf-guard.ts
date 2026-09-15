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
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
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
   * Expands an IPv6 address string into 8 16-bit numeric values.
   */
  private static parseIPv6Segments(ip: string): number[] | null {
    let clean = ip.toLowerCase().trim();
    if (clean.startsWith("[") && clean.endsWith("]")) {
      clean = clean.slice(1, -1);
    }

    // Handle embedded dotted IPv4 at the end (e.g. ::ffff:192.168.1.1)
    const lastColon = clean.lastIndexOf(":");
    if (lastColon !== -1) {
      const potentialV4 = clean.slice(lastColon + 1);
      if (net.isIPv4(potentialV4)) {
        const parts = potentialV4.split(".").map(Number);
        const hexHigh = ((parts[0] << 8) | parts[1]).toString(16);
        const hexLow = ((parts[2] << 8) | parts[3]).toString(16);
        clean = `${clean.slice(0, lastColon)}:${hexHigh}:${hexLow}`;
      }
    }

    const doubleColonCount = (clean.match(/::/g) || []).length;
    if (doubleColonCount > 1) return null;

    let parts: string[];
    if (doubleColonCount === 1) {
      const [left, right] = clean.split("::");
      const leftParts = left ? left.split(":") : [];
      const rightParts = right ? right.split(":") : [];
      const missingCount = 8 - (leftParts.length + rightParts.length);
      if (missingCount < 1) return null;
      parts = [...leftParts, ...Array(missingCount).fill("0"), ...rightParts];
    } else {
      parts = clean.split(":");
    }

    if (parts.length !== 8) return null;

    const segments = parts.map((p) => parseInt(p, 16));
    if (segments.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null;

    return segments;
  }

  /**
   * Determines whether an IPv6 address belongs to a loopback, unique local, link-local,
   * multicast, or encapsulated private IPv4 subnet (RFC 4291 IPv4-compatible, 6to4, NAT64).
   */
  static isPrivateIPv6(ip: string): boolean {
    const segments = this.parseIPv6Segments(ip);
    if (!segments) {
      return true; // Malformed IPv6 is treated as dangerous
    }

    // Loopback (::1)
    if (
      segments[0] === 0 &&
      segments[1] === 0 &&
      segments[2] === 0 &&
      segments[3] === 0 &&
      segments[4] === 0 &&
      segments[5] === 0 &&
      segments[6] === 0 &&
      segments[7] === 1
    ) {
      return true;
    }

    // Unspecified (::)
    if (segments.every((s) => s === 0)) {
      return true;
    }

    // Unique Local Addresses (fc00::/7 -> fc00 to fdff)
    if ((segments[0] & 0xfe00) === 0xfc00) {
      return true;
    }

    // Link-Local Unicast (fe80::/10 -> fe80 to febf)
    if ((segments[0] & 0xffc0) === 0xfe80) {
      return true;
    }

    // Multicast (ff00::/8)
    if ((segments[0] & 0xff00) === 0xff00) {
      return true;
    }

    // Documentation prefix (2001:db8::/32)
    if (segments[0] === 0x2001 && segments[1] === 0x0db8) {
      return true;
    }

    // Discard prefix (100::/64)
    if (segments[0] === 0x0100 && segments[1] === 0 && segments[2] === 0 && segments[3] === 0) {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:0:0/96) and IPv4-compatible IPv6 (::/96)
    const isMapped =
      segments[0] === 0 &&
      segments[1] === 0 &&
      segments[2] === 0 &&
      segments[3] === 0 &&
      segments[4] === 0 &&
      segments[5] === 0xffff;

    const isCompatible =
      segments[0] === 0 &&
      segments[1] === 0 &&
      segments[2] === 0 &&
      segments[3] === 0 &&
      segments[4] === 0 &&
      segments[5] === 0;

    if (isMapped || isCompatible) {
      const ipv4 = `${(segments[6] >> 8) & 0xff}.${segments[6] & 0xff}.${(segments[7] >> 8) & 0xff}.${segments[7] & 0xff}`;
      return this.isPrivateIPv4(ipv4);
    }

    // 6to4 prefix (2002::/16) encapsulating IPv4 in bits 16..47
    if (segments[0] === 0x2002) {
      const ipv4 = `${(segments[1] >> 8) & 0xff}.${segments[1] & 0xff}.${(segments[2] >> 8) & 0xff}.${segments[2] & 0xff}`;
      return this.isPrivateIPv4(ipv4);
    }

    // NAT64 well-known prefix (64:ff9b::/96)
    if (
      segments[0] === 0x0064 &&
      segments[1] === 0xff9b &&
      segments[2] === 0 &&
      segments[3] === 0 &&
      segments[4] === 0 &&
      segments[5] === 0
    ) {
      const ipv4 = `${(segments[6] >> 8) & 0xff}.${segments[6] & 0xff}.${(segments[7] >> 8) & 0xff}.${segments[7] & 0xff}`;
      return this.isPrivateIPv4(ipv4);
    }

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
    const cleanHost =
      hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;

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
