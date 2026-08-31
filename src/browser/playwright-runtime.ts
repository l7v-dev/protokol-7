import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import type { BrowserActionPage } from './actions.js';
import type { BrowserCapturePage } from './artifacts.js';
import type {
  BrowserContextHandle,
  BrowserContextOptions,
  BrowserPageHandle,
  BrowserRuntime,
  BrowserCookieInput,
  BrowserHandle
} from './pool.js';

export type PlaywrightRuntimeOptions = {
  executablePath?: string;
  headless?: boolean;
  args?: string[];
};

export type PlaywrightPageHandle = BrowserPageHandle & BrowserActionPage & BrowserCapturePage;

export class PlaywrightBrowserRuntime implements BrowserRuntime {
  public constructor(private readonly options: PlaywrightRuntimeOptions = {}) {}

  public async launch(): Promise<BrowserHandle> {
    const browser = await chromium.launch({
      headless: this.options.headless ?? true,
      ...(this.options.executablePath ? { executablePath: this.options.executablePath } : {}),
      ...(this.options.args ? { args: this.options.args } : {})
    });
    return wrapBrowser(browser);
  }
}

function wrapBrowser(browser: Browser): BrowserHandle {
  return {
    version: browser.version(),
    newContext: async (options: BrowserContextOptions) => {
      void options;
      return wrapContext(await browser.newContext({ serviceWorkers: 'block' }));
    },
    close: async () => browser.close()
  };
}

function wrapContext(context: BrowserContext): BrowserContextHandle {
  return {
    newPage: async () => wrapPage(await context.newPage()),
    close: async () => context.close(),
    addCookies: async (cookies: BrowserCookieInput[]) => {
      await context.addCookies(cookies as Parameters<BrowserContext['addCookies']>[0]);
    },
    setExtraHTTPHeaders: async (headers: Record<string, string>) => context.setExtraHTTPHeaders(headers)
  };
}

function wrapPage(page: Page): PlaywrightPageHandle {
  return {
    close: async () => page.close(),
    goto: async (url, options) => {
      throwIfAborted(options.signal);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    },
    waitForSelector: async (selector, options) => {
      throwIfAborted(options.signal);
      await page.waitForSelector(selector, { timeout: options.timeoutMs });
    },
    scroll: async (amount, options) => {
      throwIfAborted(options.signal);
      await page.mouse.wheel(0, amount);
    },
    click: async (selector, options) => {
      throwIfAborted(options.signal);
      await page.locator(selector).click({ timeout: options.timeoutMs });
    },
    fill: async (selector, value, options) => {
      throwIfAborted(options.signal);
      await page.locator(selector).fill(value, { timeout: options.timeoutMs });
    },
    screenshot: async (options) => page.screenshot({ type: 'png', fullPage: options?.fullPage ?? false }),
    content: async () => page.content(),
    pdf: async () => page.pdf({ format: 'A4', printBackground: true })
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('Browser operation cancelled.');
  }
}
