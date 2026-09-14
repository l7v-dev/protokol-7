/**
 * Stateful browser session and multi-tab manager.
 * Keeps browser contexts alive across multiple ReAct turns, isolates sessions,
 * handles popup / target="_blank" tabs automatically, and evicts idle sessions after 5 minutes.
 */

import { BrowserContext, Page } from "playwright";
import { AcquireContextOptions, BrowserPool, PooledBrowserSession } from "./browser-pool";
import { SSRFGuard } from "./ssrf-guard";

export interface BrowserTabInfo {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
}

export interface BrowserSessionState {
  sessionId: string;
  context: BrowserContext;
  tabs: Map<string, Page>;
  activeTabId: string;
  tabCounter: number;
  lastAccessedAt: number;
  ttlTimeout: NodeJS.Timeout | null;
  releaseSession: () => Promise<void>;
}

export class BrowserSessionManager {
  private static sessions = new Map<string, BrowserSessionState>();
  private static readonly SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes idle TTL

  /**
   * Retrieves an existing session or provisions a new isolated context.
   */
  static async getOrCreateSession(
    sessionId: string,
    options?: AcquireContextOptions
  ): Promise<BrowserSessionState> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      this.touchSession(existing);
      return existing;
    }

    const pooled: PooledBrowserSession = await BrowserPool.acquireSession({
      ...options,
      blockAssets: options?.blockAssets ?? false, // Interactive browsing retains layout assets
    });

    const initialTabId = "tab_1";
    const tabs = new Map<string, Page>();
    tabs.set(initialTabId, pooled.page);

    const state: BrowserSessionState = {
      sessionId,
      context: pooled.context,
      tabs,
      activeTabId: initialTabId,
      tabCounter: 1,
      lastAccessedAt: Date.now(),
      ttlTimeout: null,
      releaseSession: pooled.release,
    };

    // Auto-register popups and target="_blank" pages
    pooled.context.on("page", (newPage: Page) => {
      state.tabCounter++;
      const newTabId = `tab_${state.tabCounter}`;
      state.tabs.set(newTabId, newPage);
      state.activeTabId = newTabId;

      newPage.on("close", () => {
        state.tabs.delete(newTabId);
        if (state.activeTabId === newTabId) {
          const remaining = Array.from(state.tabs.keys());
          state.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : "";
        }
      });
    });

    pooled.page.on("close", () => {
      state.tabs.delete(initialTabId);
      if (state.activeTabId === initialTabId) {
        const remaining = Array.from(state.tabs.keys());
        state.activeTabId = remaining.length > 0 ? remaining[0] : "";
      }
    });

    this.touchSession(state);
    this.sessions.set(sessionId, state);
    return state;
  }

  /**
   * Resets idle timeout for a session.
   */
  private static touchSession(session: BrowserSessionState): void {
    session.lastAccessedAt = Date.now();
    if (session.ttlTimeout) {
      clearTimeout(session.ttlTimeout);
    }
    session.ttlTimeout = setTimeout(async () => {
      await this.closeSession(session.sessionId);
    }, this.SESSION_TTL_MS);
    if (session.ttlTimeout && typeof session.ttlTimeout.unref === "function") {
      session.ttlTimeout.unref();
    }
  }

  /**
   * Returns the currently active Page for the session.
   */
  static async getActivePage(sessionId: string, options?: AcquireContextOptions): Promise<Page> {
    const session = await this.getOrCreateSession(sessionId, options);
    let page = session.tabs.get(session.activeTabId);

    if (!page || page.isClosed()) {
      // Find another open tab or create a fresh one
      const openTabs = Array.from(session.tabs.entries()).filter(([, p]) => !p.isClosed());
      if (openTabs.length > 0) {
        session.activeTabId = openTabs[0][0];
        page = openTabs[0][1];
      } else {
        const newTab = await this.createTab(sessionId);
        page = newTab.page;
      }
    }

    this.touchSession(session);
    return page;
  }

  /**
   * Opens a new tab within the session.
   */
  static async createTab(sessionId: string, url?: string): Promise<{ tabId: string; page: Page }> {
    const session = await this.getOrCreateSession(sessionId);
    const page = await session.context.newPage();
    const tabId = session.activeTabId;

    if (url && url !== "about:blank") {
      const allowLocalNetwork = process.env.NODE_ENV === "test";
      const ssrfCheck = SSRFGuard.validateUrl(url, { allowLocalNetwork });
      if (!ssrfCheck.valid) {
        throw new Error(`SSRF blocked: ${ssrfCheck.reason || "Destination URL not permitted."}`);
      }
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } else if (url === "about:blank") {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    }

    this.touchSession(session);
    return { tabId, page };
  }

  /**
   * Switches the active tab pointer.
   */
  static async switchTab(sessionId: string, tabId: string): Promise<Page> {
    const session = await this.getOrCreateSession(sessionId);
    const page = session.tabs.get(tabId);
    if (!page || page.isClosed()) {
      throw new Error(`Tab '${tabId}' not found or already closed in session '${sessionId}'.`);
    }

    session.activeTabId = tabId;
    this.touchSession(session);
    await page.bringToFront();
    return page;
  }

  /**
   * Closes a specific tab.
   */
  static async closeTab(
    sessionId: string,
    tabId: string
  ): Promise<{ remainingTabs: string[]; activeTabId: string }> {
    const session = await this.getOrCreateSession(sessionId);
    const page = session.tabs.get(tabId);
    if (page && !page.isClosed()) {
      await page.close();
    }
    session.tabs.delete(tabId);

    const remaining = Array.from(session.tabs.keys());
    if (session.activeTabId === tabId) {
      session.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : "";
    }

    this.touchSession(session);
    return {
      remainingTabs: remaining,
      activeTabId: session.activeTabId,
    };
  }

  /**
   * Lists all open tabs and their metadata.
   */
  static async listTabs(sessionId: string): Promise<BrowserTabInfo[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const tabList: BrowserTabInfo[] = [];
    for (const [id, page] of session.tabs.entries()) {
      if (!page.isClosed()) {
        tabList.push({
          id,
          title: (await page.title().catch(() => "")) || "Untitled",
          url: page.url() || "about:blank",
          isActive: id === session.activeTabId,
        });
      }
    }

    return tabList;
  }

  /**
   * Closes an entire session and frees all underlying Playwright resources.
   */
  static async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.ttlTimeout) {
      clearTimeout(session.ttlTimeout);
      session.ttlTimeout = null;
    }

    for (const page of session.tabs.values()) {
      if (!page.isClosed()) {
        try {
          await page.close();
        } catch {
          // Ignored
        }
      }
    }
    session.tabs.clear();

    try {
      await session.releaseSession();
    } catch {
      // Ignored
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Shuts down all active sessions (e.g. during application tear down).
   */
  static async shutdownAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      await this.closeSession(id);
    }
    this.sessions.clear();
  }
}
