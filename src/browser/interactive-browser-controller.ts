/**
 * Interactive Browser Controller.
 * Unites stateful session management, Set-of-Mark visual DOM indexing,
 * humanized interaction primitives, and multi-tab orchestration.
 */

import { Page } from "playwright";
import { SSRFGuard } from "../network/ssrf-guard";
import { BrowserSessionManager, type BrowserTabInfo } from "./browser-session-manager";
import { DOMIndexer, type IndexedElement } from "./dom-indexer";

export interface BrowserActionTarget {
  elementIndex?: number;
  selector?: string;
  x?: number;
  y?: number;
}

export interface BrowserActionResult {
  success: boolean;
  action: string;
  url: string;
  title: string;
  tabs: BrowserTabInfo[];
  activeTabId: string;
  elementCount: number;
  elementManifest?: string;
  screenshotBase64?: string;
  extractedContent?: string;
  consoleErrors?: string[];
  errorMessage?: string;
}

export interface TypeActionOptions {
  clear?: boolean;
  pressEnter?: boolean;
  humanJitter?: boolean;
}

export interface BrowserActionParams {
  url?: string;
  elementIndex?: number;
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
  clear?: boolean;
  pressEnter?: boolean;
  humanJitter?: boolean;
  key?: string;
  direction?: "up" | "down" | "top" | "bottom";
  amount?: number;
  value?: string;
  withBadges?: boolean;
  format?: "text" | "markdown" | "html";
  script?: string;
  tabId?: string;
  captureScreenshot?: boolean;
  timeoutMs?: number;
  [key: string]: unknown;
}

export class InteractiveBrowserController {
  private static consoleErrorMap = new Map<string, string[]>();
  private static attachedPages = new WeakSet<Page>();

  static {
    BrowserSessionManager.onSessionClosed((sessionId) => {
      InteractiveBrowserController.cleanupSession(sessionId);
    });
  }

  /**
   * Cleans up in-memory console errors and resources for closed sessions.
   */
  static cleanupSession(sessionId: string): void {
    this.consoleErrorMap.delete(sessionId);
  }

