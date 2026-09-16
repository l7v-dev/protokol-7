# Connectome — Otomatik Üretilen Sistem Haritası

> Bu dosya `scripts/generate-connectome.mjs` ile üretildi (2026-09-16). Elle düzenlenmez.
> Çözümleyici Motor: TypeScript Compiler API AST (v5.9.3)

## Çekirdek Modüller ve Mimari Düğümler (Centrality)

Bu tablo, diğer modüller tarafından en çok referans verilen (PageRank benzeri in-degree) merkezi bileşenleri gösterir.

| Modül / Dosya | İçe Aktarılma (In-Degree) | İhraç Sembol Sayısı | Rol / Açıklama |
|---|---|---|---|
| `src/core/types.ts` | 17 | 30 | Yardımcı Modül |
| `src/network/ssrf-guard.ts` | 9 | 3 | Yardımcı Modül |
| `src/network/safe-redirect-fetcher.ts` | 7 | 2 | Yardımcı Modül |
| `src/browser/browser-pool.ts` | 4 | 4 | Kaynak Yöneticisi (BrowserPool) |
| `src/extractors/structured-extractor.ts` | 4 | 1 | Etki Alanı Aktörü (Actor) |
| `src/network/proxy-manager.ts` | 4 | 5 | Yardımcı Modül |
| `src/network/url-normalizer.ts` | 4 | 2 | Yardımcı Modül |
| `src/network/url-pattern-matcher.ts` | 4 | 2 | Yardımcı Modül |
| `scripts/telemetry-logger.mjs` | 3 | 4 | Yardımcı Modül |
| `src/browser/session-vault.ts` | 3 | 4 | Oturum Denetleyicisi |
| `src/extractors/readability-extractor.ts` | 3 | 3 | Etki Alanı Aktörü (Actor) |
| `src/network/retry-handler.ts` | 3 | 4 | Yardımcı Modül |
| `src/actors/actor-registry.ts` | 2 | 2 | Bileşen Tescili (Registry) |
| `src/actors/cheerio-scraper-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/pdf-document-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/playwright-browser-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/browser/stealth-manager.ts` | 2 | 2 | Yardımcı Modül |
| `src/network/crawl-frontier.ts` | 2 | 4 | Yardımcı Modül |
| `src/actors/actor-manifests.ts` | 1 | 5 | Etki Alanı Aktörü (Actor) |
| `src/actors/api-extractor-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/crawler-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/markdown-reader-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/network-interceptor-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/serp-search-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/sitemap-xml-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/browser/browser-session-manager.ts` | 1 | 3 | Oturum Denetleyicisi |
| `src/browser/dom-indexer.ts` | 1 | 3 | Yardımcı Modül |
| `src/browser/interactive-browser-controller.ts` | 1 | 5 | Yardımcı Modül |
| `src/core/run-registry.ts` | 1 | 4 | Bileşen Tescili (Registry) |
| `src/core/server.ts` | 1 | 1 | Giriş Noktası (Server) |
| `src/core/store-router.ts` | 1 | 1 | Yardımcı Modül |
| `src/extractors/robots-parser.ts` | 1 | 3 | Etki Alanı Aktörü (Actor) |
| `src/network/crawl-url-accumulator.ts` | 1 | 3 | Yardımcı Modül |
| `src/network/politeness-limiter.ts` | 1 | 2 | Yardımcı Modül |
| `src/server.ts` | 1 | 0 | Giriş Noktası (Server) |
| `scripts/checkpoint.mjs` | 0 | 3 | Yardımcı Modül |
| `scripts/consolidate-memory.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/doctor.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/generate-connectome.mjs` | 0 | 4 | Sistem Haritacısı |
| `scripts/harvest-ekutuphane.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/harvest-ktb-ekitap.mjs` | 0 | 1 | Yardımcı Modül |
| `scripts/omega-mcp-server.mjs` | 0 | 0 | Giriş Noktası (Server) |
| `scripts/omega-memory.mjs` | 0 | 0 | Semantik Bellek |
| `scripts/sca-check.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/verify-pipeline.mjs` | 0 | 0 | Doğrulama Hattı |
| `src/core/index.ts` | 0 | 0 | Yardımcı Modül |
| `src/index.ts` | 0 | 0 | Yardımcı Modül |
| `tests/api-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/browser-pool.test.ts` | 0 | 0 | Kaynak Yöneticisi (BrowserPool) |
| `tests/browser-session-manager.test.ts` | 0 | 0 | Oturum Denetleyicisi |
| `tests/crawl-frontier.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/crawler-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/dom-indexer.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/interactive-browser-controller.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/markdown-reader-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/network-interceptor-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/pdf-document-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/politeness-limiter.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/proxy-manager.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/readability-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/retry-handler.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/robots-parser.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/safe-redirect-fetcher.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/scraping-actors.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/serp-search-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/server.test.ts` | 0 | 0 | Giriş Noktası (Server) |
| `tests/session-vault.test.ts` | 0 | 0 | Oturum Denetleyicisi |
| `tests/sitemap-xml-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/ssrf-guard.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/stealth-manager.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/store-api.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/structured-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |

## Kayıtlı API Rotaları

| Route | Method | Bağlı Actor / Controller |
|---|---|---|
| `/health` | GET | BrowserPool (health) |
| `/api/v1/actors` | GET | ActorRegistry (list) |
| `/actors` | GET | ActorRegistry (list) |
| `/api/v1/actors` | POST | ActorRegistry (execute) |
| `/actors` | POST | ActorRegistry (execute) |
| `/api/v1/scrape` | POST | CheerioScraperActor / PlaywrightBrowserActor |
| `/scrape` | POST | CheerioScraperActor / PlaywrightBrowserActor |
| `/api/v1/crawl` | POST | CrawlerActor |
| `/crawl` | POST | CrawlerActor |
| `/api/v1/sitemap` | POST | SitemapXmlActor |
| `/sitemap` | POST | SitemapXmlActor |
| `/api/v1/reader` | POST | MarkdownReaderActor |
| `/reader` | POST | MarkdownReaderActor |
| `/api/v1/network/intercept` | POST | NetworkInterceptorActor |
| `/network/intercept` | POST | NetworkInterceptorActor |
| `/api/v1/search` | POST | SerpSearchActor |
| `/search` | POST | SerpSearchActor |
| `/api/v1/pdf` | POST | PdfDocumentActor |
| `/pdf` | POST | PdfDocumentActor |
| `/api/v1/browser/action` | POST | InteractiveBrowserController.executeAction |
| `/browser/action` | POST | InteractiveBrowserController.executeAction |
| `/api/v1/browser/session/:id` | DELETE | InteractiveBrowserController.closeSession |
| `/browser/session/:id` | DELETE | InteractiveBrowserController.closeSession |
| `/:id` | GET | — |
| `/store` | GET | — |
| `/dashboard` | GET | — |
| `/.well-known/mcp.json` | GET | — |
| `/api/v1/store/actors` | GET | ActorRegistry (list) |
| `/api/v1/store/actors/:id` | GET | ActorRegistry (list) |
| `/api/v1/store/actors/:id` | POST | ActorRegistry (execute) |
| `/api/v1/store/runs` | GET | — |
| `/api/v1/store/runs/:id` | GET | — |
| `/api/v1/store/quarantine` | GET | — |

## Kayıtlı Aktörler & Bileşenler

| Anahtar | Sınıf |
|---|---|
| `cheerio-scraper` | `CheerioScraperActor` |
| `playwright-browser` | `PlaywrightBrowserActor` |
| `api-extractor` | `ApiExtractorActor` |
| `crawler` | `CrawlerActor` |
| `sitemap-xml` | `SitemapXmlActor` |
| `markdown-reader` | `MarkdownReaderActor` |
| `network-interceptor` | `NetworkInterceptorActor` |
| `serp-search` | `SerpSearchActor` |
| `pdf-document` | `PdfDocumentActor` |

## İhraç Edilen Semboller ve Arayüz Kontratları (AST)

### `scripts/checkpoint.mjs`

**Fonksiyonlar (Functions):**
- `createCheckpoint(label): void`
- `listCheckpoints(): void`
- `rollbackCheckpoint(targetId): void`

### `scripts/generate-connectome.mjs`

**Fonksiyonlar (Functions):**
- `scanFiles(dir, maxDepth, currentDepth): void`
- `parseFileAST(filePath, sourceText): void`
- `buildDependencyGraph(fileMap): void`
- `generateConnectome(target): void`

### `scripts/harvest-ktb-ekitap.mjs`

**Fonksiyonlar (Functions):**
- `sanitizeTextForLlm(pages): void`

### `scripts/telemetry-logger.mjs`

**Fonksiyonlar (Functions):**
- `logTrace(entry, telemetryFile): void`
- `createTraceSession(task, tier, telemetryFile): void`

### `src/actors/actor-manifests.ts`

**Arayüzler (Interfaces):**
- `interface ActorInputField` (9 üye)
- `interface ActorInputSchema` (5 üye)
- `interface ActorManifest` (13 üye)
**Tipler (Types):**
- `type ActorCategory`

### `src/actors/actor-registry.ts`

**Sınıflar (Classes):**
- `class ActorRegistry`
  - `register(actor: IActor<unknown>): void`
  - `get(type: ActorType): IActor<T> | undefined`
  - `has(type: ActorType): boolean`
  - `list(): IActor<unknown>[]`
**Fonksiyonlar (Functions):**
- `createDefaultActorRegistry(): ActorRegistry`

### `src/actors/api-extractor-actor.ts`

**Sınıflar (Classes):**
- `class ApiExtractorActor`
  - `getNestedValue(obj: unknown, path: string): unknown`
  - `applyProjection(data: unknown, keys: string[]): unknown`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ApiExtractorResult>>`
  - `executeRequest(url: string, method: string, options: ApiExtractorTaskOptions, timeoutMs: number): Promise<{ status: number; headers: Record<string, string>; data: unknown }>`

