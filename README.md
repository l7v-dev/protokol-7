# Protokol-7

Independent Headless Web Scraping, Deep Crawling & Anti-Detection Browser Automation Service.

## Overview

Protokol-7 provides isolated web extraction and browser automation capabilities over a native Node.js HTTP REST interface. It isolates resource-intensive scraping dependencies (Playwright, Cheerio, Turndown, JSDOM, Mozilla Readability) from conversational and agent runtime engines.

## Architectural Components

- **Stealth Browser Pool (`src/browser-pool.ts`)**: Warm Chromium instance management, automated resource blocking (images, media, fonts, tracking scripts), and route-level SSRF defense.
- **Interactive Browser Controller (`src/interactive-browser-controller.ts`)**: Set-of-Mark (SoM) visual DOM indexing, multi-tab stateful session orchestration, humanized jittered mouse/keyboard events, and element manifests.
- **Scraper Actors (`src/cheerio-scraper-actor.ts`, `src/playwright-browser-actor.ts`)**: Fast static DOM extraction (Cheerio) and dynamic JavaScript-rendered extraction (Playwright) coupled with Mozilla Readability markdown conversion.
- **Deep Crawler (`src/crawler-actor.ts`, `src/crawl-url-accumulator.ts`)**: Domain-scoped BFS link traversal with depth/page limits, duplicate URL normalization, and robots.txt compliance.
- **REST Extractor (`src/api-extractor-actor.ts`)**: Structured JSON API extraction with pagination traversal (page, offset, cursor) and property projection.
- **Security Perimeter (`src/ssrf-guard.ts`)**: Private subnet enforcement blocking RFC 1918, RFC 4193, loopback, IPv6 link-local, and cloud metadata IPs (AWS/GCP/Azure 169.254.169.254).

## HTTP API Specification

Default listen address: `http://0.0.0.0:4000` (configurable via `PORT` and `HOST`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health status, version, and active browser context count |
| `GET` | `/api/v1/actors` | List registered actor types and descriptions |
| `POST` | `/api/v1/actors` | Execute generic actor task (`ActorTask`) |
| `POST` | `/api/v1/scrape` | Execute single-page scrape (`targetUrl`, `renderJavaScript`, `selectors`) |
| `POST` | `/api/v1/crawl` | Execute site crawl (`targetUrl`, `options`) |
| `POST` | `/api/v1/browser/action` | Execute stateful browser interaction (`sessionId`, `action`, `params`) |
| `DELETE` | `/api/v1/browser/session/:id` | Terminate stateful browser session and release Chromium resources |

## Quick Start

```bash
# Install dependencies
npm install

# Run typecheck
npm run lint

# Run unit and integration tests
npm test

# Build production bundle
npm run build

# Start HTTP server
npm start
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP listening port |
| `HOST` | `0.0.0.0` | HTTP listening host interface |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | (auto-detected) | Custom path to local Chromium binary |
