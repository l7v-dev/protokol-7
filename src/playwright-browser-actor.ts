/**
 * Headless Chromium browser actor powered by Playwright and BrowserPool.
 * Handles JavaScript-rendered SPAs, custom waits, screenshot capture,
 * and structured data extraction with pool reuse and asset blocking.
 */

import { BrowserPool, PooledBrowserSession } from "./browser-pool";
import { ReadabilityExtractor } from "./readability-extractor";
import { StealthManager } from "./stealth-manager";
import { StructuredExtractor } from "./structured-extractor";
import { ActorResult, ActorRunContext, ActorTask, IActor, ScrapedPageResult } from "./types";
import { normalizeUrl } from "./url-normalizer";

const DEFAULT_TIMEOUT_MS = 30000;

export class PlaywrightBrowserActor implements IActor<ScrapedPageResult> {
  readonly actorType = "playwright-browser" as const;
  readonly description =
    "Headless Chromium browser actor for dynamic single-page apps, JS rendering, and screenshots.";

  async run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ScrapedPageResult>> {
    const startTime = Date.now();
    const timeout = task.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const normalized = normalizeUrl(task.targetUrl);
    if (!normalized.valid || !normalized.url) {
      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "failed",
        errorMessage: normalized.errorMessage ?? "Invalid target URL.",
        executionDurationMs: Date.now() - startTime,
      };
    }

    const targetUrl = normalized.url;
    let session: PooledBrowserSession | undefined;

    try {
      session = await BrowserPool.acquireSession({
        timeoutMs: timeout,
        blockAssets: task.options?.blockAssets !== false,
        allowLocalNetwork: process.env.NODE_ENV === "test",
      });

      const page = session.page;

      const response = await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout,
      });

      const statusCode = response?.status() ?? 200;

      if (task.options?.waitForSelector) {
        await page.waitForSelector(task.options.waitForSelector, { timeout: 5000 }).catch(() => {
          // Continue if element doesn't appear within short grace period
        });
      }

      await StealthManager.simulateHumanInteraction(page);

      // Extract metadata and content from browser DOM
      const title = await page.title();
      const rawHtml = await page.content();

      const description = await page
        .$eval('meta[name="description"], meta[property="og:description"]', (el) =>
          el.getAttribute("content")
        )
        .catch(() => undefined);

      let favicon = await page
        .$eval('link[rel*="icon"]', (el) => el.getAttribute("href"))
        .catch(() => undefined);

      if (favicon && !favicon.startsWith("http")) {
        try {
          favicon = new URL(favicon, targetUrl).toString();
        } catch {
          // Keep raw if malformed
        }
      }

      // Collect links and resolve to absolute HTTP/HTTPS URLs
      const links = await page.$$eval("a[href]", (elements) =>
        elements
          .map((el) => (el as HTMLAnchorElement).href)
          .filter(
            (href): href is string =>
              typeof href === "string" &&
              (href.startsWith("http://") || href.startsWith("https://"))
          )
      );

      // Extract selectors if requested
      let selectedData: Record<string, string> | undefined;
      if (task.selectors && Object.keys(task.selectors).length > 0) {
        selectedData = {};
        for (const [key, selector] of Object.entries(task.selectors)) {
          const text = await page
            .$eval(selector, (el) => el.textContent?.trim() ?? "")
            .catch(() => "");
          selectedData[key] = text;
        }
      }

      // Extract structured data from HTML if requested
      const tables = task.options?.extractTables
        ? StructuredExtractor.extractTables(rawHtml)
        : undefined;

      const jsonLd = task.options?.extractJsonLd
        ? StructuredExtractor.extractJsonLd(rawHtml)
        : undefined;

      // Extract structured markdown via ReadabilityExtractor
      const readabilityResult = ReadabilityExtractor.extract(rawHtml, targetUrl, {
        includeTables: task.options?.extractTables !== false,
      });

      let content = readabilityResult.markdown || readabilityResult.text;
      if (task.options?.contentType === "text") {
        content = readabilityResult.text;
      } else if (task.options?.contentType === "html") {
        content = rawHtml;
      }

      // Screenshot capture if requested
      let screenshotBase64: string | undefined;
      if (task.options?.captureScreenshot) {
        const screenshotBuffer = await page.screenshot({
          fullPage: false,
          type: "png",
        });
        screenshotBase64 = screenshotBuffer.toString("base64");
      }

      const pageResult: ScrapedPageResult = {
        url: targetUrl,
        title: title || readabilityResult.title,
        description: description ?? readabilityResult.excerpt,
        favicon: favicon ?? undefined,
        content,
        markdown: readabilityResult.markdown,
        byline: readabilityResult.byline,
        siteName: readabilityResult.siteName,
        excerpt: readabilityResult.excerpt,
        isArticle: readabilityResult.isArticle,
        rawHtml,
        selectedData,
        screenshotBase64,
        links: Array.from(new Set(links)),
        tables: tables && tables.length > 0 ? tables : undefined,
        jsonLd: jsonLd && jsonLd.length > 0 ? jsonLd : undefined,
      };

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: "completed",
        statusCode,
        data: pageResult,
        executionDurationMs: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isTimeout = message.toLowerCase().includes("timeout");

      return {
        taskId: task.taskId,
        actorType: this.actorType,
        status: isTimeout ? "timed_out" : "failed",
        errorMessage: message,
        executionDurationMs: Date.now() - startTime,
      };
    } finally {
      if (session) {
        await session.release().catch(() => {});
      }
    }
  }
}
