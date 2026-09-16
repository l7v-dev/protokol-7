# Architecture Schema

Single source of truth component inventory and file map for `protokol-7`.

---

## 1. Core Source Inventory (`src/`)

### 1.1 Core Runtime (`src/core/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/core/types.ts` | `ScrapedPageResult`, `ActorTask`, `BrowserActionResult`, `CrawlerResult` | Core TypeScript interfaces and shared contract definitions. |
| `src/core/run-registry.ts` | `RunRegistry`, `globalRunRegistry` | Tracks execution runs, in-memory run state, and emits live SSE events. |
| `src/core/store-router.ts` | `StoreRouter` | Actor Store API router, live log SSE streaming, quarantine inspector, and embedded Web MVP dashboard. |
| `src/core/server.ts` | `startServer`, `handleRequest` | Standalone Node.js HTTP REST server and API endpoint routing. |
| `src/core/index.ts` | Core Barrel | Re-exports runtime contracts and HTTP server entrypoint. |
| `src/server.ts` | Server Trampoline | Root-level entrypoint re-exporting `src/core/server.ts`. |
| `src/index.ts` | Unified Barrel | Aggregates all domain actors, browser utilities, extractors, and network tools. |

### 1.2 Actors Layer (`src/actors/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/actors/actor-registry.ts` | `ActorRegistry` | Central registry for discovering, registering, and instantiating extraction actors. |
| `src/actors/actor-manifests.ts` | `ACTOR_MANIFESTS`, `ActorManifest` | Zod/JSON input schemas, metadata, example inputs, and MCP tool declarations. |
| `src/actors/cheerio-scraper-actor.ts` | `CheerioScraperActor` | Static HTML scraping using Cheerio for low-latency DOM extraction. |
| `src/actors/playwright-browser-actor.ts` | `PlaywrightBrowserActor` | Dynamic web scraping using headless Chromium with resource blocking. |
| `src/actors/api-extractor-actor.ts` | `ApiExtractorActor` | REST API extraction actor supporting pagination and projection filtering. |
| `src/actors/crawler-actor.ts` | `CrawlerActor` | BFS web graph crawler with depth limits and concurrency management. |
| `src/actors/sitemap-xml-actor.ts` | `SitemapXmlActor` | XML sitemap, sitemap index traversal, and RSS/Atom feed URL extractor with gzip support. |
| `src/actors/markdown-reader-actor.ts` | `MarkdownReaderActor` | LLM-ready document distiller with YAML frontmatter, heading hierarchy, and token estimation. |
| `src/actors/network-interceptor-actor.ts` | `NetworkInterceptorActor` | Headless browser actor intercepting and extracting background XHR/Fetch JSON API responses. |
| `src/actors/serp-search-actor.ts` | `SerpSearchActor` | Organic search engine result page parser extracting rankings, URLs, snippets, and domains. |
| `src/actors/pdf-document-actor.ts` | `PdfDocumentActor` | Extracts text streams, page boundaries, metrics, and document metadata from PDF files via unpdf. |

### 1.3 Browser Engine (`src/browser/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/browser/browser-pool.ts` | `BrowserPool` | Singleton Playwright Chromium pool with 60s idle timeout and session isolation. |
| `src/browser/browser-session-manager.ts` | `BrowserSessionManager` | In-memory tracking and expiration of active interactive browser sessions. |
| `src/browser/interactive-browser-controller.ts` | `InteractiveBrowserController` | Stateful browser actions (`navigate`, `click`, `fill`, `screenshot`, `evaluate`). |
| `src/browser/stealth-manager.ts` | `StealthManager` | Headless Chromium anti-detection masking (`navigator.webdriver` evasion). |
| `src/browser/dom-indexer.ts` | `DomIndexer` | Indexes DOM elements for interactive selector targeting. |
| `src/browser/session-vault.ts` | `SessionVault`, `StoredSessionState` | Playwright storageState persistence, cookie management, and credential vault. |

