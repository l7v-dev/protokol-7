# Architecture Schema

Single source of truth component inventory and file map for `protokol-7`.

---

## 1. Core Source Inventory (`src/`)

### 1.1 Core Runtime (`src/core/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/core/types.ts` | `ScrapedPageResult`, `ActorTask`, `BrowserActionResult`, `CrawlerResult` | Core TypeScript interfaces and shared contract definitions. |
| `src/core/run-registry.ts` | `RunRegistry`, `globalRunRegistry` | Tracks execution runs, in-memory run state, and emits live SSE events. |
| `src/core/store-router.ts` | `StoreRouter` | Actor Store API router, live log SSE streaming, quarantine inspector, and headless service information endpoint. |
| `src/core/openapi-spec.ts` | `OPENAPI_SPECIFICATION`, `renderDocsHtml` | OpenAPI 3.1.0 schema specification and zero-dependency interactive documentation HTML generator. |
| `src/core/context-guard.ts` | `ContextGuard` | LLM token estimation, context window budgeting, and hierarchical semantic boundary truncation. |
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
| `src/actors/arxiv-actor.ts` | `ArxivActor` | Queries arXiv Export API (Atom 1.0) for preprints, extracts metadata, abstracts, and optional PDF text. |
| `src/actors/wikimedia-actor.ts` | `WikimediaActor` | Queries official Wikimedia REST API v1 for clean encyclopedic summaries, articles as markdown, and search. |
| `src/actors/openalex-actor.ts` | `OpenAlexActor` | Queries OpenAlex API for scholarly works, reconstructs abstracts from inverted index, and extracts citations. |
| `src/actors/stack-exchange-actor.ts` | `StackExchangeActor` | Queries Stack Exchange API v2.3 for verified algorithmic Q&A pairs and instruction-tuning pairs. |
| `src/actors/gutenberg-actor.ts` | `GutenbergActor` | Queries Gutendex API for public domain books, extracts metadata, and downloads book text stripped of license blocks. |
| `src/actors/europe-pmc-actor.ts` | `EuropePmcActor` | Queries Europe PMC REST API for biomedical literature, abstracts, and open-access full-text links. |
| `src/actors/ietf-rfc-actor.ts` | `IetfRfcActor` | Queries IETF RFC Editor and Datatracker for official Internet standards, extracts metadata, and cleans plain text RFC streams. |
| `src/actors/saglik-ekutuphane-actor.ts` | `SaglikEkutuphaneActor` | Scrapes Turkish Ministry of Health e-library (ekutuphane.saglik.gov.tr) for medical publications, books, journals, and articles with PDF distillation. |
| `src/actors/ktb-ekitap-actor.ts` | `KtbEkitapActor` | Scrapes Turkish Ministry of Culture and Tourism e-book portal (ekitap.ktb.gov.tr) with anti-hotlink referral and LLM text sanitization. |

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

### 1.6 External Integrations (`src/integrations/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/integrations/pipedream-connect.ts` | `PipedreamConnectService`, `globalPipedreamConnect` | Pipedream Connect SDK wrapper, token creation, account management, and MCP endpoint configurator. |

### 1.7 Model Context Protocol (`src/mcp/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/mcp/protokol-mcp-server.ts` | `ProtokolMcpServer` | Native Stdio JSON-RPC 2.0 MCP server exposing all extraction actors to AI agent clients. |

