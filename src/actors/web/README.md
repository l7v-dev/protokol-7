# src/actors/web — Web Extraction Actors

General-purpose HTTP and browser-based web extraction actors.
Each actor implements the `IActor<T>` interface and registers under a unique `ActorType`.

## Actors

| File | Class | ActorType | Mechanism | Use Case |
|---|---|---|---|---|
| `cheerio-scraper-actor.ts` | `CheerioScraperActor` | `cheerio-scraper` | Cheerio static HTML parse | Fast static page scraping, no JS required |
| `playwright-browser-actor.ts` | `PlaywrightBrowserActor` | `playwright-browser` | Headless Chromium (Playwright) | JS-rendered pages, SPA, anti-bot bypass |
| `api-extractor-actor.ts` | `ApiExtractorActor` | `api-extractor` | HTTP REST with pagination | JSON REST API extraction with token auth |
| `crawler-actor.ts` | `CrawlerActor` | `crawler` | BFS graph crawler | Multi-page site crawl with depth limits |
| `sitemap-xml-actor.ts` | `SitemapXmlActor` | `sitemap-xml` | XML sitemap + RSS/Atom | URL discovery from sitemap index files |
| `markdown-reader-actor.ts` | `MarkdownReaderActor` | `markdown-reader` | Readability + Turndown | Article distillation for LLM context |
| `network-interceptor-actor.ts` | `NetworkInterceptorActor` | `network-interceptor` | XHR/Fetch interception | Background API call extraction via browser |
| `serp-search-actor.ts` | `SerpSearchActor` | `serp-search` | SERP HTML parser | Organic search result ranking and snippets |

## REST Endpoints

Each actor is available via `POST /api/v1/<actor-name>` on the HTTP server.
Input schemas are defined in `../actor-manifests.ts`.

## MCP Tools

All actors are exposed as MCP tools in `src/mcp/protokol-mcp-server.ts`.
Tool names match the `ActorType` identifier (e.g. `cheerio-scraper`).
