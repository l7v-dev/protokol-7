/**
 * Browser process and context pool manager for Playwright.
 * Maintains a warm Chromium instance, applies aggressive resource blocking,
 * enforces route-level SSRF defenses, and masks bot signatures.
 */

import * as fs from "fs";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { SSRFGuard } from "./ssrf-guard";
import { StealthManager } from "./stealth-manager";

export interface BrowserPoolOptions {
  headless?: boolean;
  idleTimeoutMs?: number;
}

export interface AcquireContextOptions {
  userAgent?: string;
  viewport?: { width: number; height: number };
  blockAssets?: boolean;
  timeoutMs?: number;
  allowLocalNetwork?: boolean;
}

export interface PooledBrowserSession {
  context: BrowserContext;
  page: Page;
  release: () => Promise<void>;
}

export class BrowserPool {
  private static browserInstance: Browser | null = null;
  private static activeContexts = 0;
  private static idleTimer: NodeJS.Timeout | null = null;
  private static readonly IDLE_TIMEOUT_MS = 60000;

  private static readonly BLOCKED_RESOURCE_TYPES = new Set([
    "image",
    "media",
    "font",
  ]);

  private static readonly BLOCKED_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|ico|mp4|webm|ogg|mp3|wav|woff2?|ttf|eot)(\?.*)?$/i;

  private static readonly BLOCKED_TRACKER_HOSTS = [
    "google-analytics.com",
    "googletagmanager.com",
    "doubleclick.net",
    "facebook.net",
    "hotjar.com",
    "clarity.ms",
  ];

  private static resolveExecutablePath(): string | undefined {
    const candidates = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      "/etc/profiles/per-user/l7v/bin/google-chrome",
      "/run/current-system/sw/bin/google-chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    ].filter((p): p is string => Boolean(p));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return undefined;
  }

  /**
   * Acquires or reuses a shared Chromium instance.
   */
  private static async getBrowser(): Promise<Browser> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (!this.browserInstance || !this.browserInstance.isConnected()) {
      const executablePath = this.resolveExecutablePath();
      this.browserInstance = await chromium.launch({
        headless: true,
        executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      });
    }

    return this.browserInstance;
  }

  /**
   * Resets idle timer when active contexts reach zero.
   */
  private static scheduleIdleShutdown(): void {
    if (this.activeContexts === 0 && !this.idleTimer) {
      this.idleTimer = setTimeout(async () => {
        if (this.activeContexts === 0 && this.browserInstance) {
          try {
            await this.browserInstance.close();
          } catch {
            // Ignored
          }
          this.browserInstance = null;
          this.idleTimer = null;
        }
      }, this.IDLE_TIMEOUT_MS);
      if (this.idleTimer && typeof this.idleTimer.unref === "function") {
        this.idleTimer.unref();
      }
    }
  }

  /**
   * Acquires an isolated, ephemeral BrowserContext with security routing and asset blocking.
   */
  static async acquireSession(options?: AcquireContextOptions): Promise<PooledBrowserSession> {
    const browser = await this.getBrowser();

    const stealthProfile = StealthManager.getRandomProfile();
    const userAgent = options?.userAgent || stealthProfile.userAgent;
    const viewport = options?.viewport || stealthProfile.viewport;
    const blockAssets = options?.blockAssets !== false; // Default true
    const allowLocalNetwork = options?.allowLocalNetwork ?? (process.env.NODE_ENV === "test");

    const context = await browser.newContext({
      userAgent,
      viewport,
      extraHTTPHeaders: stealthProfile.headers,
      bypassCSP: false,
      ignoreHTTPSErrors: false,
    });
    this.activeContexts += 1;

    // Anti-detection stealth script: hide navigator.webdriver, mock languages, patch chrome
    await context.addInitScript(StealthManager.getInitScript());
    // Polyfill bundler helpers (e.g. esbuild/tsx __name) in browser execution context
    await context.addInitScript("window.__name = (fn) => fn;");

    const page = await context.newPage();
    if (options?.timeoutMs) {
      page.setDefaultTimeout(options.timeoutMs);
    }

    // Intercept all outgoing network requests for SSRF protection and asset blocking
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = request.url();
      const resourceType = request.resourceType();

      // 1. SSRF Guard Check: Block private IPs, metadata endpoints, and non-HTTP protocols
      const ssrfCheck = SSRFGuard.validateUrl(url, { allowLocalNetwork });
      if (!ssrfCheck.valid) {
        return route.abort("blockedbyclient");
      }

      // 2. Resource Optimization: Block heavy media, images, and fonts when enabled
      if (blockAssets) {
        if (this.BLOCKED_RESOURCE_TYPES.has(resourceType) || this.BLOCKED_EXTENSIONS.test(url)) {
          return route.abort("blockedbyclient");
        }

        const isTracker = this.BLOCKED_TRACKER_HOSTS.some((host) => url.includes(host));
        if (isTracker) {
          return route.abort("blockedbyclient");
        }
      }

      return route.continue();
    });

    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      try {
        await context.close();
      } catch {
        // Ignored
      } finally {
        this.activeContexts = Math.max(0, this.activeContexts - 1);
        this.scheduleIdleShutdown();
      }
    };

    return { context, page, release };
  }

  /**
   * Returns current active browser contexts count.
   */
  static getActiveContexts(): number {
    return this.activeContexts;
  }

  /**
   * Gracefully shuts down the browser pool and closes any active Chromium process.
   */
  static async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.browserInstance) {
      try {
        await this.browserInstance.close();
      } catch {
        // Ignored
      }
      this.browserInstance = null;
    }
    this.activeContexts = 0;
  }
}
