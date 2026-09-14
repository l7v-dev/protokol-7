/**
 * Anti-detection, fingerprint masking, and client stealth profile manager.
 * Provides user agent rotation, realistic viewports, HTTP headers,
 * navigator property masking, and human interaction simulation.
 */

export interface StealthProfile {
  userAgent: string;
  viewport: { width: number; height: number };
  headers: Record<string, string>;
}

export class StealthManager {
  private static readonly USER_AGENTS = [
    // Chrome on Linux
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    // Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    // Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    // Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
    // Firefox on Linux
    "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    // Safari on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    // Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  ];

  private static readonly VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1280, height: 800 },
  ];

  /**
   * Retrieves a random stealth profile containing a modern desktop User-Agent,
   * realistic viewport dimensions, and standard browser HTTP headers.
   */
  static getRandomProfile(): StealthProfile {
    const userAgent =
      this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
    const viewport =
      this.VIEWPORTS[Math.floor(Math.random() * this.VIEWPORTS.length)];

    const headers: Record<string, string> = {
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
      "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Linux"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    };

    return { userAgent, viewport, headers };
  }

  /**
   * Returns default init script content for Playwright context to mask bot fingerprints.
   */
  static getInitScript(): () => void {
    return () => {
      // 1. Mask navigator.webdriver
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });

      // 2. Add realistic navigator.languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en", "tr"],
      });

      // 3. Patch window.chrome
      if (!("chrome" in window)) {
        (window as unknown as { chrome: Record<string, unknown> }).chrome = {
          runtime: {},
          loadTimes: () => ({}),
          csi: () => ({}),
        };
      }
    };
  }

  /**
   * Simulates a brief human interaction (slight scroll and grace delay) on a Playwright page.
   */
  static async simulateHumanInteraction(page: {
    evaluate: (fn: () => void) => Promise<unknown>;
    waitForTimeout?: (ms: number) => Promise<void>;
  }): Promise<void> {
    try {
      await page.evaluate(() => {
        window.scrollBy({
          top: Math.floor(150 + Math.random() * 200),
          behavior: "smooth",
        });
      });
      const delay = Math.floor(50 + Math.random() * 100);
      if (typeof page.waitForTimeout === "function") {
        await page.waitForTimeout(delay);
      } else {
        await new Promise<void>((r) => setTimeout(r, delay));
      }
    } catch {
      // Non-critical if evaluation fails (e.g. frame detached)
    }
  }
}