### 1.8 Pipeline Orchestration (`src/pipeline/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/pipeline/schema.ts` | `parsePipelineYaml`, `loadPipelineConfigFile`, `PipelineConfigSchema`, `PipelineError` | Pipeline Zod schema, YAML parsing, credential env-var guard, and pipeline errors. |
| `src/pipeline/actor-resolver.ts` | `ActorResolver` | Validates actor catalog registration and required configuration parameters. |
| `src/pipeline/output-sink.ts` | `BufferedSink`, `StreamSink`, `OutputSink` | In-memory and streaming sinks collecting raw extraction items. |
| `src/pipeline/execution/index.ts` | `ExecutionTarget`, `ExecutionResult` | Execution target interfaces and output normalization contracts. |
| `src/pipeline/execution/local-executor.ts` | `LocalExecutor` | Local execution engine dispatching actor tasks via ActorRegistry. |
| `src/pipeline/execution/remote-http-executor.ts` | `RemoteHttpExecutor` | Dispatches actor execution tasks to remote Protokol-7 instances via REST. |
| `src/pipeline/execution/pipedream-executor.ts` | `PipedreamExecutor` | Dispatches extraction payloads to Pipedream webhook workflows. |
| `src/pipeline/processors/index.ts` | `OutputProcessor`, `ProcessedOutput` | Output processor interfaces and format transformation contracts. |
| `src/pipeline/processors/jsonl-writer.ts` | `JsonlWriter` | Formats extracted records into newline-delimited JSON (JSONL). |
| `src/pipeline/processors/passthrough-writer.ts` | `PassthroughWriter` | Formats extracted records into structured JSON without altering layout. |
| `src/pipeline/processors/csv-writer.ts` | `CsvWriter` | Formats extracted records into RFC 4180 CSV tables. |
| `src/pipeline/processors/parquet-packer.ts` | `ParquetPacker` | PyArrow subprocess bridge for ZSTD Parquet packaging with JSONL fallback. |
| `src/pipeline/connectors/env-resolver.ts` | `resolveEnvString`, `resolveConnectorConfig` | Resolves runtime `${ENV_VAR}` tokens in connector configs. |
| `src/pipeline/connectors/connector-registry.ts` | `ConnectorRegistry` | Stores, manages, and resolves connector credentials and endpoints. |
| `src/pipeline/connectors/index.ts` | Connector Barrel | Re-exports connector registry and environment resolver. |
| `src/pipeline/storage/index.ts` | `StorageBackend`, `StorageReceipt` | Storage provider contract and SHA-256 receipt generation interface. |
| `src/pipeline/storage/local-storage.ts` | `LocalStorage` | Local disk pool storage provider calculating SHA-256 receipts. |
| `src/pipeline/storage/google-drive-storage.ts` | `GoogleDriveStorage` | Google Drive storage backend uploading artifacts via Drive API v3. |
| `src/pipeline/storage/s3-storage.ts` | `S3Storage`, `detectMimeType` | AWS S3 storage driver using PutObjectCommand and SHA-256 receipts. |
| `src/pipeline/storage/r2-storage.ts` | `R2Storage` | Cloudflare R2 storage driver with custom account endpoint mapping. |
| `src/pipeline/storage/b2-storage.ts` | `B2Storage` | Backblaze B2 storage driver with S3-compatible endpoints. |
| `src/pipeline/schedule-broker.ts` | `ScheduleBroker`, `isCronMatch`, `matchCronField` | Standard 5-field cron parser and scheduler using native node:timers. |
| `src/pipeline/pipeline-runner.ts` | `PipelineRunner`, `PipelineRunResult` | Master orchestrator coordinating validation, execution, formatting, and storage routing. |
| `src/pipeline/cli.ts` | Pipeline CLI Runner | Command-line entrypoint for executing YAML pipeline configurations (`npm run pipeline`). |
| `src/pipeline/index.ts` | Pipeline Barrel | Re-exports all pipeline contracts, runner, schema, processors, and storage backends. |

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
| `tests/store-api.test.ts` | `src/core/store-router.ts` | Store catalog, actor manifest, input validation, MCP tools, quarantine inspector, and headless service info. |
| `tests/proxy-manager.test.ts` | `ProxyManager` | Proxy pool rotation, round-robin, random, sticky domain affinity, and health tracking. |
| `tests/retry-handler.test.ts` | `withRetry` | Exponential backoff with jitter, retry status code triggers, non-retryable error handling, and terminal error throwing. |
| `tests/session-vault.test.ts` | `SessionVault` | Playwright storageState save, load, directory creation, corrupted JSON recovery, and state existence verification. |
| `tests/crawl-frontier.test.ts` | `CrawlFrontier` | FIFO disk queueing, URL deduplication, JSONL page streaming, and checkpoint resume. |
| `tests/pipedream-connect.test.ts` | `PipedreamConnectService`, `src/core/server.ts` | Pipedream defaults, MCP config generator, token guards, and `/api/v1/pipedream/*` REST endpoints. |
| `tests/arxiv-actor.test.ts` | `ArxivActor`, `src/core/server.ts` | arXiv Export API Atom XML parsing, searchQuery/idList param building, URL ID parsing, PDF extraction, SSRF protection, and REST routes. |
| `tests/protokol-mcp-server.test.ts` | `ProtokolMcpServer` | Model Context Protocol JSON-RPC 2.0 handshake, tools/list inspection, actor execution via tools/call, and stream error handling. |
| `tests/wikimedia-actor.test.ts` | `WikimediaActor`, `src/core/server.ts` | Page summaries, full article Parsoid HTML to Markdown, search parsing, SSRF guard, and REST route. |
| `tests/openalex-actor.test.ts` | `OpenAlexActor`, `src/core/server.ts` | Inverted index abstract reconstruction, citation and open access filters, SSRF guard, and REST route. |
| `tests/stack-exchange-actor.test.ts` | `StackExchangeActor`, `src/core/server.ts` | Questions and answers retrieval, instruction-tuning pair formatting, score filters, SSRF guard, and REST route. |
| `tests/gutenberg-actor.test.ts` | `GutenbergActor`, `src/core/server.ts` | Gutendex search and book metadata, plain text download, license delimiter stripping, SSRF guard, and REST route. |
| `tests/europe-pmc-actor.test.ts` | `EuropePmcActor`, `src/core/server.ts` | Europe PMC search, abstract parsing, open-access query filtering, SSRF guard, and REST route. |
| `tests/ietf-rfc-actor.test.ts` | `IetfRfcActor`, `src/core/server.ts` | RFC text retrieval, running page headers & form feed stripping, Datatracker search, SSRF guard, and REST route. |
| `tests/pipeline-schema.test.ts` | `parsePipelineYaml`, `PipelineConfigSchema` | Zod validation, YAML parsing, required fields, and credential env var enforcement. |
| `tests/actor-resolver.test.ts` | `ActorResolver` | Catalog discovery, registered actor verification, and missing config parameter rejection. |
| `tests/pipeline-runner.test.ts` | `PipelineRunner`, `LocalExecutor`, `LocalStorage` | End-to-end execution, sink buffering, processor transformations, storage receipts, and error recovery. |
| `tests/storage-router.test.ts` | `ConnectorRegistry`, `S3Storage`, `R2Storage`, `B2Storage` | Environment variable resolution, connector lookup, S3/R2/B2 driver uploads, and pipeline cloud storage integration. |
| `tests/scheduler-and-remote.test.ts` | `ScheduleBroker`, `RemoteHttpExecutor`, `PipedreamExecutor`, `GoogleDriveStorage` | Cron matching engine, scheduler lifecycle, remote HTTP execution, Pipedream webhooks, and Google Drive upload. |