### 1.4 Extractors (`src/extractors/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/extractors/readability-extractor.ts` | `ReadabilityExtractor` | 3-stage HTML-to-GFM markdown distillation via Readability and Turndown. |
| `src/extractors/structured-extractor.ts` | `StructuredExtractor` | HTML table to GFM markdown conversion and JSON-LD metadata extraction. |
| `src/extractors/robots-parser.ts` | `RobotsParser` | Parses `robots.txt` directives to check URL crawling permissions. |

### 1.5 Network & Security (`src/network/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/network/ssrf-guard.ts` | `SSRFGuard` | IP validation against RFC 1918, loopback, cloud metadata, and DNS rebinding. |
| `src/network/safe-redirect-fetcher.ts` | `safeRedirectFetch` | SSRF-guarded HTTP fetcher traversing 301/302/308 redirects with DNS validation at each hop. |
| `src/network/politeness-limiter.ts` | `PolitenessLimiter` | Origin-based rate limiting with exponential backoff and jitter. |
| `src/network/url-normalizer.ts` | `UrlNormalizer` | Canonical URL formatting, query parameter sorting, fragment stripping. |
| `src/network/url-pattern-matcher.ts` | `UrlPatternMatcher` | Glob and regex pattern matching for include/exclude crawl filters. |
| `src/network/crawl-url-accumulator.ts` | `CrawlUrlAccumulator` | Discovered URL queue and visited set tracking during crawl runs. |
| `src/network/proxy-manager.ts` | `ProxyManager`, `globalProxyManager` | Upstream HTTP/SOCKS5 proxy rotation, health checks, domain stickiness, and undici ProxyAgent caching. |
| `src/network/retry-handler.ts` | `withRetry`, `isTransientNetworkError` | Exponential backoff decorator with full jitter, status code retry policies, and transient socket error recovery. |
| `src/network/crawl-frontier.ts` | `CrawlFrontier` | Disk-backed FIFO crawl queue, crash-resilient checkpointing, and append-only JSONL page streaming. |

---

## 2. Test Suite Inventory (`tests/`)