### `src/actors/cheerio-scraper-actor.ts`

**Sınıflar (Classes):**
- `class CheerioScraperActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ScrapedPageResult>>`

### `src/actors/crawler-actor.ts`

**Sınıflar (Classes):**
- `class CrawlerActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<CrawlerResult>>`

### `src/actors/markdown-reader-actor.ts`

**Sınıflar (Classes):**
- `class MarkdownReaderActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<MarkdownReaderResult>>`
  - `distillHtml(html: string, targetUrl: string, options: MarkdownReaderTaskOptions): MarkdownReaderResult`
  - `extractHeadings(markdown: string): MarkdownHeadingItem[]`
  - `renderToc(headings: MarkdownHeadingItem[]): string`
  - `generateFrontmatter(meta: Record<string, string | number | undefined>): string`

### `src/actors/network-interceptor-actor.ts`

**Sınıflar (Classes):**
- `class NetworkInterceptorActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<NetworkInterceptorResult>>`

### `src/actors/pdf-document-actor.ts`

**Sınıflar (Classes):**
- `class PdfDocumentActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PdfDocumentResult>>`
  - `validatePdfMagicBytes(data: Uint8Array): boolean`

### `src/actors/playwright-browser-actor.ts`

**Sınıflar (Classes):**
- `class PlaywrightBrowserActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ScrapedPageResult>>`

