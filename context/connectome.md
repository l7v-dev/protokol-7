# Connectome — Otomatik Üretilen Sistem Haritası

> Bu dosya `scripts/generate-connectome.mjs` ile üretildi (2026-09-26). Elle düzenlenmez.
> Çözümleyici Motor: TypeScript Compiler API AST (v5.9.3)

## Çekirdek Modüller ve Mimari Düğümler (Centrality)

Bu tablo, diğer modüller tarafından en çok referans verilen (PageRank benzeri in-degree) merkezi bileşenleri gösterir.

| Modül / Dosya | İçe Aktarılma (In-Degree) | İhraç Sembol Sayısı | Rol / Açıklama |
|---|---|---|---|
| `src/core/types.ts` | 29 | 65 | Yardımcı Modül |
| `src/network/ssrf-guard.ts` | 18 | 3 | Yardımcı Modül |
| `src/network/safe-redirect-fetcher.ts` | 16 | 2 | Yardımcı Modül |
| `src/core/server.ts` | 11 | 1 | Giriş Noktası (Server) |
| `src/server.ts` | 11 | 0 | Giriş Noktası (Server) |
| `src/network/proxy-manager.ts` | 5 | 5 | Yardımcı Modül |
| `src/actors/actor-registry.ts` | 4 | 2 | Bileşen Tescili (Registry) |
| `src/browser/browser-pool.ts` | 4 | 4 | Kaynak Yöneticisi (BrowserPool) |
| `src/browser/session-vault.ts` | 4 | 4 | Oturum Denetleyicisi |
| `src/extractors/structured-extractor.ts` | 4 | 1 | Etki Alanı Aktörü (Actor) |
| `src/network/url-normalizer.ts` | 4 | 2 | Yardımcı Modül |
| `src/network/url-pattern-matcher.ts` | 4 | 2 | Yardımcı Modül |
| `scripts/telemetry-logger.mjs` | 3 | 4 | Yardımcı Modül |
| `src/extractors/readability-extractor.ts` | 3 | 3 | Etki Alanı Aktörü (Actor) |
| `src/integrations/pipedream-connect.ts` | 3 | 6 | Yardımcı Modül |
| `src/network/retry-handler.ts` | 3 | 4 | Yardımcı Modül |
| `src/actors/actor-manifests.ts` | 2 | 5 | Etki Alanı Aktörü (Actor) |
| `src/actors/arxiv-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/cheerio-scraper-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/europe-pmc-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/gutenberg-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/ietf-rfc-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/ktb-ekitap-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/openalex-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/pdf-document-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/playwright-browser-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/saglik-ekutuphane-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/stack-exchange-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/wikimedia-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/browser/stealth-manager.ts` | 2 | 2 | Yardımcı Modül |
| `src/network/crawl-frontier.ts` | 2 | 4 | Yardımcı Modül |
| `src/actors/api-extractor-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/crawler-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/markdown-reader-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/network-interceptor-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/serp-search-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/sitemap-xml-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/browser/browser-session-manager.ts` | 1 | 3 | Oturum Denetleyicisi |
| `src/browser/dom-indexer.ts` | 1 | 3 | Yardımcı Modül |
| `src/browser/interactive-browser-controller.ts` | 1 | 5 | Yardımcı Modül |
| `src/core/context-guard.ts` | 1 | 3 | Yardımcı Modül |
| `src/core/openapi-spec.ts` | 1 | 2 | Yardımcı Modül |
| `src/core/run-registry.ts` | 1 | 4 | Bileşen Tescili (Registry) |
| `src/core/store-router.ts` | 1 | 1 | Yardımcı Modül |
| `src/extractors/robots-parser.ts` | 1 | 3 | Etki Alanı Aktörü (Actor) |
| `src/mcp/protokol-mcp-server.ts` | 1 | 3 | Giriş Noktası (Server) |
| `src/network/crawl-url-accumulator.ts` | 1 | 3 | Yardımcı Modül |
| `src/network/politeness-limiter.ts` | 1 | 2 | Yardımcı Modül |
| `scripts/checkpoint.mjs` | 0 | 3 | Yardımcı Modül |
| `scripts/consolidate-memory.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/doctor.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/generate-connectome.mjs` | 0 | 4 | Sistem Haritacısı |
| `scripts/harvest-ekutuphane.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/harvest-ktb-ekitap.mjs` | 0 | 1 | Yardımcı Modül |
| `scripts/omega-mcp-server.mjs` | 0 | 0 | Giriş Noktası (Server) |
| `scripts/omega-memory.mjs` | 0 | 0 | Semantik Bellek |
| `scripts/pipedream-cli.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/sca-check.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/verify-pipeline.mjs` | 0 | 0 | Doğrulama Hattı |
| `src/core/index.ts` | 0 | 0 | Yardımcı Modül |
| `src/index.ts` | 0 | 0 | Yardımcı Modül |
| `tests/api-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/arxiv-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/browser-pool.test.ts` | 0 | 0 | Kaynak Yöneticisi (BrowserPool) |
| `tests/browser-session-manager.test.ts` | 0 | 0 | Oturum Denetleyicisi |
| `tests/context-guard.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/crawl-frontier.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/crawler-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/dom-indexer.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/europe-pmc-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/gutenberg-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/ietf-rfc-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/interactive-browser-controller.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/ktb-ekitap-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/markdown-reader-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/network-interceptor-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/openalex-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/pdf-document-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/pipedream-connect.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/politeness-limiter.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/protokol-mcp-server.test.ts` | 0 | 0 | Giriş Noktası (Server) |
| `tests/proxy-manager.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/readability-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/retry-handler.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/robots-parser.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/safe-redirect-fetcher.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/saglik-ekutuphane-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/scraping-actors.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/serp-search-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/server.test.ts` | 0 | 0 | Giriş Noktası (Server) |
| `tests/session-vault.test.ts` | 0 | 0 | Oturum Denetleyicisi |
| `tests/sitemap-xml-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/ssrf-guard.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/stack-exchange-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/stealth-manager.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/store-api.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/structured-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikimedia-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |

## Kayıtlı API Rotaları

| Route | Method | Bağlı Actor / Controller |
|---|---|---|
| `/openapi.json` | GET | — |
| `/docs` | GET | — |
| `/api-docs` | GET | — |
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
| `/api/v1/arxiv` | POST | — |
| `/arxiv` | POST | — |
| `/api/v1/wikimedia` | POST | — |
| `/wikimedia` | POST | — |
| `/api/v1/openalex` | POST | — |
| `/openalex` | POST | — |
| `/api/v1/stack-exchange` | POST | — |
| `/stack-exchange` | POST | — |
| `/api/v1/gutenberg` | POST | — |
| `/gutenberg` | POST | — |
| `/api/v1/europe-pmc` | POST | — |
| `/europe-pmc` | POST | — |
| `/api/v1/ietf-rfc` | POST | — |
| `/ietf-rfc` | POST | — |
| `/api/v1/saglik-ekutuphane` | POST | — |
| `/saglik-ekutuphane` | POST | — |
| `/api/v1/ktb-ekitap` | POST | — |
| `/ktb-ekitap` | POST | — |
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
| `/api/v1/pipedream/config` | GET | — |
| `/api/pipedream/config` | GET | — |
| `/api/v1/pipedream/connect-token` | POST | — |
| `/api/v1/pipedream/tokens` | POST | — |
| `/api/pipedream/tokens` | POST | — |
| `/api/v1/pipedream/accounts` | GET | — |
| `/api/pipedream/accounts` | GET | — |
| `/api/v1/pipedream/accounts/:id` | DELETE | — |
| `/api/pipedream/accounts/:id` | DELETE | — |
| `/api/v1/pipedream/mcp/config` | GET | — |
| `/api/pipedream/mcp/config` | GET | — |
| `/api/v1/pipedream/mcp/token` | POST | — |
| `/api/pipedream/mcp/token` | POST | — |

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
| `arxiv` | `ArxivActor` |
| `wikimedia` | `WikimediaActor` |
| `open-alex` | `OpenAlexActor` |
| `stack-exchange` | `StackExchangeActor` |
| `gutenberg` | `GutenbergActor` |
| `europe-pmc` | `EuropePmcActor` |
| `ietf-rfc` | `IetfRfcActor` |
| `saglik-ekutuphane` | `SaglikEkutuphaneActor` |
| `ktb-ekitap` | `KtbEkitapActor` |

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

### `src/actors/arxiv-actor.ts`

**Sınıflar (Classes):**
- `class ArxivActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ArxivActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: ArxivActorTaskOptions): string`
  - `extractArxivId(input: string): string | undefined`
  - `parseAtomFeed(xml: string): {
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
    papers: ArxivPaperItem[];
  }`
  - `enrichPapersWithPdfText(papers: ArxivPaperItem[], timeoutMs: number, allowLocalNetwork: boolean): Promise<void>`

### `src/actors/cheerio-scraper-actor.ts`

**Sınıflar (Classes):**
- `class CheerioScraperActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ScrapedPageResult>>`

### `src/actors/crawler-actor.ts`

**Sınıflar (Classes):**
- `class CrawlerActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<CrawlerResult>>`

### `src/actors/europe-pmc-actor.ts`

**Sınıflar (Classes):**
- `class EuropePmcActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<EuropePmcActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: EuropePmcActorTaskOptions): string`

### `src/actors/gutenberg-actor.ts`

**Sınıflar (Classes):**
- `class GutenbergActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<GutenbergActorResult>>`
  - `downloadAndCleanTexts(books: GutenbergBookItem[], maxBytes: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<void>`
  - `stripGutenbergHeaders(rawText: string): string`
  - `buildApiUrl(targetUrl: string | undefined, options: GutenbergActorTaskOptions): string`

### `src/actors/ietf-rfc-actor.ts`

**Sınıflar (Classes):**
- `class IetfRfcActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<IetfRfcActorResult>>`
  - `cleanRfcText(rawText: string): string`
  - `parseRfcTextHeader(text: string, rfcNumber: number): {
    title: string;
    status?: string;
    authors?: string[];
    pubDate?: string;
    abstract?: string;
    obsoletes?: string[];
  }`
  - `resolveRfcNumber(targetUrl: string | undefined, options: IetfRfcActorTaskOptions): number | undefined`
  - `buildRfcTextUrl(targetUrl: string | undefined, rfcNumber: number): string`
  - `buildDatatrackerSearchUrl(targetUrl: string | undefined, options: IetfRfcActorTaskOptions): string`

### `src/actors/ktb-ekitap-actor.ts`

**Sınıflar (Classes):**
- `class KtbEkitapActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<KtbEkitapActorResult>>`
  - `resolveBaseUrl(targetUrl: string): string`
  - `extractIdFromUrl(url: string): number | undefined`
  - `handleListAction(task: ActorTask, baseUrl: string, category: KtbEkitapCategory, page: number, limit: number, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<KtbEkitapActorResult>>`
  - `handleDetailOrExtractAction(task: ActorTask, baseUrl: string, detailUrl: string, explicitBookId: number | undefined, shouldExtractText: boolean, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<KtbEkitapActorResult>>`
  - `sanitizeTextForLlm(pages: string[]): string`

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

### `src/actors/openalex-actor.ts`

**Sınıflar (Classes):**
- `class OpenAlexActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenAlexActorResult>>`
  - `reconstructAbstract(invertedIndex: Record<string, number[]>): string | undefined`
  - `buildApiUrl(targetUrl: string | undefined, options: OpenAlexActorTaskOptions): string`

### `src/actors/pdf-document-actor.ts`

**Sınıflar (Classes):**
- `class PdfDocumentActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PdfDocumentResult>>`
  - `validatePdfMagicBytes(data: Uint8Array): boolean`

### `src/actors/playwright-browser-actor.ts`

**Sınıflar (Classes):**
- `class PlaywrightBrowserActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ScrapedPageResult>>`

### `src/actors/saglik-ekutuphane-actor.ts`

**Sınıflar (Classes):**
- `class SaglikEkutuphaneActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<SaglikEkutuphaneActorResult>>`
  - `resolveBaseUrl(targetUrl: string): string`
  - `extractIdFromUrl(url: string): number | undefined`
  - `handleListAction(task: ActorTask, baseUrl: string, category: SaglikEkutuphaneCategory, page: number, limit: number, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<SaglikEkutuphaneActorResult>>`
  - `handleDetailOrExtractAction(task: ActorTask, baseUrl: string, publicationId: number, shouldExtractText: boolean, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<SaglikEkutuphaneActorResult>>`
  - `parseSizeToBytes(sizeStr: string): number | undefined`

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

### `src/actors/stack-exchange-actor.ts`

**Sınıflar (Classes):**
- `class StackExchangeActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<StackExchangeActorResult>>`
  - `fetchAnswersForQuestions(questionIds: number[], site: string, apiKey: string | undefined, timeoutMs: number, allowLocalNetwork: boolean, baseApiUrl: string): Promise<Map<number, RawAnswer[]>>`
  - `buildSearchUrl(targetUrl: string | undefined, options: StackExchangeActorTaskOptions, site: string): string`

### `src/actors/wikimedia-actor.ts`

**Sınıflar (Classes):**
- `class WikimediaActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikimediaActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikimediaActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `stripHtmlTags(input: string): string`

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

### `src/core/context-guard.ts`

**Sınıflar (Classes):**
- `class ContextGuard`
  - `estimateTokens(text: string): number`
  - `guardMarkdown(content: string, options: ContextGuardOptions): GuardedContentResult`
**Arayüzler (Interfaces):**
- `interface ContextGuardOptions` (4 üye)
- `interface GuardedContentResult` (6 üye)

### `src/core/openapi-spec.ts`

**Fonksiyonlar (Functions):**
- `renderDocsHtml(): string`

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
- `interface MarkdownReaderTaskOptions` (8 üye)
- `interface MarkdownReaderResult` (16 üye)
- `interface InterceptedApiResponse` (7 üye)
- `interface NetworkInterceptorTaskOptions` (5 üye)
- `interface NetworkInterceptorResult` (3 üye)
- `interface SerpResultItem` (5 üye)
- `interface SerpSearchTaskOptions` (4 üye)
- `interface SerpSearchResult` (3 üye)
- `interface PdfDocumentMetadata` (6 üye)
- `interface PdfPageEntry` (4 üye)
- `interface PdfDocumentTaskOptions` (3 üye)
- `interface PdfDocumentResult` (8 üye)
- `interface ArxivAuthor` (2 üye)
- `interface ArxivPaperItem` (16 üye)
- `interface ArxivActorTaskOptions` (8 üye)
- `interface ArxivActorResult` (5 üye)
- `interface WikimediaArticleItem` (9 üye)
- `interface WikimediaActorTaskOptions` (6 üye)
- `interface WikimediaActorResult` (4 üye)
- `interface OpenAlexWorkItem` (12 üye)
- `interface OpenAlexActorTaskOptions` (11 üye)
- `interface OpenAlexActorResult` (5 üye)
- `interface StackExchangeAnswerItem` (6 üye)
- `interface StackExchangeQuestionItem` (10 üye)
- `interface StackExchangeActorTaskOptions` (11 üye)
- `interface StackExchangeActorResult` (5 üye)
- `interface GutenbergBookItem` (8 üye)
- `interface GutenbergActorTaskOptions` (7 üye)
- `interface GutenbergActorResult` (3 üye)
- `interface EuropePmcArticleItem` (13 üye)
- `interface EuropePmcActorTaskOptions` (6 üye)
- `interface EuropePmcActorResult` (4 üye)
- `interface IetfRfcItem` (10 üye)
- `interface IetfRfcActorTaskOptions` (7 üye)
- `interface IetfRfcActorResult` (3 üye)
- `interface SaglikEkutuphaneItem` (12 üye)
- `interface SaglikEkutuphaneTaskOptions` (7 üye)
- `interface SaglikEkutuphaneActorResult` (6 üye)
- `interface KtbEkitapItem` (12 üye)
- `interface KtbEkitapTaskOptions` (8 üye)
- `interface KtbEkitapActorResult` (6 üye)
- `interface ActorTask` (5 üye)
- `interface ActorResult` (7 üye)
- `interface ActorRunContext` (2 üye)
- `interface IActor` (3 üye)
- `interface SelfHealingError` (6 üye)
- `interface SelfHealingErrorResponse` (7 üye)
**Tipler (Types):**
- `type EntityId`
- `type ActorType`
- `type SaglikEkutuphaneCategory`
- `type SaglikEkutuphaneAction`
- `type KtbEkitapCategory`
- `type KtbEkitapAction`

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

### `src/integrations/pipedream-connect.ts`

**Sınıflar (Classes):**
- `class PipedreamConnectService`
  - `isConfigured(): boolean`
  - `getConfigSummary(): {
    projectId: string;
    projectEnvironment: "production" | "development";
    isConfigured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
  }`
  - `getClient(): PipedreamClient`
  - `createConnectToken(options: CreateConnectTokenOptions): Promise<ConnectTokenResult>`
  - `validateConnectToken(token: string, appId: string): Promise<boolean>`
  - `listAccounts(externalUserId: string, app: string): Promise<unknown[]>`
  - `deleteAccount(accountId: string): Promise<void>`
  - `getDeveloperAccessToken(): Promise<string>`
  - `getMcpConfig(options: {
    appSlug: string;
    externalUserId: string;
    developerAccessToken?: string;
  }): PipedreamMcpConfig`
**Arayüzler (Interfaces):**
- `interface PipedreamConnectConfig` (5 üye)
- `interface CreateConnectTokenOptions` (4 üye)
- `interface ConnectTokenResult` (4 üye)
- `interface PipedreamMcpConfig` (7 üye)

### `src/mcp/protokol-mcp-server.ts`

**Sınıflar (Classes):**
- `class ProtokolMcpServer`
  - `getTools(): void`
  - `processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null>`
  - `start(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): void`
  - `close(): void`
**Arayüzler (Interfaces):**
- `interface JsonRpcRequest` (4 üye)
- `interface JsonRpcResponse` (4 üye)

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
  - `pruneStaleDomains(now: number): void`
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
| `scripts/pipedream-cli.mjs` |
| `scripts/sca-check.mjs` |
| `scripts/telemetry-logger.mjs` |
| `scripts/verify-pipeline.mjs` |
| `src/actors/actor-manifests.ts` |
| `src/actors/actor-registry.ts` |
| `src/actors/api-extractor-actor.ts` |
| `src/actors/arxiv-actor.ts` |
| `src/actors/cheerio-scraper-actor.ts` |
| `src/actors/crawler-actor.ts` |
| `src/actors/europe-pmc-actor.ts` |
| `src/actors/gutenberg-actor.ts` |
| `src/actors/ietf-rfc-actor.ts` |
| `src/actors/ktb-ekitap-actor.ts` |
| `src/actors/markdown-reader-actor.ts` |
| `src/actors/network-interceptor-actor.ts` |
| `src/actors/openalex-actor.ts` |
| `src/actors/pdf-document-actor.ts` |
| `src/actors/playwright-browser-actor.ts` |
| `src/actors/saglik-ekutuphane-actor.ts` |
| `src/actors/serp-search-actor.ts` |
| `src/actors/sitemap-xml-actor.ts` |
| `src/actors/stack-exchange-actor.ts` |
| `src/actors/wikimedia-actor.ts` |
| `src/browser/browser-pool.ts` |
| `src/browser/browser-session-manager.ts` |
| `src/browser/dom-indexer.ts` |
| `src/browser/interactive-browser-controller.ts` |
| `src/browser/session-vault.ts` |
| `src/browser/stealth-manager.ts` |
| `src/core/context-guard.ts` |
| `src/core/index.ts` |
| `src/core/openapi-spec.ts` |
| `src/core/run-registry.ts` |
| `src/core/server.ts` |
| `src/core/store-router.ts` |
| `src/core/types.ts` |
| `src/extractors/readability-extractor.ts` |
| `src/extractors/robots-parser.ts` |
| `src/extractors/structured-extractor.ts` |
| `src/index.ts` |
| `src/integrations/pipedream-connect.ts` |
| *... ve 48 dosya daha* |

