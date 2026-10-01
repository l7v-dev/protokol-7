# Architecture Schema

Single source of truth component inventory and file map for `protokol-7`.

---

## 1. Core Source Inventory (`src/`)

### 1.1 API Layer (`src/api/`)

HTTP server, request routing, ACID persistence, and shared type contracts.
Previously `src/core/`. Renamed to reflect actual responsibility: HTTP API layer.

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/api/types.ts` | `ScrapedPageResult`, `ActorTask`, `BrowserActionResult`, `CrawlerResult` | Shared TypeScript interfaces and contract definitions for all modules. |
| `src/api/registry-database.ts` | `RegistryDatabase`, `getDefaultRegistryDatabase`, `DatasetShardRecord` | ACID SQLite persistence layer for actor runs, event logs, pipeline executions, scheduled jobs, and dataset shards using native `node:sqlite` with zero external dependencies. WAL mode for concurrent access; in-memory for test isolation. |
| `src/api/run-registry.ts` | `RunRegistry`, `RunRecord`, `globalRunRegistry` | Tracks execution runs with dual-layer storage: in-memory Map for SSE event delivery and `RegistryDatabase` for cross-restart ACID persistence. Emits live log events per run. |
| `src/api/openapi-spec.ts` | `OPENAPI_SPECIFICATION`, `renderDocsHtml` | OpenAPI 3.1.0 schema specification and zero-dependency interactive documentation HTML generator. |
| `src/api/context-guard.ts` | `ContextGuard` | LLM token estimation, context window budgeting, and hierarchical semantic boundary truncation. |
| `src/api/server.ts` | `startServer`, `handleRequest` | Standalone Node.js HTTP REST server and API endpoint routing. Imports from `src/api/routers/`. |
| `src/api/index.ts` | API Barrel | Re-exports all API layer contracts, server, routers, registry, and types. |
| `src/api/routers/store-router.ts` | `StoreRouter` | Actor Store API router, live log SSE streaming, quarantine inspector, and headless service information endpoint. |
| `src/api/routers/pipeline-router.ts` | `PipelineRouter`, `PipelineRouterOptions` | Declarative YAML pipeline execution HTTP router (`/api/v1/pipelines/*`), template catalog provider, run history viewer, and path traversal guard. |
| `src/api/routers/dataset-router.ts` | `DatasetRouter` | Dataset catalog router (`/api/v1/datasets/*`), training manifest publisher, snapshot viewer, and shard inventory inspector. |
| `src/api/routers/job-router.ts` | `JobRouter`, `ScheduleJobRequestBody` | Scheduled job and cron engine HTTP router (`/api/v1/jobs/*`), recurring pipeline/actor scheduler, and cron parser. |
| `src/api/routers/vault-router.ts` | `VaultRouter` | Cold vault HTTP router (`/api/v1/vault/*`), dataset packaging, volume integrity auditing, and path traversal guard. |
| `src/server.ts` | Server Trampoline | Root-level entrypoint re-exporting `src/api/server.ts`. |
| `src/index.ts` | Unified Barrel | Aggregates all domain actors, browser utilities, extractors, and network tools. |

### 1.2 Actors Layer (`src/actors/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/actors/actor-registry.ts` | `ActorRegistry` | Central registry for discovering, registering, and instantiating all actors across all categories. |
| `src/actors/actor-manifests.ts` | `ACTOR_MANIFESTS`, `ActorManifest` | Zod/JSON input schemas, metadata, example inputs, and MCP tool declarations for all 70 actors. |
| `src/actors/actor.template.ts` | `TemplateActor`, `TemplateActorResult` | Canonical reference implementation blueprint, contract template, and security scaffold for new actors. |

#### Web Actors (`src/actors/web/`) — general-purpose HTTP and browser extraction

| File Path | Class | Mechanism |
|---|---|---|
| `src/actors/web/cheerio-scraper-actor.ts` | `CheerioScraperActor` | Static HTML scraping using Cheerio for low-latency DOM extraction. |
| `src/actors/web/playwright-browser-actor.ts` | `PlaywrightBrowserActor` | Dynamic web scraping using headless Chromium with resource blocking. |
| `src/actors/web/api-extractor-actor.ts` | `ApiExtractorActor` | REST API extraction actor supporting pagination and projection filtering. |
| `src/actors/web/crawler-actor.ts` | `CrawlerActor` | BFS web graph crawler with depth limits and concurrency management. |
| `src/actors/web/sitemap-xml-actor.ts` | `SitemapXmlActor` | XML sitemap, sitemap index traversal, and RSS/Atom feed URL extractor with gzip support. |
| `src/actors/web/markdown-reader-actor.ts` | `MarkdownReaderActor` | LLM-ready document distiller with YAML frontmatter, heading hierarchy, and token estimation. |
| `src/actors/web/network-interceptor-actor.ts` | `NetworkInterceptorActor` | Headless browser actor intercepting and extracting background XHR/Fetch JSON API responses. |
| `src/actors/web/serp-search-actor.ts` | `SerpSearchActor` | Organic search engine result page parser extracting rankings, URLs, snippets, and domains. |

#### Corpus Actors (`src/actors/corpus/`) — LLM training data source extraction

| File Path | Class | Source |
|---|---|---|
| `src/actors/corpus/arxiv-actor.ts` | `ArxivActor` | arXiv Export API (Atom 1.0) — preprints, metadata, abstracts, optional PDF text. |
| `src/actors/corpus/wikipedia-actor.ts` | `WikipediaActor`, `WikimediaActor` | Official Wikimedia REST API v1 extraction actor. Fetches clean summaries, full Parsoid HTML converted to GFM markdown, batch title extractions, and full article page search. Detailed technical specification in `docs/actors/wikipedia.md`. |
| `src/actors/corpus/wikimedia-actor.ts` | Trampoline Re-export | Backwards-compatibility re-export module routing to `src/actors/corpus/wikipedia-actor.ts`. |

| `src/actors/corpus/openalex-actor.ts` | `OpenAlexActor` | OpenAlex API — scholarly works, inverted-index abstract reconstruction, citations. |
| `src/actors/corpus/stack-exchange-actor.ts` | `StackExchangeActor` | Stack Exchange API v2.3 — verified algorithmic Q&A and instruction-tuning pairs. |
| `src/actors/corpus/gutenberg-actor.ts` | `GutenbergActor` | Gutendex API — public domain books with license block stripping. |
| `src/actors/corpus/europe-pmc-actor.ts` | `EuropePmcActor` | Europe PMC REST API — biomedical literature and open-access full-text links. |
| `src/actors/corpus/ietf-rfc-actor.ts` | `IetfRfcActor` | IETF RFC Editor + Datatracker — Internet standards with plain-text cleaning. |
| `src/actors/corpus/openstax-actor.ts` | `OpenStaxActor` | OpenStax CMS API — CC-licensed peer-reviewed textbooks and chapter content. |
| `src/actors/corpus/mit-ocw-actor.ts` | `MitOcwActor` | MIT OCW OpenSearch DSL — university curricula, syllabi, and course resources. |
| `src/actors/corpus/software-heritage-actor.ts` | `SoftwareHeritageActor` | Software Heritage Archive — persistent SWHIDs, code blobs, directory trees. |
| `src/actors/corpus/dergipark-actor.ts` | `DergiParkActor` | DergiPark OAI-PMH 2.0 — academic journal metadata and PDF links. |
| `src/actors/corpus/internet-archive-actor.ts` | `InternetArchiveActor` | archive.org — item metadata, search results, OCR text (DjVuTXT, Abbyy GZ). |
| `src/actors/corpus/clinical-trials-actor.ts` | `ClinicalTrialsActor` | ClinicalTrials.gov API v2 — trial protocols, eligibility, interventions. |
| `src/actors/corpus/open-fda-actor.ts` | `OpenFdaActor` | openFDA REST API — drug labels, adverse events, device clearances. |
| `src/actors/corpus/sec-edgar-actor.ts` | `SecEdgarActor` | SEC EDGAR Submissions API — corporate filings (10-K, 10-Q, 8-K). |
| `src/actors/corpus/court-listener-actor.ts` | `CourtListenerActor` | CourtListener Free Law v4 — US federal and state case law, court opinions. |
| `src/actors/corpus/eur-lex-actor.ts` | `EurLexActor` | EUR-Lex CELLAR SPARQL — EU directives, regulations, and CJEU case law. |
| `src/actors/corpus/saglik-ekutuphane-actor.ts` | `SaglikEkutuphaneActor` | TR Health Ministry e-library — medical publications with PDF distillation. |
| `src/actors/corpus/ktb-ekitap-actor.ts` | `KtbEkitapActor` | TR Culture Ministry e-book portal — public domain books with LLM sanitization. |
| `src/actors/corpus/resmi-gazete-actor.ts` | `ResmiGazeteActor` | T.C. Resmî Gazete daily bulletins, laws, presidential decrees, regulations, and announcements with full metadata. |
| `src/actors/corpus/yargitay-actor.ts` | `YargitayActor` | Yargıtay & Danıştay judicial precedents, chamber decisions, and legal reasoning with full metadata. |
| `src/actors/corpus/kap-actor.ts` | `KapActor` | Kamuoyu Aydınlatma Platformu (KAP) company disclosures, financial reports, and regulatory filings with full metadata. |
| `src/actors/corpus/github-actor.ts` | `GithubActor` | GitHub REST API v3 — repository metadata, README documentation, issues, pull requests, releases, and git trees with full GFM markdown. |
| `src/actors/corpus/openreview-actor.ts` | `OpenReviewActor` | OpenReview REST API v1/v2 — academic submissions, peer review scores, author rebuttals, meta-reviews, and decisions with full dialectic GFM markdown. |
| `src/actors/corpus/hacker-news-actor.ts` | `HackerNewsActor` | Hacker News Algolia & Firebase APIs — engineering discussions, architecture post-mortems, and nested comment trees with full GFM markdown. |
| `src/actors/corpus/huggingface-datasets-actor.ts` | `HuggingFaceDatasetsActor` | Hugging Face Datasets Server API — dataset rows, split configurations, and schema features with full GFM markdown table. |
| `src/actors/corpus/math-reasoning-actor.ts` | `MathReasoningActor` | Mathematical Reasoning & CoT Harvester — GSM8K, Hendrycks MATH, SVAMP, and OlympiadBench problems, reasoning steps, LaTeX expressions, and boxed answers. |
| `src/actors/corpus/code-eval-actor.ts` | `CodeEvalActor` | Code Generation & Evaluation Benchmark Harvester — HumanEval, MBPP, and SWE-bench programming tasks, entry points, canonical solutions, and verification unit tests. |
| `src/actors/corpus/proofwiki-actor.ts` | `ProofWikiActor` | ProofWiki MediaWiki API — formal mathematical theorems, axioms, step-by-step proofs, definitions, sources, and normalized LaTeX math formulas. |
| `src/actors/corpus/lean-mathlib-actor.ts` | `LeanMathlibActor` | Lean 4 & Mathlib4 — computer-verified formal theorems, lemmas, definitions, and proof tactic steps with GFM markdown. |
| `src/actors/corpus/lesswrong-actor.ts` | `LessWrongActor` | LessWrong & Alignment Forum GraphQL API — Bayesian rationality, decision theory, AI alignment essays, vote scores, and dialectic comment trees with GFM markdown. |
| `src/actors/corpus/youtube-transcripts-actor.ts` | `YoutubeTranscriptsActor` | YouTube Transcripts & Captions Harvester with dual-engine fallback (HTTP + Playwright) and LLM acoustic noise cleaning. |
| `src/actors/corpus/wikisource-actor.ts` | `WikisourceActor` | Wikisource REST API v1 & Action API — historical, classical, and literary public domain texts across 85+ languages, poem/verse distillation. |
| `src/actors/corpus/wiktionary-actor.ts` | `WiktionaryActor` | Wiktionary REST API v1 & Action API — lexical definitions, etymology, parts of speech, and translations across 198+ languages. |
| `src/actors/corpus/wikiquote-actor.ts` | `WikiquoteActor` | Wikiquote REST API v1 & Action API — verified quotations, speeches, aphorisms, and literary dialogue across 90+ languages. |
| `src/actors/corpus/wikibooks-actor.ts` | `WikibooksActor` | Wikibooks REST API v1 & Action API — open textbooks, pedagogical modules, and technical manuals across 120+ languages. |
| `src/actors/corpus/wikiversity-actor.ts` | `WikiversityActor` | Wikiversity REST API v1 & Action API — university course modules, academic study guides, and research outlines across 17+ languages. |
| `src/actors/corpus/wikivoyage-actor.ts` | `WikivoyageActor` | Wikivoyage REST API v1 & Action API — travel guides, geographical routes, and cultural destination profiles across 30+ languages. |
| `src/actors/corpus/wikinews-actor.ts` | `WikinewsActor` | Wikinews REST API v1 & Action API — collaborative journalism, news articles, historical dispatches, and event timelines across 35+ languages. |
| `src/actors/corpus/wikispecies-actor.ts` | `WikispeciesActor` | Wikispecies REST API v1 & Action API on species.wikimedia.org — biological classifications, phylogenetic clades, and taxonomic nomenclature. |
| `src/actors/corpus/wikidata-actor.ts` | `WikidataActor` | Wikidata Action API, EntityData, and SPARQL endpoint — structured knowledge graph entities, claims, labels, and semantic triples. |
| `src/actors/corpus/stanford-phil-actor.ts` | `StanfordPhilActor` | Stanford Encyclopedia of Philosophy (SEP) — peer-reviewed treatises, outlines, bibliographies, and logic concepts. |
| `src/actors/corpus/internet-phil-actor.ts` | `InternetPhilActor` | Internet Encyclopedia of Philosophy (IEP) — peer-reviewed academic philosophy articles, outlines, and references. |
| `src/actors/corpus/metamath-actor.ts` | `MetamathActor` | Metamath Proof Explorer (set.mm, iset.mm, ql.mm) — formal mathematical proofs, axioms, hypotheses, and step-by-step verification chains. |
| `src/actors/corpus/philpapers-actor.ts` | `PhilPapersActor` | PhilPapers Archive — academic philosophy citations, abstracts, publication metadata, and category taxonomies. |
| `src/actors/corpus/devdocs-actor.ts` | `DevDocsActor` | DevDocs (`devdocs.io` & `documents.devdocs.io`) — official API documentation, search index lookups, and guides across 100+ technologies. |
| `src/actors/corpus/rosetta-code-actor.ts` | `RosettaCodeActor` | Rosetta Code MediaWiki API — multi-language algorithm implementations, code comparisons, and language catalogs across 800+ programming languages. |
| `src/actors/corpus/papers-with-code-actor.ts` | `PapersWithCodeActor` | Papers With Code & Hugging Face Papers — machine learning research papers, canonical arXiv abstracts, and official GitHub code repositories. |
| `src/actors/corpus/libretexts-actor.ts` | `LibreTextsActor` | LibreTexts Global — open-access STEM and engineering textbooks, course chapters, LaTeX formula preservation, and table of contents. |
| `src/actors/corpus/open-textbook-actor.ts` | `OpenTextbookActor` | Open Textbook Library (UMN) — peer-reviewed university textbooks, multi-format download links, and faculty peer reviews. |
| `src/actors/corpus/semantic-scholar-actor.ts` | `SemanticScholarActor` | Semantic Scholar Academic Graph (S2AG) API — scientific literature, AI TLDR summaries, citation graphs, and author profiles. |
| `src/actors/corpus/anayasa-mahkemesi-actor.ts` | `AnayasaMahkemesiActor` | T.C. Anayasa Mahkemesi Kararlar Bilgi Bankası — norm denetimi (iptal/itiraz), bireysel başvuru hak ihlali hükümleri, gerekçeli kararlar ve karşı oy yazıları. |
| `src/actors/corpus/danistay-actor.ts` | `DanistayActor` | T.C. Danıştay Başkanlığı Emsal Karar Sistemi — idare ve vergi dava daireleri (1-13), İDDK, VDDK ve İBK emsal kararları, tetkik hakimi ve savcı düşünceleri. |
| `src/actors/corpus/google-patents-actor.ts` | `GooglePatentsActor` | Google Patents & USPTO/EPO Public Data — küresel patentler, bağımsız/bağımlı teknik iddialar (claims) hiyerarşisi, tarifnameler, CPC kodları ve önceki teknik atıfları. |
| `src/actors/corpus/perseus-dl-actor.ts` | `PerseusDlActor` | Tufts Perseus Digital Library — Antik Yunanca, Klasik Latince, Eski İbranice ve Arapça metinler, paralel çeviriler, CTS-URN adresleme ve morfolojik analiz. |
| `src/actors/corpus/sacred-texts-actor.ts` | `SacredTextsActor` | Internet Sacred Text Archive (ISTA) — 1.700+ tam metin kutsal kitap, antik mitoloji, dünya folkloru, simya ve teoloji eserleri. |
| `src/actors/corpus/instagram-actor.ts` | `InstagramActor` | Public Instagram profiles, posts, reels, carousel child slides, engagement metrics, and hashtags using dual-engine HTTP API and Playwright Chromium stealth fallback. |

#### Document Actors (`src/actors/documents/`) — local file and archive extraction

| File Path | Class | Input Formats |
|---|---|---|
| `src/actors/documents/pdf-document-actor.ts` | `PdfDocumentActor` | PDF — text streams, page boundaries, metadata; OCR fallback via `src/ocr/`. |
| `src/actors/documents/epub-extractor-actor.ts` | `EpubExtractorActor` | EPUB 2/3 — Dublin Core metadata, hierarchical TOC, spine-ordered GFM markdown. |
| `src/actors/documents/document-extractor-actor.ts` | `DocumentExtractorActor` | DOCX, XLSX, CSV, TSV, TXT — OpenXML parsing with zero external dependencies. |
| `src/actors/documents/archive-extractor-actor.ts` | `ArchiveExtractorActor` | ZIP, TAR, GZ, RAR — Zip Slip and Zip Bomb guards via `src/archive/`. |


### 1.3 Archive Subsystem (`src/archive/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/archive/archive-guard.ts` | `ArchiveGuard`, `ArchiveSecurityError` | Enforces Zip Slip path traversal defense and Zip Bomb limits on file size, count, and compression ratio. |
| `src/archive/tar-parser.ts` | `TarParser` | Parses POSIX ustar standard TAR archive streams with zero external dependencies. |
| `src/archive/zip-parser.ts` | `ZipParser` | Parses ZIP archives using both Central Directory and Local File Headers with decompression support via native zlib. |
| `src/archive/archive-extractor.ts` | `ArchiveExtractor` | Safely extracts ZIP, TAR, GZ, and TGZ archives, enforcing Zip Slip and Zip Bomb security checks. |

### 1.4 Browser Engine (`src/browser/`)

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
| `src/extractors/pdf-anomaly-detector.ts` | `PdfAnomalyDetector` | Detects scanned image PDFs, empty text layers, password protected files, corrupt payloads, and font encoding glitches. |
| `src/extractors/office-extractor.ts` | `OfficeExtractor` | Parses Microsoft Word (.docx) and Microsoft Excel (.xlsx) OpenXML files into clean text, structured records, and GFM markdown tables with zero external dependencies. |
| `src/extractors/tabular-extractor.ts` | `TabularExtractor` | Parses CSV/TSV data with RFC 4180 compliance, auto-detects delimiters, and outputs structured JSON records and GFM markdown tables. |
| `src/extractors/epub-extractor.ts` | `EpubExtractor` | Zero-dependency EPUB 2/3 container unpacker, OPF metadata & spine reader, hierarchical TOC extractor, and XHTML-to-GFM markdown converter. |
| `src/extractors/multi-column-layout-resolver.ts` | `MultiColumnLayoutResolver` | Reorders PDF text items from `extractTextItems` into correct reading order for 2-3 column layouts using x-coordinate gap histogram (gutter) analysis. |
| `src/extractors/multi-column-layout-resolver.ts` | `HeaderFooterStripper` | Strips recurring page headers and footers from PDF text item arrays (coordinate-based) or plain-text page arrays (line-index fallback) using frequency threshold detection. |

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

### 1.7 OCR Subsystem (`src/ocr/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/ocr/types.ts` | `IOcrConnector`, `OcrRequest`, `OcrResult`, `OcrPageResult` | Common contracts, interfaces, and request/result schemas for optical character recognition. |
| `src/ocr/pdf-rasterizer.ts` | `PdfRasterizer` | Converts PDF pages into high-resolution PNG image buffers via Playwright Chromium canvas rendering and extracts embedded images. |
| `src/ocr/ocr-connector-registry.ts` | `OcrConnectorRegistry`, `globalOcrRegistry` | Registry managing OCR connectors with deterministic fallback priority and multi-page processing. |
| `src/ocr/connectors/local-llm-vision-connector.ts` | `LocalLlmVisionOcrConnector` | Connects to local multimodal vision LLM endpoints (Ollama, llama.cpp, vLLM, LocalAI) supporting models like llama3.2-vision, qwen2.5-vl, minicpm-v. |
| `src/ocr/connectors/cloud-vision-connector.ts` | `CloudVisionOcrConnector` | Google Cloud Vision API connector utilizing DOCUMENT_TEXT_DETECTION. |
| `src/ocr/connectors/mistral-ocr-connector.ts` | `MistralOcrConnector` | Mistral AI Document OCR API connector extracting structured markdown. |
| `src/ocr/connectors/unlimited-ocr-connector.ts` | `UnlimitedOcrConnector` | Connects to vLLM or OpenAI-compatible endpoint serving baidu/Unlimited-OCR for long-horizon multi-page PDF document and table parsing. |
| `src/ocr/connectors/local-tesseract-connector.ts` | `LocalTesseractOcrConnector` | Local system Tesseract CLI bridge executed via child_process. |
| `src/ocr/connectors/generic-http-connector.ts` | `GenericHttpOcrConnector` | Configurable HTTP POST connector for enterprise and third-party OCR microservices. |
| `src/ocr/index.ts` | OCR Barrel | Re-exports all OCR connectors, registry, and rasterizer. |

### 1.8 Model Context Protocol (`src/mcp/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/mcp/auth-guard.ts` | `verifyMcpToken` | Constant-time Bearer token validator against configured `MCP_API_TOKEN`. |
| `src/mcp/http-transport.ts` | `HttpMcpTransport` | HTTP POST /mcp JSON-RPC 2.0 dispatcher and GET /mcp/events SSE streamer. |
| `src/mcp/protokol-mcp-server.ts` | `ProtokolMcpServer` | Native Stdio JSON-RPC 2.0 MCP server exposing all extraction actors to AI agent clients. |
| `src/mcp/index.ts` | MCP Barrel | Re-exports MCP server, HTTP transport, and auth guard. |

### 1.9 Pipeline Orchestration (`src/pipeline/`)

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
| `src/pipeline/processors/text-normalizer.ts` | `TextNormalizer` | Unicode NFKC normalization, control character stripping, whitespace canonicalization, and cryptographic SHA-256 lineage tracking. |
| `src/pipeline/processors/quality-filter.ts` | `QualityFilter` | FineWeb and Gopher heuristic metrics evaluation (word count, symbol ratio, alpha ratio, duplicate line fraction) and quality gate enforcement. |
| `src/pipeline/processors/dedup-filter.ts` | `DedupFilter` | Exact SHA-256 fingerprinting and 64-bit SimHash near-duplicate detection with Hamming distance thresholding. |
| `src/pipeline/processors/jsonl-writer.ts` | `JsonlWriter` | Formats extracted records into newline-delimited JSON (JSONL). |
| `src/pipeline/processors/passthrough-writer.ts` | `PassthroughWriter` | Formats extracted records into structured JSON without altering layout. |
| `src/pipeline/processors/csv-writer.ts` | `CsvWriter` | Formats extracted records into RFC 4180 CSV tables. |
| `src/pipeline/processors/parquet-packer.ts` | `ParquetPacker` | PyArrow subprocess bridge for ZSTD Parquet packaging with JSONL fallback. |
| `src/pipeline/connectors/env-resolver.ts` | `resolveEnvString`, `resolveConnectorConfig` | Resolves runtime `${ENV_VAR}` tokens in connector configs. |
| `src/pipeline/connectors/connector-registry.ts` | `ConnectorRegistry` | Stores, manages, and resolves connector credentials and endpoints. |
| `src/pipeline/connectors/index.ts` | Connector Barrel | Re-exports connector registry and environment resolver. |
| `src/pipeline/storage/index.ts` | `StorageBackend`, `StorageReceipt` | Storage provider contract and SHA-256 receipt generation interface. |
| `src/pipeline/storage/local-storage.ts` | `LocalStorage` | Local disk pool storage provider calculating SHA-256 receipts. |
| `src/pipeline/storage/google-drive-storage.ts` | `GoogleDriveStorage` | Google Drive storage backend uploading artifacts via Drive API v3 supporting both Service Account JWT and OAuth2 user tokens. |
| `src/pipeline/storage/s3-storage.ts` | `S3Storage`, `detectMimeType` | AWS S3 storage driver using PutObjectCommand and SHA-256 receipts. |
| `src/pipeline/storage/r2-storage.ts` | `R2Storage` | Cloudflare R2 storage driver with custom account endpoint mapping. |
| `src/pipeline/storage/b2-storage.ts` | `B2Storage` | Backblaze B2 storage driver with S3-compatible endpoints. |
| `src/pipeline/schedule-broker.ts` | `ScheduleBroker`, `isCronMatch`, `matchCronField` | Standard 5-field cron parser and scheduler using native node:timers. |
| `src/pipeline/pipeline-runner.ts` | `PipelineRunner`, `PipelineRunResult` | Master orchestrator coordinating validation, execution, formatting, and storage routing. |
| `src/pipeline/cli.ts` | Pipeline CLI Runner | Command-line entrypoint for executing YAML pipeline configurations (`npm run pipeline`). |
| `src/pipeline/index.ts` | Pipeline Barrel | Re-exports all pipeline contracts, runner, schema, processors, and storage backends. |

### 1.10 Dataset Subsystem (`src/dataset/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/dataset/types.ts` | `TrainingDatasetManifest`, `PublishDatasetOptions`, `PublishDatasetResult`, `SplitDefinition` | Type contracts and schema definitions for dataset snapshots and training manifests. |
| `src/dataset/dataset-publisher.ts` | `DatasetPublisher`, `DatasetPublisherOptions` | Training dataset snapshot engine, train/val/test split partitioning, SHA-256 manifest.json sealer, and remote storage uploader. |
| `src/dataset/index.ts` | Dataset Barrel | Re-exports dataset contracts and publisher class. |

### 1.11 Cold Vault Subsystem (`src/vault/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/vault/types.ts` | `VolumeInfo`, `ColdVaultExportOptions`, `ColdVaultExportReceipt`, `VolumeVerificationResult` | Type definitions and schema contracts for cold storage volumes, export receipts, and verification results. |
| `src/vault/cold-vault-exporter.ts` | `ColdVaultExporter` | Offline packaging engine, self-describing directory layout manager, streaming SHA-256 validator, SHA256SUMS ledger builder, and SQLite storage_replicas recorder. |
| `src/vault/index.ts` | Vault Barrel | Re-exports cold vault engine and types. |

### 1.12 Telemetry Subsystem (`src/telemetry/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/telemetry/anomalies.ts` | `recordAnomaly`, `AnomalyEvent`, `AnomalyCode` | System stall, rate limit backoff, circuit breaker, memory pressure, and retry exhaustion telemetry logger with structured JSONL persistence. |

### 1.13 Utility Subsystem (`src/utils/`)

| File Path | Primary Export / Class | Technical Responsibility |
|---|---|---|
| `src/utils/terminal-theme.ts` | `TerminalTheme`, `badge`, `banner`, `divider`, `panel`, `table` | Zero-emoji deterministic ASCII formatting engine for console banners, status badges, structured panels, and tables. |

---

## 2. Test Suite Inventory (`tests/`)

| Test File | Target Under Test | Test Verification Scope |
|---|---|---|
| `tests/server.test.ts` | `src/server.ts` | HTTP REST endpoints (`/health`, `/api/v1/actors`, `/api/v1/scrape`, `/api/v1/crawl`, `/api/v1/browser/action`, `/api/v1/epub`, `/api/v1/dergipark`, `/api/v1/internet-archive`, `/api/v1/browser/session/:id`). |
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
| `tests/store-api.test.ts` | `src/api/routers/store-router.ts` | Store catalog, actor manifest, input validation, MCP tools, quarantine inspector, and headless service info. |
| `tests/proxy-manager.test.ts` | `ProxyManager` | Proxy pool rotation, round-robin, random, sticky domain affinity, and health tracking. |
| `tests/retry-handler.test.ts` | `withRetry` | Exponential backoff with jitter, retry status code triggers, non-retryable error handling, and terminal error throwing. |
| `tests/session-vault.test.ts` | `SessionVault` | Playwright storageState save, load, directory creation, corrupted JSON recovery, and state existence verification. |
| `tests/crawl-frontier.test.ts` | `CrawlFrontier` | FIFO disk queueing, URL deduplication, JSONL page streaming, and checkpoint resume. |
| `tests/pipedream-connect.test.ts` | `PipedreamConnectService`, `src/api/server.ts` | Pipedream defaults, MCP config generator, token guards, and `/api/v1/pipedream/*` REST endpoints. |
| `tests/arxiv-actor.test.ts` | `ArxivActor`, `src/api/server.ts` | arXiv Export API Atom XML parsing, searchQuery/idList param building, URL ID parsing, PDF extraction, SSRF protection, and REST routes. |
| `tests/protokol-mcp-server.test.ts` | `ProtokolMcpServer` | Model Context Protocol JSON-RPC 2.0 handshake, tools/list inspection, actor execution via tools/call, and stream error handling. |
| `tests/wikimedia-actor.test.ts` | `WikimediaActor`, `src/api/server.ts` | Page summaries, full article Parsoid HTML to Markdown, search parsing, SSRF guard, and REST route. |
| `tests/wikipedia-actor.test.ts` | `WikipediaActor`, `WikimediaActor` | Wikipedia and Wikimedia actor test suite verifying summaries, GFM conversion, search parsing, and SSRF guard. |

| `tests/openalex-actor.test.ts` | `OpenAlexActor`, `src/api/server.ts` | Inverted index abstract reconstruction, citation and open access filters, SSRF guard, and REST route. |
| `tests/stack-exchange-actor.test.ts` | `StackExchangeActor`, `src/api/server.ts` | Questions and answers retrieval, instruction-tuning pair formatting, score filters, SSRF guard, and REST route. |
| `tests/gutenberg-actor.test.ts` | `GutenbergActor`, `src/api/server.ts` | Gutendex search and book metadata, plain text download, license delimiter stripping, SSRF guard, and REST route. |
| `tests/europe-pmc-actor.test.ts` | `EuropePmcActor`, `src/api/server.ts` | Europe PMC search, abstract parsing, open-access query filtering, SSRF guard, and REST route. |
| `tests/ietf-rfc-actor.test.ts` | `IetfRfcActor`, `src/api/server.ts` | RFC text retrieval, running page headers & form feed stripping, Datatracker search, SSRF guard, and REST route. |
| `tests/pipeline-schema.test.ts` | `parsePipelineYaml`, `PipelineConfigSchema` | Zod validation, YAML parsing, required fields, and credential env var enforcement. |
| `tests/actor-resolver.test.ts` | `ActorResolver` | Catalog discovery, registered actor verification, and missing config parameter rejection. |
| `tests/pipeline-runner.test.ts` | `PipelineRunner`, `LocalExecutor`, `LocalStorage` | End-to-end execution, sink buffering, processor transformations, storage receipts, and error recovery. |
| `tests/storage-router.test.ts` | `ConnectorRegistry`, `S3Storage`, `R2Storage`, `B2Storage` | Environment variable resolution, connector lookup, S3/R2/B2 driver uploads, and pipeline cloud storage integration. |
| `tests/scheduler-and-remote.test.ts` | `ScheduleBroker`, `RemoteHttpExecutor`, `PipedreamExecutor`, `GoogleDriveStorage` | Cron matching engine, scheduler lifecycle, remote HTTP execution, Pipedream webhooks, and Google Drive upload. |
| `tests/mcp-http-transport.test.ts` | `HttpMcpTransport`, `verifyMcpToken`, `src/api/server.ts` | Unit and HTTP server integration tests for initialize, tools/list, tools/call, auth guard, and SSE events. |
| `tests/epub-extractor.test.ts` | `EpubExtractor` | EPUB 2/3 container parsing, Dublin Core metadata, spine ordering, TOC trees (nav.xhtml, toc.ncx), Zip Slip defense. |
| `tests/epub-extractor-actor.test.ts` | `EpubExtractorActor`, `src/api/server.ts` | EPUB base64 payloads, remote downloads, SSRF validation, chapter limits, and REST route. |
| `tests/multi-column-layout-resolver.test.ts` | `MultiColumnLayoutResolver`, `HeaderFooterStripper` | Coordinate-based column gutter detection, column sorting, and recurring header/footer stripping. |
| `tests/dergipark-actor.test.ts` | `DergiParkActor`, `src/api/server.ts` | OAI-PMH 2.0 harvesting, ListRecords, GetRecord, ListSets, keyword filters, and REST route. |
| `tests/internet-archive-actor.test.ts` | `InternetArchiveActor`, `src/api/server.ts` | Archive.org metadata JSON, Scraping API search, DjVuTXT / Abbyy GZ OCR decompression, and REST route. |
| `tests/clinical-trials-actor.test.ts` | `ClinicalTrialsActor`, `src/api/server.ts` | Studies search, NCT ID direct lookup, status/condition filters, SSRF protection, and REST route. |
| `tests/open-fda-actor.test.ts` | `OpenFdaActor`, `src/api/server.ts` | Drug label search, device 510(k) clearances, 404 empty result handling, SSRF protection, and REST route. |
| `tests/sec-edgar-actor.test.ts` | `SecEdgarActor`, `src/api/server.ts` | CIK resolution, ticker lookup, 10-K form filtering, custom SEC user-agent, SSRF guard, and REST route. |
| `tests/court-listener-actor.test.ts` | `CourtListenerActor`, `src/api/server.ts` | Opinions search, court/judge filters, direct opinion ID retrieval, SSRF guard, and REST route. |
| `tests/software-heritage-actor.test.ts` | `SoftwareHeritageActor`, `src/api/server.ts` | SWHID code blob extraction, directory traversal, origin snapshot lookup, SSRF guard, and REST route. |
| `tests/eur-lex-actor.test.ts` | `EurLexActor`, `src/api/server.ts` | CELEX EU regulation retrieval, CELLAR SPARQL query, document type classification, SSRF guard, and REST route. |
| `tests/pipeline-quality-and-dedup.test.ts` | `TextNormalizer`, `QualityFilter`, `DedupFilter`, `PipelineRunner` | Normalization (NFKC, control chars, whitespace), FineWeb/Gopher quality gates, exact SHA-256 and SimHash near-dedup, and SQLite audit ledger integration. |
| `tests/pipeline-api-and-mcp.test.ts` | `PipelineRouter`, `ProtokolMcpServer` | Integration tests for YAML pipeline execution REST endpoints and run_pipeline/list_pipelines MCP tools. |
| `tests/dataset-publisher-and-api.test.ts` | `DatasetPublisher`, `DatasetRouter`, `ProtokolMcpServer` | Integration tests for dataset snapshot creation, manifest.json sealing, split partitioning, REST endpoints, and MCP tools. |
| `tests/job-scheduler-and-api.test.ts` | `JobRouter`, `ScheduleBroker`, `ProtokolMcpServer` | Integration tests for scheduled jobs, cron validation, path traversal guard, REST endpoints, and MCP tools. |
| `tests/cold-vault-exporter-and-api.test.ts` | `ColdVaultExporter`, `VaultRouter`, `ProtokolMcpServer` | Integration tests for cold vault volume initialization, dataset packaging, SHA256SUMS generation, replica ledger tracking, file corruption detection, REST endpoints, and MCP tools. |
| `tests/scaffold-actor.test.ts` | `scripts/scaffold-actor.mjs` | Validation tests for actor scaffolding CLI, argument parsing, category verification, name validation, and template invariants. |
| `tests/resmi-gazete-actor.test.ts` | `ResmiGazeteActor`, `src/api/server.ts` | URL resolution, date parsing, SSRF guard, daily bulletin extraction, category/query filtering, GFM markdown, and REST route. |
| `tests/yargitay-actor.test.ts` | `YargitayActor`, `src/api/server.ts` | URL resolution, court routing, SSRF guard, JSON/HTML decision parsing, Turkish diacritic normalization, chamber/query filtering, GFM markdown, and REST route. |
| `tests/kap-actor.test.ts` | `KapActor`, `src/api/server.ts` | URL resolution, ticker routing, SSRF guard, JSON/HTML disclosure parsing, Turkish diacritic normalization, ticker/query filtering, GFM markdown, and REST route. |
| `tests/github-actor.test.ts` | `GithubActor`, `src/api/server.ts` | URL resolution, repo routing, SSRF guard, base64 README decoding, repo metadata, issues/PR/releases GFM markdown, and REST route. |
| `tests/openreview-actor.test.ts` | `OpenReviewActor`, `src/api/server.ts` | URL resolution, venue/forum routing, SSRF guard, v1/v2 note parsing, review/rebuttal dialectic GFM markdown, and REST route. |
| `tests/hacker-news-actor.test.ts` | `HackerNewsActor`, `src/api/server.ts` | URL resolution, story/search routing, SSRF guard, Algolia/Firebase JSON parsing, nested comment trees, and REST route. |
| `tests/huggingface-datasets-actor.test.ts` | `HuggingFaceDatasetsActor`, `src/api/server.ts` | URL resolution, rows/splits/info routing, SSRF guard, datasets-server JSON streaming, schema parsing, GFM markdown, and REST route. |
| `tests/math-reasoning-actor.test.ts` | `MathReasoningActor`, `src/api/server.ts` | URL resolution, benchmark routing, SSRF guard, GSM8K CoT split, Hendrycks MATH boxed answer extraction, SVAMP parsing, GFM markdown, and REST route. |
| `tests/code-eval-actor.test.ts` | `CodeEvalActor`, `src/api/server.ts` | URL resolution, benchmark routing, SSRF guard, HumanEval entry point / test extraction, MBPP test list joining, SWE-bench patch parsing, and REST route. |
| `tests/proofwiki-actor.test.ts` | `ProofWikiActor`, `src/api/server.ts` | URL resolution, action routing, SSRF guard, wikitext math normalization, multi-proof parsing, sources/categories extraction, and REST route. |
| `tests/lean-mathlib-actor.test.ts` | `LeanMathlibActor`, `src/api/server.ts` | URL resolution, repo routing, SSRF guard, declaration parsing, docstrings, tactic sequence extraction, theorem filtering, and REST route. |
| `tests/lesswrong-actor.test.ts` | `LessWrongActor`, `src/api/server.ts` | URL resolution, action routing, SSRF guard, post extraction, author attribution, vote scores, dialectic comment trees, and REST route. |
| `tests/youtube-transcripts-actor.test.ts` | `YoutubeTranscriptsActor`, `src/api/server.ts` | URL resolution, 11-char ID extraction, timedtext XML parsing, LLM acoustic noise cleaning, SSRF guard, and REST route. |
| `tests/wikisource-actor.test.ts` | `WikisourceActor`, `src/api/server.ts` | Multi-language routing across 85+ domains, Turndown GFM markdown, poem/verse preservation, scan navigation stripping, SSRF guard, and REST route. |
| `tests/wiktionary-actor.test.ts` | `WiktionaryActor`, `src/api/server.ts` | Multi-language routing across 198+ domains, definition matrix extraction, Turndown HTML to markdown, search, random lemma discovery, SSRF guard, and REST route. |
| `tests/wikiquote-actor.test.ts` | `WikiquoteActor`, `src/api/server.ts` | Multi-language routing across 90+ domains, quotebox format, Turndown GFM markdown, SSRF guard, and REST route. |
| `tests/wikibooks-actor.test.ts` | `WikibooksActor`, `src/api/server.ts` | Multi-language routing across 120+ domains, chapter extraction, Turndown GFM markdown, SSRF guard, and REST route. |
| `tests/wikiversity-actor.test.ts` | `WikiversityActor`, `src/api/server.ts` | Multi-language routing across 17+ domains, course module extraction, Turndown GFM markdown, SSRF guard, and REST route. |
| `tests/wikivoyage-actor.test.ts` | `WikivoyageActor`, `src/api/server.ts` | Multi-language routing across 30+ domains, destination listings, Turndown GFM markdown, SSRF guard, and REST route. |
| `tests/wikinews-actor.test.ts` | `WikinewsActor`, `src/api/server.ts` | Multi-language routing across 35+ domains, news dispatch extraction, Turndown GFM markdown, SSRF guard, and REST route. |
| `tests/wikispecies-actor.test.ts` | `WikispeciesActor`, `src/api/server.ts` | Unified taxonomy database routing on species.wikimedia.org, clade extraction, Turndown GFM markdown, SSRF guard, and REST route. |
| `tests/wikidata-actor.test.ts` | `WikidataActor`, `src/api/server.ts` | Structured entity parsing, claims extraction, wbsearchentities, SPARQL query handling, SSRF guard, and REST route. |
| `tests/stanford-phil-actor.test.ts` | `StanfordPhilActor`, `src/api/server.ts` | Article slug routing, searcher.py query, contents.html index, outlines, bibliographies, SSRF guard, and REST route. |
| `tests/internet-phil-actor.test.ts` | `InternetPhilActor`, `src/api/server.ts` | Article slug routing, WordPress search query, table of contents, references, SSRF guard, and REST route. |
| `tests/metamath-actor.test.ts` | `MetamathActor`, `src/api/server.ts` | Formal theorem verification table parsing, axioms, hypotheses, assertion, cross-references, SSRF guard, and REST route. |
| `tests/philpapers-actor.test.ts` | `PhilPapersActor`, `src/api/server.ts` | Publication record metadata, search query, category taxonomies, subcategories, SSRF guard, and REST route. |
| `tests/devdocs-actor.test.ts` | `DevDocsActor`, `src/api/server.ts` | Docset list, index JSON search, HTML entry extraction, GFM markdown, SSRF guard, and REST route. |
| `tests/rosetta-code-actor.test.ts` | `RosettaCodeActor`, `src/api/server.ts` | Multi-language task extraction, code blocks, language catalog, SSRF guard, and REST route. |
| `tests/papers-with-code-actor.test.ts` | `PapersWithCodeActor`, `src/api/server.ts` | Paper record parsing, Hugging Face Papers API fallback, GitHub repo extraction, SSRF guard, and REST route. |
| `tests/libretexts-actor.test.ts` | `LibreTextsActor`, `src/api/server.ts` | Library resolution, Deki query search, MathJax formula preservation, subpages TOC, SSRF guard, and REST route. |
| `tests/open-textbook-actor.test.ts` | `OpenTextbookActor`, `src/api/server.ts` | Keyword search, textbook detail extraction, formats, table of contents, peer reviews, SSRF guard, and REST route. |
| `tests/semantic-scholar-actor.test.ts` | `SemanticScholarActor`, `src/api/server.ts` | S2AG paper retrieval, literature search, author profiles, citation graph traversal, SSRF guard, and REST route. |
| `tests/anayasa-mahkemesi-actor.test.ts` | `AnayasaMahkemesiActor`, `src/api/server.ts` | AYM bireysel başvuru, norm denetimi, gerekçeli karar detayları, karşı oy ayrıştırma, SSRF denetimi ve REST rotası. |
| `tests/danistay-actor.test.ts` | `DanistayActor`, `src/api/server.ts` | Danıştay emsal karar arama, daire filtreleme, tetkik hakimi/savcı düşünceleri, SSRF denetimi ve REST rotası. |
| `tests/google-patents-actor.test.ts` | `GooglePatentsActor`, `src/api/server.ts` | Google Patents künye, bağımsız/bağımlı iddia hiyerarşisi (claims), tarifname, SSRF denetimi ve REST rotası. |
| `tests/perseus-dl-actor.test.ts` | `PerseusDlActor`, `src/api/server.ts` | Tufts Perseus metin pasajı, kart/dize yapısı, morfolojik analiz, katalog arama, SSRF denetimi ve REST rotası. |
| `tests/sacred-texts-actor.test.ts` | `SacredTextsActor`, `src/api/server.ts` | Internet Sacred Text Archive kitap pasajı, çevirmen, dipnotlar, gelenek kataloğu, SSRF denetimi ve REST rotası. |
| `tests/instagram-actor.test.ts` | `InstagramActor`, `src/api/server.ts` | Instagram profile normalization, post/reel media extraction, hashtag feed, dual-engine fallback, SSRF defense, and REST route. |

---

## 3. Configuration & Infrastructure Inventory

| File | Type | Purpose |
|---|---|---|
| `package.json` | Project Config | Dependencies, npm scripts (`dev`, `build`, `start`, `test`, `lint`, `lint:naming`, `pipedream`). |
| `tsconfig.json` | TypeScript Config | Compiler options: ES2022, NodeNext resolution, strict mode. |
| `src/types/node-sqlite.d.ts` | Ambient Declaration | TypeScript type declaration for `node:sqlite` (DatabaseSync, StatementSync). Required because `@types/node@20` does not include Node 22 built-in SQLite types. |
| `AGENTS.md` | Agent Context | Operational rules, naming discipline, neuro-ergonomic communication rules. |
| `GEMINI.md` | Agent Context | Project rules and architectural integrity instructions. |
| `.agents/skills/` | Skill Library | Curated technical skill definitions (naming discipline, code review, tdd, etc.) with symlink at `skills/`. |
| `context/system-manifest.md` | System Map | Compact single-page operational runtime manifest (DB paths, routers, storage, actors). |
| `ledger/` | Append-Only Ledger | Immutable task ledger (`index.jsonl`), gzipped session checkpoints (`sessions/`), and telemetry. |
| `docs/git-commit-convention.md` | Engineering Standard | Git Commit Convention v1.0 specification and agent attribution rules. |
| `docs/developer-onboarding.md` | Documentation | Getting started guide, environment variables, command references. |
| `docs/actor-contract.md` | Engineering Standard | Actor contract specification, security invariants, lifecycle, and 8-step registration checklist. |
| `docs/actor-wiki-template.md` | Engineering Standard | Canonical technical wiki specification template with Mermaid diagrams, security invariants, and input/output contracts. |
| `docs/actors/` | Technical Wikis | Canonical architectural wiki specifications for domain actors (e.g. `wikipedia.md`, `hacker-news.md`). |
| `scripts/scaffold-actor.mjs` | Automation CLI | Actor scaffolding generator CLI (`npm run make:actor`) producing actor class, test, JSON example, and barrel export. |
| `biome.json` | Linter / Formatter Config | Biome static analysis and formatting rules for src, tests, and scripts. |
| `context/connectome.md` | System Map | Deterministically generated routing and actor dependency map. |
| `docs/adr/` | Architectural Records | Architecture Decision Records (ADR 0001 - 0009). |
| `docs/protokol-cold-vault-mimari-sartnamesi.md` | Architecture Spec | Specification for the upcoming protokol-cold-vault offline storage repository. |
| `.env.example` | Config Template | Environment template with `PIPEDREAM_PROJECT_ID=proj_zNsBAEe` and `PIPEDREAM_ENVIRONMENT=production`. |
| `scripts/pipedream-cli.mjs` | CLI Runner | Pipedream Connect status verification, user token generation, account listing, and MCP endpoint inspector. |
| `examples/pipelines/saglik-ekutuphane-sample.yaml` | Pipeline Config | Sample pipeline configuration for Turkish Ministry of Health e-library scraping actor. |
| `examples/pipelines/ktb-ekitap-sample.yaml` | Pipeline Config | Sample pipeline configuration for Turkish Ministry of Culture e-book scraping actor. |
| `examples/pipelines/corpus-parquet-sample.yaml` | Pipeline Config | Sample pipeline configuration for corpus text datasets with zstd-compressed Parquet sharding. |
| `examples/pipelines/wikimedia-sample.yaml` | Pipeline Config | Sample pipeline configuration for Wikimedia encyclopedic article extraction. |
| `examples/actors/` | Example Configs | 35 standalone, runnable JSON configuration templates for all extraction actors. |
| `src/actors/README.md` | Actor Catalog | Categorized 6-domain documentation of 51 actors with REST, MCP, and input/output contracts. |
| `context/schema.sql` | Database Schema | Canonical single source of truth ANSI/SQLite schema for datasets, shards, replicas, and audit ledger. |
| `scripts/corpus_pipeline/schema.sql` | Database Schema | Mirrored ANSI/SQLite relational DDL for corpus pipeline components. |
| `scripts/corpus_pipeline/metadata_catalog.py` | Catalog Manager | Corpus metadata manager, shard ledger, replica tracking, and manifest exporter. |
| `scripts/corpus_pipeline/storage/base.py` | Storage Interface | Abstract StorageProvider interface and StorageReceipt data contract. |
| `scripts/corpus_pipeline/storage/local_cold_vault.py` | Storage Provider | Offline/removable HDD/SSD cold storage provider with Btrfs SHA256SUMS ledger. |
| `scripts/corpus_pipeline/storage/cloudflare_r2.py` | Storage Provider | Cloudflare R2 / S3 zero-egress object storage provider with checksum verification. |
| `scripts/corpus_pipeline/storage/__init__.py` | Storage Factory | Registry and factory resolver for pluggable storage providers. |
| `scripts/corpus_pipeline/cleaner.py` | Cleaner & Filter | TextNormalizer (Unicode NFKC) and QualityFilter (Gopher/FineWeb heuristics). |
| `scripts/corpus_pipeline/packer.py` | Parquet Packer | StreamingParquetPacker with ZSTD-6 compression, RowGroups, and chunk rolling. |
| `scripts/corpus_pipeline/verifier.py` | Verification Gate | 4-point verification gatekeeper and zero-raw purge engine with audit logging. |
| `scripts/corpus_pipeline/orchestrator.py` | CLI Orchestrator | Master orchestrator CLI for corpus processing, storage replication, and zero-raw purge. |
| `scripts/corpus_pipeline/test_corpus_pipeline.py` | Test Suite | Unit and integration tests for catalog, storage, cleaner, packer, gatekeeper, and purge. |
| `scripts/corpus_pipeline/requirements.txt` | Package Dependencies | Production dependencies for corpus pipeline (blake3, tiktoken, duckdb, lingua, boto3). |
| `scripts/wikisource_pipeline/orchestrator.py` | Multi-Language Harvest Orchestrator | 85-language dump harvest CLI, SQLite progress ledger, zero disk residue pipeline. |
| `scripts/wikisource_pipeline/cleaner.py` | Cleaner & Parser | O(1) RAM XML streaming parser, poem/verse preservation, wikitext cleaner. |
| `scripts/wikisource_pipeline/packer.py` | Parquet Sharder | StreamingParquetSharder with Zstandard compression and row-group flushing. |
| `scripts/wikisource_pipeline/downloader.py` | Dump Downloader | Wikimedia dump stream downloader, mirror resolver, and file cleanup. |
| `scripts/wikisource_pipeline/drive_sync.py` | Google Drive Sync | Google Drive v3 client with MD5 hash verification and instant local file deletion. |
| `examples/actors/wikisource.json` | Example Config | Standalone JSON configuration for Wikisource actor. |
| `docs/actors/wikisource.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikisource actor. |
| `scripts/wiktionary_pipeline/orchestrator.py` | Multi-Language Harvest Orchestrator | 198-language dump harvest CLI, SQLite progress ledger, zero disk residue pipeline. |
| `scripts/wiktionary_pipeline/cleaner.py` | Cleaner & Parser | O(1) RAM XML streaming parser, definition and etymology extractor, wikitext cleaner. |
| `scripts/wiktionary_pipeline/packer.py` | Parquet Sharder | StreamingParquetSharder with Zstandard compression and row-group flushing. |
| `scripts/wiktionary_pipeline/downloader.py` | Dump Downloader | Wikimedia Wiktionary dump stream downloader, mirror resolver, and file cleanup. |
| `scripts/wiktionary_pipeline/drive_sync.py` | Google Drive Sync | Google Drive v3 client with MD5 hash verification and instant local file deletion. |
| `examples/actors/wiktionary.json` | Example Config | Standalone JSON configuration for Wiktionary actor. |
| `docs/actors/wiktionary.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wiktionary actor. |
| `examples/actors/wikiquote.json` | Example Config | Standalone JSON configuration for Wikiquote actor. |
| `docs/actors/wikiquote.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikiquote actor. |
| `examples/actors/wikibooks.json` | Example Config | Standalone JSON configuration for Wikibooks actor. |
| `docs/actors/wikibooks.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikibooks actor. |
| `examples/actors/wikiversity.json` | Example Config | Standalone JSON configuration for Wikiversity actor. |
| `docs/actors/wikiversity.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikiversity actor. |
| `examples/actors/wikivoyage.json` | Example Config | Standalone JSON configuration for Wikivoyage actor. |
| `docs/actors/wikivoyage.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikivoyage actor. |
| `examples/actors/wikinews.json` | Example Config | Standalone JSON configuration for Wikinews actor. |
| `docs/actors/wikinews.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikinews actor. |
| `examples/actors/wikispecies.json` | Example Config | Standalone JSON configuration for Wikispecies actor. |
| `docs/actors/wikispecies.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikispecies actor. |
| `examples/actors/wikidata.json` | Example Config | Standalone JSON configuration for Wikidata actor. |
| `docs/actors/wikidata.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Wikidata actor. |
| `examples/actors/stanford-phil.json` | Example Config | Standalone JSON configuration for Stanford Encyclopedia of Philosophy actor. |
| `docs/actors/stanford-phil.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Stanford Encyclopedia of Philosophy actor. |
| `examples/actors/internet-phil.json` | Example Config | Standalone JSON configuration for Internet Encyclopedia of Philosophy actor. |
| `docs/actors/internet-phil.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Internet Encyclopedia of Philosophy actor. |
| `examples/pipelines/gutenberg-drive-pipeline.yaml` | Pipeline Config | Sample pipeline configuration for Project Gutenberg streaming to Google Drive. |
| `examples/pipelines/stackexchange-drive-pipeline.yaml` | Pipeline Config | Sample pipeline configuration for StackExchange dump extraction to Google Drive. |
| `examples/pipelines/openalex-drive-pipeline.yaml` | Pipeline Config | Sample pipeline configuration for OpenAlex OA works to Google Drive. |
| `examples/pipelines/semanticscholar-drive-pipeline.yaml` | Pipeline Config | Sample pipeline configuration for Semantic Scholar bulk search to Google Drive. |
| `scripts/gutenberg_pipeline/orchestrator.py` | Gutenberg Pipeline Orchestrator | Gutendex API harvester, boilerplate cleaner, Zstd Parquet sharder, image TAR.GZ shard extraction, Google Drive sync. |
| `scripts/gutenberg_pipeline/downloader.py` | Gutenberg Downloader | EPUB/ZIP archive image extractor (`fetch_book_images`, `pick_image_source_url`), ZipBomb protection, 50 MB/book cap. |
| `scripts/gutenberg_pipeline/packer.py` | Parquet + Image Sharder | `GutenbergParquetSharder` (Zstd, 10 GB) and `GutenbergImageTarSharder` (WebDataset TAR.GZ, 10 GB, `{book_id}/{image_name}` layout). |
| `scripts/gutenberg_pipeline/drive_sync.py` | Google Drive Sync | Drive v3 uploader with subfolder routing: Parquet to `Gutenberg/`, images to `Gutenberg/Images/`. |
| `scripts/gutenberg_pipeline/test_gutenberg_pipeline.py` | Test Suite | 14 unit tests: cleaner, Parquet sharder, image TAR sharder, image URL detection. |
| `scripts/stackexchange_pipeline/orchestrator.py` | StackExchange Harvest Orchestrator | Archive.org 7z dump processor, thread Q&A assembler, Zstd Parquet sharder, Drive sync. |
| `scripts/stackexchange_pipeline/test_stackexchange_pipeline.py` | Test Suite | Unit tests for StackExchange HTML cleaner, thread assembler, and Parquet packer. |
| `scripts/openalex_pipeline/orchestrator.py` | OpenAlex Harvest Orchestrator | Cursor pagination streamer, inverted index abstract reconstructor, Parquet sharder, Drive sync. |
| `scripts/openalex_pipeline/test_openalex_pipeline.py` | Test Suite | Unit tests for OpenAlex abstract reconstruction, record cleaning, and Parquet sharder. |
| `scripts/openalex_snapshot_pipeline/orchestrator.py` | OpenAlex S3 Snapshot Orchestrator | AWS S3 Parquet snapshot streamer, 10-50 GB Zstd sharder, Google Drive uploader, SQLite ledger, zero disk residue. |
| `scripts/openalex_snapshot_pipeline/cleaner.py` | OpenAlex Snapshot Cleaner | Quality gate filtering paratext/retractions, abstract reconstruction from inverted index, LLM markdown synthesis. |
| `scripts/openalex_snapshot_pipeline/packer.py` | OpenAlex Snapshot Sharder | `OpenAlexSnapshotSharder` producing compact `oa_w_YYYYMMDD_p00000.parquet` files with SHA-256 and MD5 hashing. |
| `scripts/openalex_snapshot_pipeline/downloader.py` | OpenAlex S3 Downloader | Manifest extractor and partition streamer via AWS CLI and HTTPS with retry logic and instant cleanup. |
| `scripts/openalex_snapshot_pipeline/drive_sync.py` | OpenAlex Drive Sync | Resumable Google Drive v3 uploader under `OpenAlex/Snapshots/`, MD5 validator, and local file cleaner. |
| `scripts/openalex_snapshot_pipeline/ledger.py` | OpenAlex Snapshot Ledger | SQLite transactional catalog (`data/openalex_snapshot_catalog.sqlite`) tracking S3 parts and dual-syncing with `data/catalog.sqlite`. |
| `scripts/openalex_snapshot_pipeline/test_snapshot_pipeline.py` | Test Suite | Unit tests for cleaner quality gate, sharder rotation, downloader, and transactional ledger. |
| `scripts/semanticscholar_pipeline/orchestrator.py` | Semantic Scholar Harvest Orchestrator | S2 bulk API streamer, metadata cleaner, Zstd Parquet sharder, Drive sync. |
| `scripts/semanticscholar_pipeline/test_semanticscholar_pipeline.py` | Test Suite | Unit tests for Semantic Scholar cleaner, field extractor, and Parquet sharder. |
| `scripts/wikibooks_pipeline/orchestrator.py` | Wikibooks Harvest Orchestrator | 121-language XML bz2 streaming ETL, code-block preservation, Zstd Parquet sharding, Drive sync, SQLite ledger. |
| `scripts/wikibooks_pipeline/test_wikibooks_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/wikinews_pipeline/orchestrator.py` | Wikinews Harvest Orchestrator | 36-language news dump ETL, article date/category extraction, Zstd Parquet sharding, Drive sync, SQLite ledger. |
| `scripts/wikinews_pipeline/test_wikinews_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/wikiquote_pipeline/orchestrator.py` | Wikiquote Harvest Orchestrator | 100-language quote/aphorism ETL, wikitext cleaner stripping [[links]] and {{templates}}, Parquet sharding, Drive sync. |
| `scripts/wikiquote_pipeline/test_wikiquote_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/wikispecies_pipeline/orchestrator.py` | Wikispecies Harvest Orchestrator | specieswiki global taxonomy dump ETL, taxon name/classification extraction, Parquet sharding, Drive sync. |
| `scripts/wikispecies_pipeline/test_wikispecies_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/wikiversity_pipeline/orchestrator.py` | Wikiversity Harvest Orchestrator | 17-language educational content ETL, heading structure preservation, Parquet sharding, Drive sync, SQLite ledger. |
| `scripts/wikiversity_pipeline/test_wikiversity_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/wikivoyage_pipeline/orchestrator.py` | Wikivoyage Harvest Orchestrator | 27-language travel guide ETL, geo-coordinate and listing extraction, Parquet sharding, Drive sync, SQLite ledger. |
| `scripts/wikivoyage_pipeline/test_wikivoyage_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/wikisource_pipeline/orchestrator.py` | Wikisource Harvest Orchestrator | 85-language historical/classical text ETL, poetry/verse layout preservation, Parquet sharding, Drive sync, SQLite ledger. |
| `scripts/wikisource_pipeline/test_wikisource_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/wiktionary_pipeline/orchestrator.py` | Wiktionary Harvest Orchestrator | 198-language lexical definition ETL, POS/etymology extraction, Parquet sharding, Drive sync, SQLite ledger. |
| `scripts/wiktionary_pipeline/test_wiktionary_pipeline.py` | Test Suite | 5 unit tests: cleaner, URL resolution, ledger, sharder, bz2 streaming. |
| `scripts/run_all_wikimedia_pipelines.py` | Master Coordinator | Sequential coordinator for all 8 Wikimedia dump pipelines (Wikibooks, Wikinews, Wikiquote, Wikispecies, Wikisource, Wiktionary, Wikiversity, Wikivoyage). |
| `scripts/run_news_and_species_pipelines.py` | Partial Coordinator | Lightweight runner for Wikinews and Wikispecies pipelines. |
| `examples/actors/metamath.json` | Example Config | Standalone JSON configuration for Metamath Proof Explorer actor. |
| `docs/actors/metamath.md` | Technical Wiki | Architectural specification with Mermaid diagrams for Metamath Proof Explorer actor. |
| `examples/actors/philpapers.json` | Example Config | Standalone JSON configuration for PhilPapers Archive actor. |
| `docs/actors/philpapers.md` | Technical Wiki | Architectural specification with Mermaid diagrams for PhilPapers Archive actor. |
| `Dockerfile` | Container Build | Multi-stage production container build with Node 22, Playwright Chromium libraries, and Python 3. |
| `docker-compose.yml` | Container Orchestration | Docker compose deployment mapping port 4000, data volume, and healthcheck. |
| `.github/workflows/ci.yml` | CI/CD Workflow | Continuous integration pipeline executing Biome lint, naming check, TypeScript build, test suite, and SCA audit. |
| `trash/` | Quarantine & Deprecated | Local holding directory for standalone, deprecated, or temporary raw dump artifacts (.gitignored). |