### `src/actors/serp-search-actor.ts`

**Sınıflar (Classes):**
- `class SerpSearchActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<SerpSearchResult>>`
  - `parseSerpHtml(html: string, maxResults: number): SerpResultItem[]`

### `src/actors/sitemap-xml-actor.ts`

**Sınıflar (Classes):**
- `class SitemapXmlActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<SitemapResult>>`
  - `fetchXml(url: string, signal: AbortSignal): Promise<string>`
  - `crawlSitemapRecursive(url: string, currentDepth: number, maxDepth: number, maxUrls: number, filterPatterns: string[] | undefined, aggregatedUrls: SitemapUrlEntry[], subSitemapsList: string[], signal: AbortSignal, setIndexFlag: (isIndex: boolean) => void): Promise<void>`

### `src/browser/browser-pool.ts`

**Sınıflar (Classes):**
- `class BrowserPool`
  - `resolveExecutablePath(): string | undefined`
  - `getBrowser(): Promise<Browser>`
  - `scheduleIdleShutdown(): void`
  - `acquireSession(options: AcquireContextOptions): Promise<PooledBrowserSession>`
  - `getActiveContexts(): number`
  - `shutdown(): Promise<void>`
**Arayüzler (Interfaces):**
- `interface BrowserPoolOptions` (2 üye)
- `interface AcquireContextOptions` (7 üye)
- `interface PooledBrowserSession` (3 üye)

