# Protokol-7

Headless Web Scraping, Structured Document Extraction, and Corpus Pipeline Microservice.

## Overview

Protokol-7 is a standalone Node.js and TypeScript microservice designed for high-throughput, structured data acquisition. It combines browser automation (Playwright Chromium session pooling with anti-automation masking), low-latency static DOM parsing (Cheerio), document distillation (Mozilla Readability to GFM Markdown), and specialized API extractors across 31 domain sources. 

The service exposes both a native HTTP REST API (with OpenAPI 3.1.0 interactive Swagger documentation) and a Model Context Protocol (MCP JSON-RPC 2.0 / SSE) interface for AI agent tool calling.

---

## Architecture Overview

```text
protokol-7/
├── src/
│   ├── core/                # HTTP REST server, RegistryDatabase (node:sqlite), Store router, OpenAPI
│   ├── actors/              # 31 specialized extraction actors (Web, Science, Legal, Culture, Code, Docs)
│   ├── browser/             # Playwright Chromium pool, stealth evasion, session vault, DOM indexer
│   ├── extractors/          # Readability, HTML tables, PDF layout reordering, Office, EPUB, CSV
│   ├── network/             # SSRF perimeter guard, politeness rate limiter, safe redirect fetcher
│   ├── mcp/                 # Model Context Protocol stdio and HTTP/SSE JSON-RPC 2.0 server
│   ├── pipeline/            # YAML pipeline runner, execution targets, storage drivers (S3, R2, B2, Drive)
│   └── ocr/                 # OCR connector registry, PDF rasterizer, and local/cloud vision bridges
├── scripts/
│   └── corpus_pipeline/     # High-throughput text normalization, Parquet sharding (ZSTD-6), audit ledger
├── examples/
│   ├── actors/              # Runnable JSON input examples for all 31 actors
│   └── pipelines/           # YAML pipeline specifications for batch extraction
├── tests/                   # Native Node.js test runner test suites (tsx --test)
├── Dockerfile               # Multi-stage containerization with Chromium and Python
└── docker-compose.yml       # Production service orchestration
```

---

## Core Capabilities

1. **31 Domain Extraction Actors**:
   - **Web & Crawling**: `cheerio-scraper`, `playwright-browser`, `crawler`, `sitemap-xml`, `markdown-reader`, `network-interceptor`, `serp-search`, `api-extractor`.
   - **Scholarly & Science**: `arxiv`, `europe-pmc`, `openalex`, `dergipark`, `openstax`, `mit-ocw`.
   - **Government & Legal**: `sec-edgar`, `court-listener`, `eur-lex`, `open-fda`, `clinical-trials`.
   - **Library & Culture**: `gutenberg`, `internet-archive`, `ktb-ekitap`, `saglik-ekutuphane`, `epub-extractor`.
   - **Code & Standards**: `software-heritage`, `stack-exchange`, `ietf-rfc`, `wikimedia`.
   - **Document & Archives**: `pdf-document`, `document-extractor`, `archive-extractor`.
   *See [src/actors/README.md](src/actors/README.md) for full documentation and parameter specifications.*

2. **Network Perimeter Security & SSRF Defense**:
   - Automated DNS resolution and IP validation blocking RFC 1918, RFC 4193, loopback, and cloud metadata endpoints (169.254.169.254).
   - Iterative redirect traversing with DNS re-validation at each hop.
   - Host-based politeness rate limiting with exponential backoff.

3. **Storage & Packaging**:
   - Pluggable storage providers: Local Filesystem, Physical Cold Vault (Btrfs SHA256SUMS), Cloudflare R2, AWS S3, Backblaze B2, Google Drive.
   - Streaming Parquet sharding (512 MB – 1 GB partitions with Zstandard compression) and cryptographic SHA-256 / BLAKE3 receipt verification.

4. **Model Context Protocol (MCP)**:
   - Exposes all 31 actors as callable tools for AI agents over Stdio or HTTP/SSE (`/mcp`).

---

## Quick Start

### Option A: Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run static analysis and technical naming audit
npm run lint
npm run lint:naming

# 3. Run test suites (435 passing tests)
npm test

# 4. Start HTTP REST & MCP server
npm start
```

### Option B: Docker / Container Deployment

```bash
# Start containerized service in background
docker compose up -d

# Verify service health
curl -f http://localhost:4000/health
```

The interactive Swagger API documentation is available at `http://localhost:4000/docs`.

---

## HTTP REST API Summary

Default listen address: `http://0.0.0.0:4000` (configurable via `PORT` and `HOST`).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health status, active contexts, and uptime |
| `GET` | `/docs` | Interactive Swagger UI API documentation |
| `GET` | `/openapi.json` | OpenAPI 3.1.0 specification schema |
| `GET` | `/api/v1/actors` | List registered actor types and input contracts |
| `POST` | `/api/v1/actors` | Execute generic actor task (`ActorTask`) |
| `POST` | `/api/v1/scrape` | Execute single-page scrape (`targetUrl`, `renderJavaScript`) |
| `POST` | `/api/v1/crawl` | Execute site crawl (`targetUrl`, `maxDepth`, `maxPages`) |
| `POST` | `/api/v1/arxiv` | Query arXiv preprints and download papers |
| `POST` | `/api/v1/wikimedia` | Query Wikimedia summaries or full Markdown articles |
| `POST` | `/api/v1/sec-edgar` | Query SEC company filings (10-K, 10-Q) |
| `POST` | `/api/v1/court-listener` | Query US legal opinions and case precedents |
| `POST` | `/api/v1/software-heritage` | Query Software Heritage code blobs (SWHID) |
| `POST` | `/api/v1/eur-lex` | Query European Union legislation (CELLAR) |
| `POST` | `/api/v1/openstax` | Query OpenStax open educational textbooks |
| `POST` | `/api/v1/mit-ocw` | Query MIT OpenCourseWare curriculum resources |
| `POST` | `/api/v1/browser/action` | Execute stateful browser interaction (`sessionId`, `action`) |
| `DELETE` | `/api/v1/browser/session/:id` | Terminate stateful browser session |

---

## Pipeline Execution CLI

Execute structured extraction pipelines defined in YAML:

```bash
# Run a batch extraction pipeline
npm run pipeline -- --config examples/pipelines/corpus-parquet-sample.yaml
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP server listening port |
| `HOST` | `0.0.0.0` | HTTP server listening interface |
| `MCP_API_TOKEN` | (none) | Optional Bearer token for MCP authentication |
| `PYTHON_PATH` | `python3` | Path to Python 3 binary for Parquet conversion |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | (auto-detected) | Custom path to local Chromium binary |
| `AWS_ACCESS_KEY_ID` | (none) | Credentials for S3/R2/B2 storage providers |
| `AWS_SECRET_ACCESS_KEY` | (none) | Secret key for S3/R2/B2 storage providers |
