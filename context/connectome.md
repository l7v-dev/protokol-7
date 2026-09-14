# Connectome — Otomatik Üretilen Sistem Haritası

> Bu dosya `scripts/generate-connectome.mjs` ile üretildi (2026-09-14). Elle düzenlenmez.

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

## Modül ve Dosya Envanteri

| Dosya Yolu |
|---|
| `scripts/consolidate-memory.mjs` |
| `scripts/generate-connectome.mjs` |
| `scripts/omega-mcp-server.mjs` |
| `scripts/omega-memory.mjs` |
| `scripts/sca-check.mjs` |
| `scripts/verify-pipeline.mjs` |
| `src/actor-registry.ts` |
| `src/api-extractor-actor.ts` |
| `src/browser-pool.ts` |
| `src/browser-session-manager.ts` |
| `src/cheerio-scraper-actor.ts` |
| `src/crawl-url-accumulator.ts` |
| `src/crawler-actor.ts` |
| `src/dom-indexer.ts` |
| `src/index.ts` |
| `src/interactive-browser-controller.ts` |
| `src/markdown-reader-actor.ts` |
| `src/playwright-browser-actor.ts` |
| `src/politeness-limiter.ts` |
| `src/readability-extractor.ts` |
| `src/robots-parser.ts` |
| `src/server.ts` |
| `src/sitemap-xml-actor.ts` |
| `src/ssrf-guard.ts` |
| `src/stealth-manager.ts` |
| `src/structured-extractor.ts` |
| `src/types.ts` |
| `src/url-normalizer.ts` |
| `src/url-pattern-matcher.ts` |
| `tests/api-extractor.test.ts` |
| `tests/browser-pool.test.ts` |
| `tests/browser-session-manager.test.ts` |
| `tests/crawler-actor.test.ts` |
| `tests/dom-indexer.test.ts` |
| `tests/interactive-browser-controller.test.ts` |
| `tests/markdown-reader-actor.test.ts` |
| `tests/politeness-limiter.test.ts` |
| `tests/readability-extractor.test.ts` |
| `tests/robots-parser.test.ts` |
| `tests/scraping-actors.test.ts` |
| `tests/server.test.ts` |
| `tests/sitemap-xml-actor.test.ts` |
| `tests/ssrf-guard.test.ts` |
| `tests/stealth-manager.test.ts` |
| `tests/structured-extractor.test.ts` |