### `src/browser/browser-session-manager.ts`

**Sınıflar (Classes):**
- `class BrowserSessionManager`
  - `onSessionClosed(fn: (sessionId: string) => void): void`
  - `getOrCreateSession(sessionId: string, options: AcquireContextOptions): Promise<BrowserSessionState>`
  - `touchSession(session: BrowserSessionState): void`
  - `getActivePage(sessionId: string, options: AcquireContextOptions): Promise<Page>`
  - `createTab(sessionId: string, url: string): Promise<{ tabId: string; page: Page }>`
  - `switchTab(sessionId: string, tabId: string): Promise<Page>`
  - `closeTab(sessionId: string, tabId: string): Promise<{ remainingTabs: string[]; activeTabId: string }>`
  - `listTabs(sessionId: string): Promise<BrowserTabInfo[]>`
  - `closeSession(sessionId: string): Promise<void>`
  - `shutdownAll(): Promise<void>`
**Arayüzler (Interfaces):**
- `interface BrowserTabInfo` (4 üye)
- `interface BrowserSessionState` (8 üye)

### `src/browser/dom-indexer.ts`

**Sınıflar (Classes):**
- `class DOMIndexer`
  - `indexPage(page: Page): Promise<DOMIndexResult>`
  - `injectBadges(page: Page, elements: IndexedElement[]): Promise<void>`
  - `removeBadges(page: Page): Promise<void>`
**Arayüzler (Interfaces):**
- `interface IndexedElement` (13 üye)
- `interface DOMIndexResult` (3 üye)

### `src/browser/interactive-browser-controller.ts`

