# Architecture Schema

Single source of truth component inventory and file map for `protokol-7`.

---

## 1. Core Source Inventory (`src/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/types.ts` | `ScrapedPageResult`, `ActorTask`, `BrowserActionResult`, `CrawlerResult` | Core TypeScript interfaces and shared contract definitions. |
| `src/server.ts` | `startServer`, `handleRequest` | Standalone Node.js HTTP REST server and API endpoint routing. |
| `src/actor-registry.ts` | `ActorRegistry` | Central registry for discovering, registering, and instantiating extraction actors. |
| `src/cheerio-scraper-actor.ts` | `CheerioScraperActor` | Static HTML scraping using Cheerio for low-latency DOM extraction. |
| `src/playwright-browser-actor.ts` | `PlaywrightBrowserActor` | Dynamic web scraping using headless Chromium with resource blocking. |
| `src/api-extractor-actor.ts` | `ApiExtractorActor` | REST API extraction actor supporting pagination and projection filtering. |
| `src/browser-pool.ts` | `BrowserPool` | Singleton Playwright Chromium pool with 60s idle timeout and session isolation. |
| `src/interactive-browser-controller.ts` | `InteractiveBrowserController` | Stateful browser actions (`navigate`, `click`, `fill`, `screenshot`, `evaluate`). |
| `src/browser-session-manager.ts` | `BrowserSessionManager` | In-memory tracking and expiration of active interactive browser sessions. |
| `src/crawler-actor.ts` | `CrawlerActor` | BFS web graph crawler with depth limits and concurrency management. |
| `src/crawl-url-accumulator.ts` | `CrawlUrlAccumulator` | Discovered URL queue and visited set tracking during crawl runs. |
| `src/readability-extractor.ts` | `ReadabilityExtractor` | 3-stage HTML-to-GFM markdown distillation via Readability and Turndown. |
| `src/structured-extractor.ts` | `StructuredExtractor` | HTML table to GFM markdown conversion and JSON-LD metadata extraction. |
| `src/robots-parser.ts` | `RobotsParser` | Parses `robots.txt` directives to check URL crawling permissions. |
| `src/politeness-limiter.ts` | `PolitenessLimiter` | Origin-based rate limiting with exponential backoff and jitter. |
| `src/ssrf-guard.ts` | `SSRFGuard` | IP validation against RFC 1918, loopback, cloud metadata, and DNS rebinding. |
| `src/stealth-manager.ts` | `StealthManager` | Headless Chromium anti-detection masking (`navigator.webdriver` evasion). |
| `src/dom-indexer.ts` | `DomIndexer` | Indexes DOM elements for interactive selector targeting. |
| `src/url-normalizer.ts` | `UrlNormalizer` | Canonical URL formatting, query parameter sorting, fragment stripping. |
| `src/url-pattern-matcher.ts` | `UrlPatternMatcher` | Glob and regex pattern matching for include/exclude crawl filters. |
| `src/sitemap-xml-actor.ts` | `SitemapXmlActor` | XML sitemap, sitemap index traversal, and RSS/Atom feed URL extractor with gzip support. |
| `src/markdown-reader-actor.ts` | `MarkdownReaderActor` | LLM-ready document distiller with YAML frontmatter, heading hierarchy, and token estimation. |
| `src/index.ts` | Barrel Export | Exports actors, utilities, types, and server launcher. |

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
| `docs/adr/` | Architectural Records | Architecture Decision Records (ADR 0001 - 0004). |
