/**
 * Browser session and credential vault.
 * Persists and restores Playwright storageState (cookies, localStorage) to disk,
 * allowing authenticated session reuse, CAPTCHA bypass continuity, and multi-turn statefulness.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { BrowserContext } from "playwright";

export interface StoredCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface StoredOriginStorage {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

export interface StoredSessionState {
  cookies: StoredCookie[];
  origins: StoredOriginStorage[];
}

export class SessionVault {
  /**
   * Captures storageState from an active Playwright BrowserContext and writes it to disk.
   */
  static async saveState(context: BrowserContext, filePath: string): Promise<StoredSessionState> {
    const state = (await context.storageState()) as StoredSessionState;
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const payload = JSON.stringify(state, null, 2);
    writeFileSync(filePath, payload, "utf8");
    return state;
  }

  /**
   * Reads and parses a stored session state from disk.
   * Returns undefined if file does not exist or contains invalid JSON.
   */
  static loadState(filePath: string): StoredSessionState | undefined {
    if (!existsSync(filePath)) {
      return undefined;
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.cookies) && Array.isArray(parsed.origins)) {
        return parsed as StoredSessionState;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Checks whether a session state file exists on disk.
   */
  static hasState(filePath: string): boolean {
    return existsSync(filePath);
  }
}