**Sınıflar (Classes):**
- `class InteractiveBrowserController`
  - `cleanupSession(sessionId: string): void`
  - `attachListeners(sessionId: string, page: Page): void`
  - `navigate(sessionId: string, url: string, options: { captureScreenshot?: boolean; timeoutMs?: number }): Promise<BrowserActionResult>`
  - `click(sessionId: string, target: BrowserActionTarget, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `type(sessionId: string, target: BrowserActionTarget, text: string, options: TypeActionOptions & { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `pressKey(sessionId: string, key: string, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `scroll(sessionId: string, direction: "up" | "down" | "top" | "bottom", amount, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `selectOption(sessionId: string, target: BrowserActionTarget, value: string, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `hover(sessionId: string, target: BrowserActionTarget, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `extractContent(sessionId: string, selector: string, format: "text" | "markdown" | "html"): Promise<BrowserActionResult>`
  - `captureScreenshot(sessionId: string, withBadges): Promise<{ base64: string; elements: IndexedElement[]; manifest: string }>`
  - `evaluate(sessionId: string, script: string): Promise<BrowserActionResult>`
  - `createTab(sessionId: string, url: string): Promise<BrowserActionResult>`
  - `switchTab(sessionId: string, tabId: string): Promise<BrowserActionResult>`
  - `closeTab(sessionId: string, tabId: string): Promise<BrowserActionResult>`
  - `screenshot(sessionId: string, _withBadges): Promise<BrowserActionResult>`
  - `executeAction(sessionId: string, action: string, params: BrowserActionParams): Promise<BrowserActionResult>`
  - `closeSession(sessionId: string): Promise<void>`
  - `buildActionResult(sessionId: string, page: Page, action: string, captureScreenshot: boolean): Promise<BrowserActionResult>`
**Arayüzler (Interfaces):**
- `interface BrowserActionTarget` (4 üye)
- `interface BrowserActionResult` (12 üye)
- `interface TypeActionOptions` (3 üye)
- `interface BrowserActionParams` (20 üye)

### `src/browser/session-vault.ts`

**Sınıflar (Classes):**
- `class SessionVault`
  - `saveState(context: BrowserContext, filePath: string): Promise<StoredSessionState>`
  - `loadState(filePath: string): StoredSessionState | undefined`
  - `hasState(filePath: string): boolean`
**Arayüzler (Interfaces):**
- `interface StoredCookie` (8 üye)
- `interface StoredOriginStorage` (2 üye)
- `interface StoredSessionState` (2 üye)

### `src/browser/stealth-manager.ts`

**Sınıflar (Classes):**
- `class StealthManager`
  - `getRandomProfile(): StealthProfile`
  - `getInitScript(): () => void`
  - `simulateHumanInteraction(page: {
    evaluate: (fn: () => void) => Promise<unknown>;
    waitForTimeout?: (ms: number) => Promise<void>;
  }): Promise<void>`
**Arayüzler (Interfaces):**
- `interface StealthProfile` (3 üye)

### `src/core/run-registry.ts`

**Sınıflar (Classes):**
- `class RunRegistry`
  - `createRun(actorName: string, input: Record<string, unknown>): RunRecord`
  - `getRun(runId: string): RunRecord | undefined`
  - `listRuns(limit): RunRecord[]`
  - `startRun(runId: string): void`
  - `appendLog(runId: string, level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO", message: string): void`
  - `completeRun(runId: string, output: unknown, itemCount): void`
  - `failRun(runId: string, errorMessage: string): void`
**Arayüzler (Interfaces):**
- `interface RunRecord` (11 üye)
**Tipler (Types):**
- `type RunStatus`

### `src/core/server.ts`

**Fonksiyonlar (Functions):**
- `createServer(): http.Server`

### `src/core/store-router.ts`

**Sınıflar (Classes):**
- `class StoreRouter`
  - `handleListActors(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleGetActor(res: http.ServerResponse, name: string): void`
  - `handleRunActor(res: http.ServerResponse, name: string, body: Record<string, unknown>): Promise<void>`
  - `handleListRuns(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleGetRun(res: http.ServerResponse, runId: string): void`
  - `handleRunEventsSSE(res: http.ServerResponse, runId: string): void`
  - `handleGetQuarantine(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleGetMcpCatalog(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleServeWeb(_req: http.IncomingMessage, res: http.ServerResponse): void`

### `src/core/types.ts`

**Arayüzler (Interfaces):**
- `interface ExtractedTable` (5 üye)
- `interface ScrapedPageResult` (16 üye)
- `interface ApiPaginationConfig` (7 üye)
- `interface ApiExtractorTaskOptions` (9 üye)
- `interface ApiExtractorResult` (5 üye)
- `interface CrawledPageData` (6 üye)
- `interface CrawlerTaskOptions` (15 üye)
- `interface CrawlerResult` (4 üye)
- `interface SitemapUrlEntry` (4 üye)
- `interface SitemapTaskOptions` (5 üye)
- `interface SitemapResult` (5 üye)
- `interface MarkdownHeadingItem` (3 üye)
- `interface MarkdownReaderTaskOptions` (6 üye)
- `interface MarkdownReaderResult` (14 üye)
- `interface InterceptedApiResponse` (7 üye)
- `interface NetworkInterceptorTaskOptions` (5 üye)
- `interface NetworkInterceptorResult` (3 üye)
- `interface SerpResultItem` (5 üye)
- `interface SerpSearchTaskOptions` (3 üye)
- `interface SerpSearchResult` (3 üye)
- `interface PdfDocumentMetadata` (6 üye)
- `interface PdfPageEntry` (4 üye)
- `interface PdfDocumentTaskOptions` (3 üye)
- `interface PdfDocumentResult` (8 üye)
- `interface ActorTask` (5 üye)
- `interface ActorResult` (7 üye)
- `interface ActorRunContext` (2 üye)
- `interface IActor` (3 üye)
**Tipler (Types):**
- `type EntityId`
- `type ActorType`

### `src/extractors/readability-extractor.ts`

**Sınıflar (Classes):**
- `class ReadabilityExtractor`
  - `extract(rawHtml: string, targetUrl: string, options: ReadabilityExtractOptions): ReadabilityExtractResult`
  - `fallbackExtract(html: string, turndown: TurndownService): ReadabilityExtractResult`
**Arayüzler (Interfaces):**
- `interface ReadabilityExtractOptions` (4 üye)
- `interface ReadabilityExtractResult` (9 üye)

### `src/extractors/robots-parser.ts`

**Sınıflar (Classes):**
- `class RobotsParser`
  - `parse(content: string): void`
  - `findMatchingGroup(userAgent: string): UserAgentGroup | undefined`
  - `matchPattern(pathname: string, pattern: string): boolean`
  - `isAllowed(urlOrPath: string, userAgent): boolean`
  - `getCrawlDelay(userAgent): number | undefined`
  - `fetchForOrigin(targetUrl: string, options: { timeoutMs?: number; allowLocalNetwork?: boolean }): Promise<RobotsParser>`
  - `clearCache(): void`
**Arayüzler (Interfaces):**
- `interface RobotsRule` (2 üye)
- `interface UserAgentGroup` (3 üye)

### `src/extractors/structured-extractor.ts`

**Sınıflar (Classes):**
- `class StructuredExtractor`
  - `extractTables(html: string): ExtractedTable[]`
  - `extractJsonLd(html: string): unknown[]`
  - `extractMetaTags(html: string): Record<string, string>`

### `src/network/crawl-frontier.ts`

**Sınıflar (Classes):**
- `class CrawlFrontier`
  - `loadCheckpoint(): void`
  - `enqueue(url: string, depth: number): boolean`
  - `dequeue(): FrontierItem | undefined`
  - `hasMore(): boolean`
  - `size(): number`
  - `getVisitedCount(): number`
  - `getTotalCrawled(): number`
  - `isVisited(url: string): boolean`
  - `appendPage(page: CrawledPageData): void`
  - `saveCheckpoint(): void`
  - `readAllPages(): CrawledPageData[]`
  - `clear(): void`
**Arayüzler (Interfaces):**
- `interface FrontierItem` (2 üye)
- `interface FrontierCheckpoint` (4 üye)
- `interface CrawlFrontierOptions` (3 üye)

### `src/network/crawl-url-accumulator.ts`

**Sınıflar (Classes):**
- `class CrawlUrlAccumulator`
  - `addUrls(urls: string[], depth: number): void`
  - `next(): CrawlItem | undefined`
  - `hasMore(): boolean`
  - `getVisitedUrls(): string[]`
  - `getQueueSize(): number`
  - `getVisitedCount(): number`
**Arayüzler (Interfaces):**
- `interface CrawlAccumulatorConfig` (6 üye)
- `interface CrawlItem` (2 üye)

### `src/network/politeness-limiter.ts`

**Sınıflar (Classes):**
- `class PolitenessLimiter`
  - `setMinInterval(ms: number): void`
  - `extractHostname(rawUrl: string): string`
  - `computeJitter(baseDelay: number): number`
  - `waitForSlot(url: string): Promise<number>`
  - `recordRateLimit(url: string, retryAfterSeconds: number): void`
  - `recordSuccess(url: string): void`
  - `getBackoffMs(url: string): number`
  - `clear(): void`
**Arayüzler (Interfaces):**
- `interface PolitenessLimiterOptions` (3 üye)

### `src/network/proxy-manager.ts`

**Sınıflar (Classes):**
- `class ProxyManager`
  - `addProxy(proxyInput: string | ProxyConfig): ProxyConfig`
  - `addProxies(proxyList: Array<string | ProxyConfig>): void`
  - `getProxyKey(config: ProxyConfig): string`
  - `getHealthyProxies(): ProxyConfig[]`
  - `getProxy(options: {
    domain?: string;
    strategy?: ProxyRotationStrategy;
  }): ProxyConfig | undefined`
  - `recordFailure(proxy: ProxyConfig | string): void`
  - `recordSuccess(proxy: ProxyConfig | string): void`
  - `getDispatcher(proxy: ProxyConfig): ProxyAgent`
  - `size(): number`
  - `clear(): void`
**Arayüzler (Interfaces):**
- `interface ProxyConfig` (3 üye)
- `interface ProxyManagerOptions` (2 üye)
**Tipler (Types):**
- `type ProxyRotationStrategy`

### `src/network/retry-handler.ts`

**Fonksiyonlar (Functions):**
- `isRetryableError(error: unknown, retryableStatuses): boolean`
- `parseRetryAfter(headerValue: string | null | undefined): number | undefined`
- `withRetry(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T>`
**Arayüzler (Interfaces):**
- `interface RetryOptions` (7 üye)

### `src/network/safe-redirect-fetcher.ts`

**Fonksiyonlar (Functions):**
- `safeRedirectFetch(initialUrl: string, options: SafeFetchOptions): Promise<Response>`
**Arayüzler (Interfaces):**
- `interface SafeFetchOptions` (5 üye)

### `src/network/ssrf-guard.ts`

**Sınıflar (Classes):**
- `class SSRFGuard`
  - `isPrivateIPv4(ip: string): boolean`
  - `parseIPv6Segments(ip: string): number[] | null`
  - `isPrivateIPv6(ip: string): boolean`
  - `isPrivateIp(ip: string): boolean`
  - `validateUrl(rawUrl: string, options: SSRFGuardOptions): SSRFValidationResult`
  - `validateUrlWithDns(rawUrl: string, options: SSRFGuardOptions): Promise<SSRFValidationResult>`
**Arayüzler (Interfaces):**
- `interface SSRFValidationResult` (4 üye)
- `interface SSRFGuardOptions` (1 üye)

### `src/network/url-normalizer.ts`

**Fonksiyonlar (Functions):**
- `normalizeUrl(rawUrl: string, options: SSRFGuardOptions): UrlNormalizationResult`
**Arayüzler (Interfaces):**
- `interface UrlNormalizationResult` (3 üye)

### `src/network/url-pattern-matcher.ts`

**Fonksiyonlar (Functions):**
- `isValidUrlPattern(pattern: string): boolean`
- `matchUrlPattern(url: string, pattern: string): boolean`

## Modül ve Dosya Envanteri

| Dosya Yolu |
|---|
| `scripts/checkpoint.mjs` |
| `scripts/consolidate-memory.mjs` |
| `scripts/doctor.mjs` |
| `scripts/generate-connectome.mjs` |
| `scripts/harvest-ekutuphane.mjs` |
| `scripts/harvest-ktb-ekitap.mjs` |
| `scripts/omega-mcp-server.mjs` |
| `scripts/omega-memory.mjs` |
| `scripts/sca-check.mjs` |
| `scripts/telemetry-logger.mjs` |
| `scripts/verify-pipeline.mjs` |
| `src/actors/actor-manifests.ts` |
| `src/actors/actor-registry.ts` |
| `src/actors/api-extractor-actor.ts` |
| `src/actors/cheerio-scraper-actor.ts` |
| `src/actors/crawler-actor.ts` |
| `src/actors/markdown-reader-actor.ts` |
| `src/actors/network-interceptor-actor.ts` |
| `src/actors/pdf-document-actor.ts` |
| `src/actors/playwright-browser-actor.ts` |
| `src/actors/serp-search-actor.ts` |
| `src/actors/sitemap-xml-actor.ts` |
| `src/browser/browser-pool.ts` |
| `src/browser/browser-session-manager.ts` |
| `src/browser/dom-indexer.ts` |
| `src/browser/interactive-browser-controller.ts` |
| `src/browser/session-vault.ts` |
| `src/browser/stealth-manager.ts` |
| `src/core/index.ts` |
| `src/core/run-registry.ts` |
| `src/core/server.ts` |
| `src/core/store-router.ts` |
| `src/core/types.ts` |
| `src/extractors/readability-extractor.ts` |
| `src/extractors/robots-parser.ts` |
| `src/extractors/structured-extractor.ts` |
| `src/index.ts` |
| `src/network/crawl-frontier.ts` |
| `src/network/crawl-url-accumulator.ts` |
| `src/network/politeness-limiter.ts` |
| `src/network/proxy-manager.ts` |
| `src/network/retry-handler.ts` |
| `src/network/safe-redirect-fetcher.ts` |
| `src/network/ssrf-guard.ts` |
| `src/network/url-normalizer.ts` |
| `src/network/url-pattern-matcher.ts` |
| `src/server.ts` |
| `tests/api-extractor.test.ts` |
| `tests/browser-pool.test.ts` |
| `tests/browser-session-manager.test.ts` |
| *... ve 22 dosya daha* |

