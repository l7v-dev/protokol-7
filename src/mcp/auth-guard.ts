/**
 * src/mcp/auth-guard.ts
 *
 * Authentication guard for Protokol-7 HTTP Model Context Protocol (MCP) endpoints.
 * Validates incoming HTTP requests against configured MCP_API_TOKEN environment variable.
 */

import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

/**
 * Verifies Bearer token in incoming HTTP request authorization header.
 *
 * Rules:
 * 1. If MCP_API_TOKEN is not set or empty in environment, returns true (development mode).
 * 2. If MCP_API_TOKEN is set, request must contain 'Authorization: Bearer <token>' matching exactly.
 * 3. Token comparison is performed in constant time using crypto.timingSafeEqual.
 */
export function verifyMcpToken(req: IncomingMessage): boolean {
  const configuredToken = process.env.MCP_API_TOKEN?.trim();
  if (!configuredToken) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return false;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }

  const providedToken = match[1].trim();
  const bufProvided = Buffer.from(providedToken, "utf8");
  const bufConfigured = Buffer.from(configuredToken, "utf8");

  if (bufProvided.length !== bufConfigured.length) {
    return false;
  }

  return timingSafeEqual(bufProvided, bufConfigured);
}
