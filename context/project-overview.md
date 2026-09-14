# Project Overview

## 1. Product Definition

protokol-7 is a standalone, headless web scraping, crawling, and anti-detection browser automation microservice built on Node.js and TypeScript. It provides a native HTTP REST interface to allow external clients (e.g. Agent-Smith, automation scripts, data pipelines) to inspect external web resources, execute headless Chromium actions, extract clean readability markdown, parse structured HTML tables, and traverse web graphs deterministically.

---

## 2. Core Capabilities

### 2.1. High-Speed Static HTML Extraction (`CheerioScraperActor`)
- Utilizes `cheerio` for in-memory DOM parsing of raw HTML pages.
- Executes without headless browser overhead (<50ms execution latency).
- Extracts title, body text, clean markdown, anchor links, images, and structured metadata.

### 2.2. Dynamic Headless Browser Automation (`PlaywrightBrowserActor` & `InteractiveBrowserController`)
- Manages Playwright Chromium sessions with bot detection evasion (`StealthManager`).
- Executes multi-turn interactive actions: `navigate`, `click`, `fill`, `screenshot`, `evaluate`, `wait_for_selector`, `get_content`, and `close_session`.
- Implements network resource blocking (images, media, fonts, tracking scripts) to achieve ~70% memory reduction per page context.

### 2.3. Article Content Distillation (`ReadabilityExtractor`)
- 3-stage content distillation pipeline: `@mozilla/readability` -> `jsdom` -> `turndown`.
- Strips advertising, navigation menus, boilerplate footers, and tracking scripts.
- Converts article DOM structures directly into GitHub Flavored Markdown (GFM).

### 2.4. Structured Data Extraction (`StructuredExtractor`)
- Parses HTML `<table>` elements and maps them to structured object arrays (`Array<Record<string, string>>`).
- Generates aligned GFM Markdown tables for direct LLM and agent comprehension.
- Extracts JSON-LD Schema.org metadata and OpenGraph tags.

### 2.5. Recursive Web Crawling (`CrawlerActor`)
- Traverses web graphs using breadth-first search (BFS) with depth limits and maximum page boundaries.
- Adheres to `robots.txt` specifications via `RobotsParser`.
- Enforces origin politeness and exponential backoff via `PolitenessLimiter`.
- Normalizes URLs, deduplicates query parameters, and removes URL fragments via `UrlNormalizer` and `UrlPatternMatcher`.

### 2.6. HTTP REST API Server (`src/server.ts`)
- Native Node.js HTTP server exposing endpoints for health checks, actor execution, scraping, crawling, and interactive browser actions.
- Configurable via `PORT` (default: `4000`) and `HOST` (default: `127.0.0.1`).
