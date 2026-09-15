# Connectome — Otomatik Üretilen Sistem Haritası

> Bu dosya `scripts/generate-connectome.mjs` ile üretildi (2026-09-15). Elle düzenlenmez.

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

## Modül ve Dosya Envanteri

| Dosya Yolu |
|---|
| `scripts/consolidate-memory.mjs` |
| `scripts/generate-connectome.mjs` |
| `scripts/omega-mcp-server.mjs` |
| `scripts/omega-memory.mjs` |
| `scripts/sca-check.mjs` |
| `scripts/verify-pipeline.mjs` |
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
| `src/browser/stealth-manager.ts` |
| `src/core/index.ts` |
| `src/core/server.ts` |
| `src/core/types.ts` |
| `src/extractors/readability-extractor.ts` |
| `src/extractors/robots-parser.ts` |
| `src/extractors/structured-extractor.ts` |
| `src/index.ts` |
| `src/network/crawl-url-accumulator.ts` |
| `src/network/politeness-limiter.ts` |
| `src/network/ssrf-guard.ts` |
| `src/network/url-normalizer.ts` |
| `src/network/url-pattern-matcher.ts` |
| `src/server.ts` |
| `tests/api-extractor.test.ts` |
| `tests/browser-pool.test.ts` |
| `tests/browser-session-manager.test.ts` |
| `tests/crawler-actor.test.ts` |
| `tests/dom-indexer.test.ts` |
| `tests/interactive-browser-controller.test.ts` |
| `tests/markdown-reader-actor.test.ts` |
| `tests/network-interceptor-actor.test.ts` |
| `tests/pdf-document-actor.test.ts` |
| `tests/politeness-limiter.test.ts` |
| `tests/readability-extractor.test.ts` |
| `tests/robots-parser.test.ts` |
| `tests/scraping-actors.test.ts` |
| `tests/serp-search-actor.test.ts` |
| `tests/server.test.ts` |
| `tests/sitemap-xml-actor.test.ts` |
| *... ve 3 dosya daha* |