  /**
   * Attaches error listeners to the active page if not already attached.
   */
  private static attachListeners(sessionId: string, page: Page): void {
    if (!this.consoleErrorMap.has(sessionId)) {
      this.consoleErrorMap.set(sessionId, []);
    }

    if (this.attachedPages.has(page)) {
      return;
    }
    this.attachedPages.add(page);

    // Keep max 15 recent console errors per session
    page.on("pageerror", (err) => {
      const list = this.consoleErrorMap.get(sessionId) || [];
      list.push(`[PageError] ${err.message}`);
      if (list.length > 15) list.shift();
      this.consoleErrorMap.set(sessionId, list);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const list = this.consoleErrorMap.get(sessionId) || [];
        list.push(`[ConsoleError] ${msg.text()}`);
        if (list.length > 15) list.shift();
        this.consoleErrorMap.set(sessionId, list);
      }
    });
  }

  /**
   * Navigates the active session page to a target URL.
   */
  static async navigate(
    sessionId: string,
    url: string,
    options?: { captureScreenshot?: boolean; timeoutMs?: number }
  ): Promise<BrowserActionResult> {
    const allowLocalNetwork = process.env.NODE_ENV === "test";
    const ssrfCheck = await SSRFGuard.validateUrlWithDns(url, { allowLocalNetwork });
    if (!ssrfCheck.valid) {
      throw new Error(`SSRF blocked: ${ssrfCheck.reason || "Destination URL not permitted."}`);
    }

    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    const timeout = options?.timeoutMs || 25000;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });

    // Gracefully wait a short moment for dynamic SPA rendering
    await page.waitForTimeout(500);

    return this.buildActionResult(sessionId, page, "navigate", options?.captureScreenshot ?? true);
  }

  /**
   * Clicks an element identified by SoM index, CSS selector, or coordinate.
   */
  static async click(
    sessionId: string,
    target: BrowserActionTarget,
    options?: { captureScreenshot?: boolean }
  ): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    if (target.elementIndex !== undefined) {
      const indexResult = await DOMIndexer.indexPage(page);
      const matched = indexResult.elements.find((el) => el.index === target.elementIndex);
      if (!matched) {
        throw new Error(
          `Element index [${target.elementIndex}] not found on page. Available indices: 1-${indexResult.totalCount}.`
        );
      }

      // Humanized jitter and click
      await page.mouse.move(
        matched.rect.x + matched.rect.width / 2,
        matched.rect.y + matched.rect.height / 2
      );
      await page.waitForTimeout(60 + Math.random() * 50);
      await page.mouse.down();
      await page.waitForTimeout(40 + Math.random() * 30);
      await page.mouse.up();
    } else if (target.selector) {
      const locator = page.locator(target.selector).first();
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
      await locator.click({ timeout: 5000 });
    } else if (target.x !== undefined && target.y !== undefined) {
      await page.mouse.click(target.x, target.y);
    } else {
      throw new Error("Must specify elementIndex, selector, or coordinates {x, y} to click.");
    }

    // Await minor DOM settlement after click
    await page.waitForTimeout(400);

    return this.buildActionResult(sessionId, page, "click", options?.captureScreenshot ?? true);
  }

  /**
   * Types text into an element identified by SoM index or CSS selector.
   */
  static async type(
    sessionId: string,
    target: BrowserActionTarget,
    text: string,
    options?: TypeActionOptions & { captureScreenshot?: boolean }
  ): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    let selector = target.selector;

    if (target.elementIndex !== undefined) {
      const indexResult = await DOMIndexer.indexPage(page);
      const matched = indexResult.elements.find((el) => el.index === target.elementIndex);
      if (!matched) {
        throw new Error(
          `Element index [${target.elementIndex}] not found on page. Available indices: 1-${indexResult.totalCount}.`
        );
      }
      selector = matched.selector;
    }

    if (!selector) {
      throw new Error("Target element selector could not be resolved for typing.");
    }

    const locator = page.locator(selector).first();
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 });
    await locator.focus({ timeout: 5000 });

    if (options?.clear) {
      await locator.fill("");
    }

    const delay = options?.humanJitter !== false ? 40 + Math.random() * 30 : 0;
    await page.keyboard.type(text, { delay });

    if (options?.pressEnter) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
    }

    return this.buildActionResult(sessionId, page, "type", options?.captureScreenshot ?? true);
  }

  /**
   * Presses a specific keyboard key.
   */
  static async pressKey(
    sessionId: string,
    key: string,
    options?: { captureScreenshot?: boolean }
  ): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    await page.keyboard.press(key);
    await page.waitForTimeout(300);

    return this.buildActionResult(
      sessionId,
      page,
      `press_key(${key})`,
      options?.captureScreenshot ?? true
    );
  }

  /**
   * Scrolls the page viewport.
   */
  static async scroll(
    sessionId: string,
    direction: "up" | "down" | "top" | "bottom",
    amount = 500,
    options?: { captureScreenshot?: boolean }
  ): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    if (direction === "top") {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } else if (direction === "bottom") {
      await page.evaluate(() =>
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
      );
    } else if (direction === "down") {
      await page.evaluate(
        (amt: number) => window.scrollBy({ top: amt, behavior: "smooth" }),
        amount
      );
    } else if (direction === "up") {
      await page.evaluate(
        (amt: number) => window.scrollBy({ top: -amt, behavior: "smooth" }),
        amount
      );
    }

    await page.waitForTimeout(300);
    return this.buildActionResult(
      sessionId,
      page,
      `scroll(${direction})`,
      options?.captureScreenshot ?? true
    );
  }

  /**
   * Selects an option from a HTML dropdown (<select>).
   */
  static async selectOption(
    sessionId: string,
    target: BrowserActionTarget,
    value: string,
    options?: { captureScreenshot?: boolean }
  ): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    let selector = target.selector;
    if (target.elementIndex !== undefined) {
      const indexResult = await DOMIndexer.indexPage(page);
      const matched = indexResult.elements.find((el) => el.index === target.elementIndex);
      if (!matched) throw new Error(`Element index [${target.elementIndex}] not found.`);
      selector = matched.selector;
    }

    if (!selector) throw new Error("Select element selector not found.");
    await page.locator(selector).first().selectOption(value);
    await page.waitForTimeout(300);

    return this.buildActionResult(
      sessionId,
      page,
      `select_option(${value})`,
      options?.captureScreenshot ?? true
    );
  }

  /**
   * Hovers over an element.
   */
  static async hover(
    sessionId: string,
    target: BrowserActionTarget,
    options?: { captureScreenshot?: boolean }
  ): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    if (target.elementIndex !== undefined) {
      const indexResult = await DOMIndexer.indexPage(page);
      const matched = indexResult.elements.find((el) => el.index === target.elementIndex);
      if (!matched) throw new Error(`Element index [${target.elementIndex}] not found.`);
      await page.mouse.move(
        matched.rect.x + matched.rect.width / 2,
        matched.rect.y + matched.rect.height / 2
      );
    } else if (target.selector) {
      await page.locator(target.selector).first().hover();
    } else if (target.x !== undefined && target.y !== undefined) {
      await page.mouse.move(target.x, target.y);
    }

    await page.waitForTimeout(200);
    return this.buildActionResult(sessionId, page, "hover", options?.captureScreenshot ?? true);
  }

  /**
   * Extracts readable text, markdown or raw HTML from the page.
   */
  static async extractContent(
    sessionId: string,
    selector?: string,
    format: "text" | "markdown" | "html" = "text"
  ): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    let content = "";
    if (format === "html") {
      content = selector
        ? await page
            .locator(selector)
            .first()
            .innerHTML()
            .catch(() => "")
        : await page.content();
    } else {
      content = selector
        ? await page
            .locator(selector)
            .first()
            .innerText()
            .catch(() => "")
        : await page.innerText("body").catch(() => "");
    }

    const result = await this.buildActionResult(sessionId, page, "extract_content", false);
    result.extractedContent = content.slice(0, 8000); // Guard token length
    return result;
  }

  /**
   * Captures an instant Set-of-Mark annotated screenshot.
   */
  static async captureScreenshot(
    sessionId: string,
    withBadges = true
  ): Promise<{ base64: string; elements: IndexedElement[]; manifest: string }> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    const indexResult = await DOMIndexer.indexPage(page);

    if (withBadges && indexResult.elements.length > 0) {
      await DOMIndexer.injectBadges(page, indexResult.elements);
    }

    const buffer = await page.screenshot({ type: "jpeg", quality: 80 });

    if (withBadges && indexResult.elements.length > 0) {
      await DOMIndexer.removeBadges(page);
    }

    return {
      base64: buffer.toString("base64"),
      elements: indexResult.elements,
      manifest: indexResult.manifest,
    };
  }

  /**
   * Evaluates custom JavaScript in the page context.
   */
  static async evaluate(sessionId: string, script: string): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);

    const evalResult = await page.evaluate(script);
    const result = await this.buildActionResult(sessionId, page, "evaluate", false);
    result.extractedContent =
      typeof evalResult === "object" ? JSON.stringify(evalResult, null, 2) : String(evalResult);
    return result;
  }

  /**
   * Multi-tab management delegates.
   */
  static async createTab(sessionId: string, url?: string): Promise<BrowserActionResult> {
    const { page } = await BrowserSessionManager.createTab(sessionId, url);
    this.attachListeners(sessionId, page);
    return this.buildActionResult(sessionId, page, "create_tab", true);
  }

  static async switchTab(sessionId: string, tabId: string): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.switchTab(sessionId, tabId);
    this.attachListeners(sessionId, page);
    return this.buildActionResult(sessionId, page, `switch_tab(${tabId})`, true);
  }

  static async closeTab(sessionId: string, tabId: string): Promise<BrowserActionResult> {
    await BrowserSessionManager.closeTab(sessionId, tabId);
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);
    return this.buildActionResult(sessionId, page, `close_tab(${tabId})`, true);
  }

  /**
   * Captures full action result including screenshot and element manifest.
   */
  static async screenshot(sessionId: string, _withBadges = true): Promise<BrowserActionResult> {
    const page = await BrowserSessionManager.getActivePage(sessionId);
    this.attachListeners(sessionId, page);
    return this.buildActionResult(sessionId, page, "screenshot", true);
  }

  /**
   * Dispatches and executes an interactive browser action by name.
   */
  static async executeAction(
    sessionId: string,
    action: string,
    params: BrowserActionParams = {}
  ): Promise<BrowserActionResult> {
    const captureScreenshot = params.captureScreenshot !== false;
    switch (action) {
      case "navigate": {
        if (!params.url) {
          throw new Error("Action 'navigate' requires a destination 'url'.");
        }
        return this.navigate(sessionId, params.url, {
          captureScreenshot,
          timeoutMs: params.timeoutMs,
        });
      }
      case "click": {
        return this.click(
          sessionId,
          {
            elementIndex: params.elementIndex,
            selector: params.selector,
            x: params.x,
            y: params.y,
          },
          { captureScreenshot }
        );
      }
      case "type": {
        if (params.text === undefined) {
          throw new Error("Action 'type' requires a 'text' argument.");
        }
        return this.type(
          sessionId,
          {
            elementIndex: params.elementIndex,
            selector: params.selector,
          },
          params.text,
          {
            clear: params.clear,
            pressEnter: params.pressEnter,
            humanJitter: params.humanJitter,
            captureScreenshot,
          }
        );
      }
      case "press_key": {
        if (!params.key) {
          throw new Error("Action 'press_key' requires a 'key' argument.");
        }
        return this.pressKey(sessionId, params.key, { captureScreenshot });
      }
      case "scroll": {
        return this.scroll(sessionId, params.direction || "down", params.amount, {
          captureScreenshot,
        });
      }
      case "select_option": {
        if (!params.value) {
          throw new Error("Action 'select_option' requires a 'value' argument.");
        }
        return this.selectOption(
          sessionId,
          {
            elementIndex: params.elementIndex,
            selector: params.selector,
          },
          params.value,
          { captureScreenshot }
        );
      }
      case "hover": {
        return this.hover(
          sessionId,
          {
            elementIndex: params.elementIndex,
            selector: params.selector,
            x: params.x,
            y: params.y,
          },
          { captureScreenshot }
        );
      }
      case "screenshot": {
        return this.screenshot(sessionId, params.withBadges ?? true);
      }
      case "extract_content": {
        return this.extractContent(sessionId, params.selector, params.format || "text");
      }
      case "evaluate": {
        if (!params.script) {
          throw new Error("Action 'evaluate' requires a 'script' argument.");
        }
        return this.evaluate(sessionId, params.script);
      }
      case "create_tab": {
        return this.createTab(sessionId, params.url);
      }
      case "switch_tab": {
        if (!params.tabId) {
          throw new Error("Action 'switch_tab' requires a 'tabId' argument.");
        }
        return this.switchTab(sessionId, params.tabId);
      }
      case "close_tab": {
        if (!params.tabId) {
          throw new Error("Action 'close_tab' requires a 'tabId' argument.");
        }
        return this.closeTab(sessionId, params.tabId);
      }
      case "close_session": {
        await this.closeSession(sessionId);
        return {
          success: true,
          action: "close_session",
          url: "",
          title: "",
          tabs: [],
          activeTabId: "",
          elementCount: 0,
        };
      }
      default:
        throw new Error(`Unsupported browser action: '${action}'.`);
    }
  }
  /**
   * Closes session and frees resources.
   */
  static async closeSession(sessionId: string): Promise<void> {
    this.consoleErrorMap.delete(sessionId);
    await BrowserSessionManager.closeSession(sessionId);
  }

  /**
   * Compiles the unified action result with live tabs, SoM manifest, and screenshot.
   */
  private static async buildActionResult(
    sessionId: string,
    page: Page,
    action: string,
    captureScreenshot: boolean
  ): Promise<BrowserActionResult> {
    const url = page.url() || "about:blank";
    const title = (await page.title().catch(() => "")) || "Untitled";
    const tabs = await BrowserSessionManager.listTabs(sessionId);
    const activeTab = tabs.find((t) => t.isActive);

    let screenshotBase64: string | undefined;
    let elementManifest: string | undefined;
    let elementCount = 0;

    if (captureScreenshot && !page.isClosed()) {
      try {
        const shot = await this.captureScreenshot(sessionId, true);
        screenshotBase64 = shot.base64;
        elementManifest = shot.manifest;
        elementCount = shot.elements.length;
      } catch {
        // Screenshot fallback if page is unloading
      }
    }

    const consoleErrors = this.consoleErrorMap.get(sessionId) || [];

    return {
      success: true,
      action,
      url,
      title,
      tabs,
      activeTabId: activeTab?.id || "tab_1",
      elementCount,
      elementManifest,
      screenshotBase64,
      consoleErrors: consoleErrors.length > 0 ? consoleErrors : undefined,
    };
  }
}