| Test File | Target Under Test | Test Verification Scope |
|---|---|---|
| `tests/server.test.ts` | `src/server.ts` | HTTP REST endpoints (`/health`, `/api/v1/actors`, `/api/v1/scrape`, `/api/v1/crawl`, `/api/v1/browser/action`, `/api/v1/browser/session/:id`). |
| `tests/scraping-actors.test.ts` | `CheerioScraperActor`, `PlaywrightBrowserActor` | Static HTML parsing, title/content/link extraction, markdown rendering. |
| `tests/browser-pool.test.ts` | `BrowserPool` | Context acquisition, counter safety, idle timer shutdown, resource blocking. |
| `tests/interactive-browser-controller.test.ts` | `InteractiveBrowserController` | Multi-turn navigation, clicking, text entry, screenshots, evaluation, session closing. |
| `tests/crawler-actor.test.ts` | `CrawlerActor` | BFS depth traversal, domain confinement, maximum page limit enforcement. |
| `tests/readability-extractor.test.ts` | `ReadabilityExtractor` | Article body identification, boilerplate stripping, GFM conversion. |
| `tests/structured-extractor.test.ts` | `StructuredExtractor` | Table to GFM conversion, structured object arrays, JSON-LD schema parsing. |
| `tests/robots-parser.test.ts` | `RobotsParser` | User-agent parsing, allow/disallow rule resolution, crawl-delay adherence. |
| `tests/politeness-limiter.test.ts` | `PolitenessLimiter` | Request pacing, 429 backoff calculations, concurrent origin queuing. |
| `tests/ssrf-guard.test.ts` | `SSRFGuard` | Private IP blocking, cloud metadata IP blocking, DNS rebinding validation. |
| `tests/stealth-manager.test.ts` | `StealthManager` | Anti-automation fingerprint masking and flag injection. |
| `tests/dom-indexer.test.ts` | `DomIndexer` | DOM element labeling and interactive coordinate resolution. |
| `tests/browser-session-manager.test.ts` | `BrowserSessionManager` | Session map tracking, touch renewal, expiration sweep. |
| `tests/api-extractor.test.ts` | `ApiExtractorActor` | REST endpoint pagination, token authorization, field projection. |
| `tests/sitemap-xml-actor.test.ts` | `SitemapXmlActor` | Sitemap index, urlset metadata, gzip decompression, RSS/Atom feeds, SSRF protection. |
| `tests/markdown-reader-actor.test.ts` | `MarkdownReaderActor` | Article distillation, YAML frontmatter, table of contents, GFM tables, SSRF protection. |
| `tests/network-interceptor-actor.test.ts` | `NetworkInterceptorActor` | Background XHR/Fetch JSON interception, URL pattern matching, and SSRF guard. |
| `tests/serp-search-actor.test.ts` | `SerpSearchActor` | SERP HTML parsing, redirect decoding, ranking, snippet extraction, and SSRF guard. |
| `tests/pdf-document-actor.test.ts` | `PdfDocumentActor` | Binary PDF text extraction, metadata parsing, base64 payload, maxPages limit, and SSRF guard. |
| `tests/safe-redirect-fetcher.test.ts` | `safeRedirectFetch` | Safe iterative redirect handling, max hops enforcement, loop detection, and SSRF rebinding defenses. |
| `tests/store-api.test.ts` | `src/core/store-router.ts` | Store catalog, actor manifest, input validation, MCP tools, quarantine inspector, and embedded dashboard SPA. |
| `tests/proxy-manager.test.ts` | `ProxyManager` | Proxy pool rotation, round-robin, random, sticky domain affinity, and health tracking. |
| `tests/retry-handler.test.ts` | `withRetry` | Exponential backoff with jitter, retry status code triggers, non-retryable error handling, and terminal error throwing. |
| `tests/session-vault.test.ts` | `SessionVault` | Playwright storageState save, load, directory creation, corrupted JSON recovery, and state existence verification. |
| `tests/crawl-frontier.test.ts` | `CrawlFrontier` | FIFO disk queueing, URL deduplication, JSONL page streaming, and checkpoint resume. |

---

## 3. Configuration & Infrastructure Inventory

| File | Type | Purpose |
|---|---|---|
| `package.json` | Project Config | Dependencies, npm scripts (`dev`, `build`, `start`, `test`, `lint`, `lint:naming`). |
| `tsconfig.json` | TypeScript Config | Compiler options: ES2022, NodeNext resolution, strict mode. |
| `AGENTS.md` | Agent Context | Operational rules, naming discipline, neuro-ergonomic communication rules. |
| `GEMINI.md` | Agent Context | Project rules and architectural integrity instructions. |
| `.agents/skills/` | Skill Library | 38 technical skill definitions (naming discipline, code review, tdd, etc.). |
| `docs/git-commit-convention.md` | Engineering Standard | Git Commit Convention v1.0 specification and agent attribution rules. |
| `docs/developer-onboarding.md` | Documentation | Getting started guide, environment variables, command references. |
| `biome.json` | Linter / Formatter Config | Biome static analysis and formatting rules for src, tests, and scripts. |
| `context/connectome.md` | System Map | Deterministically generated routing and actor dependency map. |
| `docs/adr/` | Architectural Records | Architecture Decision Records (ADR 0001 - 0009). |
| `docs/protokol-cold-vault-mimari-sartnamesi.md` | Architecture Spec | Specification for the upcoming protokol-cold-vault offline storage repository. |
| `docs/plans/aktor-ekosistemi-ve-web-mvp-teknik-plani.md` | Architecture Plan | Specification and roadmap for Actor Store, Web MVP, CLI, and Mobile clients. |
| `scripts/harvest-ekutuphane.mjs` | Pipeline Runner | Resumable data extraction pipeline for ekutuphane.saglik.gov.tr with 8-character naming and gzip compression. |