---

## 3. Configuration & Infrastructure Inventory

| File | Type | Purpose |
|---|---|---|
| `package.json` | Project Config | Dependencies, npm scripts (`dev`, `build`, `start`, `test`, `lint`, `lint:naming`, `pipedream`). |
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
| `.env.example` | Config Template | Environment template with `PIPEDREAM_PROJECT_ID=proj_zNsBAEe` and `PIPEDREAM_ENVIRONMENT=production`. |
| `scripts/pipedream-cli.mjs` | CLI Runner | Pipedream Connect status verification, user token generation, account listing, and MCP endpoint inspector. |
| `scripts/harvest-ekutuphane.mjs` | Pipeline Runner | Resumable data extraction pipeline for ekutuphane.saglik.gov.tr with 8-character naming and gzip compression. |
| `notebooks/tr_wikipedia_pipeline.ipynb` | Colab Notebook | End-to-end pipeline: trwiki dump download, Wikitext parsing, ZSTD Parquet chunking, and Drive packaging. |
| `docs/plans/tr-wikipedia-colab-drive-plani.md` | Architecture Plan | Complete plan specification for Turkish Wikipedia dump processing and Google Drive delivery. |
| `docs/plans/pipedream-connect-entegrasyon-plani.md` | Architecture Plan | Plan specification for Pipedream Connect SDK, REST/MCP routes, and CLI tooling. |
| `docs/plans/tr-wikipedia-yerel-pipeline-plani.md` | Architecture Plan | Local Wikipedia dump streaming, Wikitext cleaner, 10GB Parquet sharder, and sequential Drive sync queue plan. |
| `docs/plans/cok-dilli-wikipedia-pipeline-plani.md` | Architecture Plan | Multi-language Wikipedia pipeline plan with size-ordered (ascending article count) queue strategy. |
| `scripts/wikipedia_pipeline/downloader.py` | Pipeline Module | Unified Wikimedia XML bz2 dump downloader with in-flight MD5 verification, 4MB chunks, and CLI entrypoint. |
| `scripts/wikipedia_pipeline/cleaner.py` | Pipeline Module | Streaming SAX XML parser, Namespace 0 filtering, redirect stripping, and clean text extractor for LLM pre-training. |
| `scripts/wikipedia_pipeline/packer.py` | Pipeline Module | StreamingParquetSharder with PyArrow, Zstandard (zstd-6) compression, and 10GB part rolling. |
| `scripts/wikipedia_pipeline/drive_queue.py` | Pipeline Module | Sequential (concurrency=1) Google Drive sync queue, md5Checksum verification, and local file unlinking. |
| `scripts/wikipedia_pipeline/run_pipeline.py` | CLI Entrypoint | Master orchestrator CLI for local Wikipedia dump streaming, Parquet packaging, and Google Drive delivery. |
| `scripts/wikipedia_pipeline/multi_lang_orchestrator.py` | CLI Orchestrator | Multi-language queue runner ordering languages from smallest to largest with per-language disk cleanup. |
| `scripts/wikipedia_pipeline/schema.sql` | Database Schema | ANSI/SQLite relational DDL for pipeline runs, cryptographic shard ledger, and article provenance index. |
| `scripts/wikipedia_pipeline/metadata_db.py` | Pipeline Module | SQLite-backed dataset metadata manager, audit trail, provenance tracker, and manifest.json exporter. |
| `scripts/wikipedia_pipeline/test_pipeline.py` | Test Suite | Unit tests for wikitext cleaner, streaming XML parser, Parquet writer, and Drive hash verification. |
| `scripts/wikipedia_pipeline/test_metadata_db.py` | Test Suite | Unit tests for MetadataDB lifecycle, cryptographic hash ledger, and manifest export. |
| `scripts/wikipedia_pipeline/test_multi_lang.py` | Test Suite | Unit tests for size-based ascending language queue ordering. |
| `scripts/bigdata_pipeline/schema.sql` | Database Schema | ANSI/SQLite relational DDL for enterprise datasets, shards, replicas, and audit ledger. |
| `scripts/bigdata_pipeline/metadata_catalog.py` | Catalog Manager | Enterprise metadata manager, shard ledger, replica tracking, and manifest exporter. |
| `scripts/bigdata_pipeline/storage/base.py` | Storage Interface | Abstract StorageProvider interface and StorageReceipt data contract. |
| `scripts/bigdata_pipeline/storage/local_cold_vault.py` | Storage Provider | Offline/removable HDD/SSD cold storage provider with Btrfs SHA256SUMS ledger. |
| `scripts/bigdata_pipeline/storage/cloudflare_r2.py` | Storage Provider | Cloudflare R2 / S3 zero-egress object storage provider with checksum verification. |
| `scripts/bigdata_pipeline/storage/__init__.py` | Storage Factory | Registry and factory resolver for pluggable storage providers. |
| `scripts/bigdata_pipeline/cleaner.py` | Cleaner & Filter | TextNormalizer (Unicode NFKC) and QualityFilter (Gopher/FineWeb heuristics). |
| `scripts/bigdata_pipeline/packer.py` | Parquet Packer | StreamingParquetPacker with ZSTD-6 compression, RowGroups, and chunk rolling. |
| `scripts/bigdata_pipeline/verifier.py` | Verification Gate | 4-point verification gatekeeper and zero-raw purge engine with audit logging. |
| `scripts/bigdata_pipeline/orchestrator.py` | CLI Orchestrator | Master orchestrator CLI for big data processing, storage replication, and zero-raw purge. |
| `scripts/bigdata_pipeline/test_bigdata_pipeline.py` | Test Suite | Unit and integration tests for catalog, storage, cleaner, packer, gatekeeper, and purge. |
| `scripts/bigdata_pipeline/requirements.txt` | Package Dependencies | Production dependencies for big data pipeline (blake3, tiktoken, duckdb, lingua, boto3). |
| `docs/plans/kurumsal-big-data-pipeline-plani.md` | Architecture Plan | Architecture plan specification for 500 TB multi-tier big data LLM pipeline. |
| `docs/walkthroughs/kurumsal-big-data-pipeline-walkthrough.md` | Walkthrough | Execution and validation walkthrough for big data pipeline and verification gate. |
