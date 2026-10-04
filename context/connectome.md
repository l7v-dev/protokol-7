# Connectome — Otomatik Üretilen Sistem Haritası

> Bu dosya `scripts/generate-connectome.mjs` ile üretildi (2026-10-04). Elle düzenlenmez.
> Çözümleyici Motor: TypeScript Compiler API AST (v5.9.3)

## Çekirdek Modüller ve Mimari Düğümler (Centrality)

Bu tablo, diğer modüller tarafından en çok referans verilen (PageRank benzeri in-degree) merkezi bileşenleri gösterir.

| Modül / Dosya | İçe Aktarılma (In-Degree) | İhraç Sembol Sayısı | Rol / Açıklama |
|---|---|---|---|
| `src/api/types.ts` | 159 | 292 | Yardımcı Modül |
| `src/dataset/types.ts` | 159 | 6 | Yardımcı Modül |
| `src/ocr/types.ts` | 159 | 5 | Yardımcı Modül |
| `src/vault/types.ts` | 159 | 6 | Yardımcı Modül |
| `src/workers/types.ts` | 159 | 6 | Yardımcı Modül |
| `src/network/safe-redirect-fetcher.ts` | 74 | 2 | Yardımcı Modül |
| `src/network/ssrf-guard.ts` | 70 | 3 | Yardımcı Modül |
| `contracts/index.ts` | 25 | 5 | Yardımcı Modül |
| `src/actors/corpus/domains/index.ts` | 25 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/index.ts` | 25 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/documents/index.ts` | 25 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/index.ts` | 25 | 0 | Etki Alanı Aktörü (Actor) |
| `src/api/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/api/server.ts` | 25 | 1 | Giriş Noktası (Server) |
| `src/dataset/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/mcp/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/ocr/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/pipeline/connectors/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/pipeline/execution/index.ts` | 25 | 2 | Yardımcı Modül |
| `src/pipeline/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/pipeline/processors/index.ts` | 25 | 2 | Yardımcı Modül |
| `src/pipeline/storage/index.ts` | 25 | 2 | Yardımcı Modül |
| `src/server.ts` | 25 | 0 | Giriş Noktası (Server) |
| `src/storage/adapters/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/storage/ledger/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/vault/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/workers/index.ts` | 25 | 0 | Yardımcı Modül |
| `src/api/registry-database.ts` | 15 | 9 | Bileşen Tescili (Registry) |
| `src/pipeline/schema.ts` | 14 | 19 | Yardımcı Modül |
| `src/browser/browser-pool.ts` | 10 | 4 | Kaynak Yöneticisi (BrowserPool) |
| `src/pipeline/pipeline-runner.ts` | 9 | 4 | Yardımcı Modül |
| `src/api/run-registry.ts` | 8 | 6 | Bileşen Tescili (Registry) |
| `src/actors/actor-registry.ts` | 7 | 2 | Bileşen Tescili (Registry) |
| `src/api/context-guard.ts` | 7 | 4 | Yardımcı Modül |
| `src/mcp/protokol-mcp-server.ts` | 7 | 3 | Giriş Noktası (Server) |
| `scripts/terminal-theme.mjs` | 6 | 7 | Yardımcı Modül |
| `src/pipeline/schedule-broker.ts` | 6 | 5 | Yardımcı Modül |
| `src/pipeline/storage/s3-storage.ts` | 6 | 4 | Yardımcı Modül |
| `src/utils/terminal-theme.ts` | 6 | 8 | Yardımcı Modül |
| `src/actors/actor-manifests.ts` | 5 | 5 | Etki Alanı Aktörü (Actor) |
| `src/extractors/structured-extractor.ts` | 5 | 1 | Etki Alanı Aktörü (Actor) |
| `src/network/proxy-manager.ts` | 5 | 5 | Yardımcı Modül |
| `src/storage/ledger/sqlite-ledger-repository.ts` | 5 | 2 | Yardımcı Modül |
| `src/browser/session-vault.ts` | 4 | 4 | Oturum Denetleyicisi |
| `src/network/url-normalizer.ts` | 4 | 2 | Yardımcı Modül |
| `src/network/url-pattern-matcher.ts` | 4 | 2 | Yardımcı Modül |
| `src/storage/instagram-database.ts` | 4 | 4 | Yardımcı Modül |
| `src/workers/task-worker.ts` | 4 | 3 | Yardımcı Modül |
| `scripts/telemetry-logger.mjs` | 3 | 4 | Yardımcı Modül |
| `src/actors/documents/pdf-document-actor.ts` | 3 | 1 | Etki Alanı Aktörü (Actor) |
| `src/dataset/dataset-publisher.ts` | 3 | 2 | Yardımcı Modül |
| `src/extractors/pdf-anomaly-detector.ts` | 3 | 2 | Etki Alanı Aktörü (Actor) |
| `src/extractors/readability-extractor.ts` | 3 | 3 | Etki Alanı Aktörü (Actor) |
| `src/integrations/pipedream-connect.ts` | 3 | 6 | Yardımcı Modül |
| `src/network/retry-handler.ts` | 3 | 4 | Yardımcı Modül |
| `src/pipeline/connectors/connector-registry.ts` | 3 | 1 | Bileşen Tescili (Registry) |
| `src/pipeline/connectors/env-resolver.ts` | 3 | 2 | Yardımcı Modül |
| `src/pipeline/execution/local-executor.ts` | 3 | 2 | Yardımcı Modül |
| `src/pipeline/processors/jsonl-writer.ts` | 3 | 1 | Yardımcı Modül |
| `src/pipeline/storage/b2-storage.ts` | 3 | 2 | Yardımcı Modül |
| `src/pipeline/storage/local-storage.ts` | 3 | 1 | Yardımcı Modül |
| `src/pipeline/storage/r2-storage.ts` | 3 | 2 | Yardımcı Modül |
| `src/storage/object-vault.ts` | 3 | 5 | Yardımcı Modül |
| `src/vault/cold-vault-exporter.ts` | 3 | 1 | Yardımcı Modül |
| `src/actors/corpus/anayasa-mahkemesi-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/aperta-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/arxiv-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/binance-vision-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/biorxiv-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/clinical-trials-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/code-eval-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/court-listener-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/danistay-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/dergipark-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/devdocs-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/doaj-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/eur-lex-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/europe-pmc-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/github-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/google-patents-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/gutenberg-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/hacker-news-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/huggingface-datasets-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/ietf-rfc-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/instagram-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/internet-archive-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/internet-phil-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/kap-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/ktb-ekitap-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/lean-mathlib-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/lesswrong-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/libretexts-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/math-reasoning-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/metamath-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/mit-ocw-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/open-fda-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/open-textbook-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/openalex-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/openreview-actor.ts` | 2 | 2 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/openstax-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/papers-with-code-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/perseus-dl-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/philpapers-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/proofwiki-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/pubmed-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/resmi-gazete-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/rosetta-code-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/sacred-texts-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/saglik-ekutuphane-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/sec-edgar-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/semantic-scholar-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/software-heritage-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/stack-exchange-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/stanford-phil-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikibooks-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikidata-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikinews-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikipedia-actor.ts` | 2 | 2 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikiquote-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikisource-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikispecies-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikiversity-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wikivoyage-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/wiktionary-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/yargitay-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/youtube-transcripts-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/documents/archive-extractor-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/documents/document-extractor-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/documents/epub-extractor-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/cheerio-scraper-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/playwright-browser-actor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/api/routers/job-router.ts` | 2 | 2 | Yardımcı Modül |
| `src/api/run-logger.ts` | 2 | 2 | Yardımcı Modül |
| `src/browser/stealth-manager.ts` | 2 | 2 | Yardımcı Modül |
| `src/extractors/epub-extractor.ts` | 2 | 1 | Etki Alanı Aktörü (Actor) |
| `src/extractors/multi-column-layout-resolver.ts` | 2 | 2 | Etki Alanı Aktörü (Actor) |
| `src/extractors/office-extractor.ts` | 2 | 4 | Etki Alanı Aktörü (Actor) |
| `src/extractors/tabular-extractor.ts` | 2 | 3 | Etki Alanı Aktörü (Actor) |
| `src/mcp/auth-guard.ts` | 2 | 1 | Yardımcı Modül |
| `src/network/crawl-frontier.ts` | 2 | 4 | Yardımcı Modül |
| `src/pipeline/actor-resolver.ts` | 2 | 2 | Etki Alanı Aktörü (Actor) |
| `src/pipeline/execution/pipedream-executor.ts` | 2 | 2 | Yardımcı Modül |
| `src/pipeline/execution/remote-http-executor.ts` | 2 | 2 | Yardımcı Modül |
| `src/pipeline/output-sink.ts` | 2 | 3 | Yardımcı Modül |
| `src/pipeline/processors/csv-writer.ts` | 2 | 1 | Yardımcı Modül |
| `src/pipeline/processors/dedup-filter.ts` | 2 | 3 | Yardımcı Modül |
| `src/pipeline/processors/parquet-packer.ts` | 2 | 1 | Yardımcı Modül |
| `src/pipeline/processors/passthrough-writer.ts` | 2 | 1 | Yardımcı Modül |
| `src/pipeline/processors/quality-filter.ts` | 2 | 4 | Yardımcı Modül |
| `src/pipeline/processors/text-normalizer.ts` | 2 | 3 | Yardımcı Modül |
| `src/pipeline/storage/google-drive-storage.ts` | 2 | 3 | Yardımcı Modül |
| `src/storage/adapters/local-object-store.ts` | 2 | 2 | Yardımcı Modül |
| `contracts/storage.ts` | 1 | 3 | Yardımcı Modül |
| `src/actors/corpus/wikimedia-actor.ts` | 1 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/api-extractor-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/crawler-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/markdown-reader-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/network-interceptor-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/serp-search-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/actors/web/sitemap-xml-actor.ts` | 1 | 1 | Etki Alanı Aktörü (Actor) |
| `src/api/openapi-spec.ts` | 1 | 2 | Yardımcı Modül |
| `src/api/routers/control-router.ts` | 1 | 3 | Yardımcı Modül |
| `src/api/routers/dataset-router.ts` | 1 | 1 | Yardımcı Modül |
| `src/api/routers/pipeline-router.ts` | 1 | 2 | Yardımcı Modül |
| `src/api/routers/store-router.ts` | 1 | 1 | Yardımcı Modül |
| `src/api/routers/vault-router.ts` | 1 | 1 | Yardımcı Modül |
| `src/browser/browser-session-manager.ts` | 1 | 3 | Oturum Denetleyicisi |
| `src/browser/dom-indexer.ts` | 1 | 3 | Yardımcı Modül |
| `src/browser/interactive-browser-controller.ts` | 1 | 5 | Yardımcı Modül |
| `src/extractors/robots-parser.ts` | 1 | 3 | Etki Alanı Aktörü (Actor) |
| `src/mcp/http-transport.ts` | 1 | 2 | Yardımcı Modül |
| `src/network/crawl-url-accumulator.ts` | 1 | 3 | Yardımcı Modül |
| `src/network/politeness-limiter.ts` | 1 | 2 | Yardımcı Modül |
| `src/ocr/connectors/cloud-vision-connector.ts` | 1 | 2 | Yardımcı Modül |
| `src/ocr/connectors/generic-http-connector.ts` | 1 | 2 | Yardımcı Modül |
| `src/ocr/connectors/local-llm-vision-connector.ts` | 1 | 2 | Yardımcı Modül |
| `src/ocr/connectors/local-tesseract-connector.ts` | 1 | 2 | Yardımcı Modül |
| `src/ocr/connectors/mistral-ocr-connector.ts` | 1 | 2 | Yardımcı Modül |
| `src/ocr/connectors/unlimited-ocr-connector.ts` | 1 | 2 | Yardımcı Modül |
| `src/ocr/pdf-rasterizer.ts` | 1 | 2 | Yardımcı Modül |
| `src/telemetry/anomalies.ts` | 1 | 4 | Yardımcı Modül |
| `contracts/ledger.ts` | 0 | 14 | Yardımcı Modül |
| `scripts/checkpoint.mjs` | 0 | 3 | Yardımcı Modül |
| `scripts/consolidate-memory.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/doctor.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/download_instagram_media.ts` | 0 | 1 | Yardımcı Modül |
| `scripts/generate-connectome.mjs` | 0 | 4 | Sistem Haritacısı |
| `scripts/harvest_instagram_profile.ts` | 0 | 1 | Yardımcı Modül |
| `scripts/logs.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/omega-mcp-server.mjs` | 0 | 0 | Giriş Noktası (Server) |
| `scripts/omega-memory.mjs` | 0 | 0 | Semantik Bellek |
| `scripts/pipedream-cli.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/pulse.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/register-source.ts` | 0 | 0 | Yardımcı Modül |
| `scripts/run-worker.ts` | 0 | 0 | Yardımcı Modül |
| `scripts/sca-check.mjs` | 0 | 0 | Yardımcı Modül |
| `scripts/scaffold-actor.mjs` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `scripts/verify-pipeline.mjs` | 0 | 0 | Doğrulama Hattı |
| `src/actors/actor.template.ts` | 0 | 3 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/domains/academic.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/domains/legal.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/domains/philosophy-humanities.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/domains/reasoning-code.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `src/actors/corpus/domains/wikimedia.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `src/ocr/ocr-connector-registry.ts` | 0 | 3 | Bileşen Tescili (Registry) |
| `src/pipeline/cli.ts` | 0 | 0 | Yardımcı Modül |
| `src/storage/adapters/r2-object-store.ts` | 0 | 2 | Yardımcı Modül |
| `src/storage/ledger/outbox-dispatcher.ts` | 0 | 3 | Yardımcı Modül |
| `src/types/node-sqlite.d.ts` | 0 | 0 | Yardımcı Modül |
| `src/workers/handlers/dergipark-harvest-handler.ts` | 0 | 2 | Yardımcı Modül |
| `src/workers/handlers/download-handler.ts` | 0 | 2 | Yardımcı Modül |
| `src/workers/handlers/extract-handler.ts` | 0 | 2 | Yardımcı Modül |
| `src/workers/worker-pool.ts` | 0 | 1 | Yardımcı Modül |
| `tests/actor-resolver.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/anayasa-mahkemesi-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/aperta-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/api-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/archive-extractor-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/archive-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/archive-guard.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/arxiv-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/binance-vision-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/biorxiv-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/browser-pool.test.ts` | 0 | 0 | Kaynak Yöneticisi (BrowserPool) |
| `tests/browser-session-manager.test.ts` | 0 | 0 | Oturum Denetleyicisi |
| `tests/clinical-trials-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/code-eval-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/cold-vault-exporter-and-api.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/context-guard.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/contracts.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/control-router.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/court-listener-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/crawl-frontier.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/crawler-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/danistay-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/dataset-publisher-and-api.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/dergipark-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/dergipark-worker.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/devdocs-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/doaj-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/document-extractor-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/documents-archives-ocr-endpoints.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/dom-indexer.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/epub-extractor-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/epub-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/eur-lex-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/europe-pmc-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/github-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/google-patents-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/gutenberg-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/hacker-news-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/huggingface-datasets-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/ietf-rfc-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/instagram-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/instagram-database.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/interactive-browser-controller.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/internet-archive-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/internet-phil-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/job-scheduler-and-api.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/kap-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/ktb-ekitap-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/lean-mathlib-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/ledger-repository.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/lesswrong-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/libretexts-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/markdown-reader-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/math-reasoning-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/mcp-http-transport.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/metamath-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/mit-ocw-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/multi-column-layout-resolver.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/network-interceptor-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/object-store-adapters.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/object-vault.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/ocr-connectors.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/office-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/open-fda-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/open-textbook-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/openalex-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/openreview-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/openstax-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/papers-with-code-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/pdf-anomaly-detector.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/pdf-document-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/pdf-ocr-pipeline.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/pdf-rasterizer.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/perseus-dl-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/philpapers-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/pipedream-connect.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/pipeline-api-and-mcp.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/pipeline-quality-and-dedup.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/pipeline-runner.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/pipeline-schema.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/politeness-limiter.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/proofwiki-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/protokol-mcp-server.test.ts` | 0 | 0 | Giriş Noktası (Server) |
| `tests/proxy-manager.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/pubmed-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/readability-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/registry-database.test.ts` | 0 | 0 | Bileşen Tescili (Registry) |
| `tests/resmi-gazete-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/retry-handler.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/robots-parser.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/rosetta-code-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/sacred-texts-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/safe-redirect-fetcher.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/saglik-ekutuphane-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/scaffold-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/scheduler-and-remote.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/scraping-actors.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/sec-edgar-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/semantic-scholar-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/serp-search-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/server.test.ts` | 0 | 0 | Giriş Noktası (Server) |
| `tests/session-vault.test.ts` | 0 | 0 | Oturum Denetleyicisi |
| `tests/sitemap-xml-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/software-heritage-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/ssrf-guard.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/stack-exchange-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/stanford-phil-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/stealth-manager.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/storage-router.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/store-api.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/structured-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/tabular-extractor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/telemetry-and-logs.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/wikibooks-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikidata-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikimedia-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikinews-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikipedia-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikiquote-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikisource-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikispecies-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikiversity-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wikivoyage-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/wiktionary-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/worker-pool.test.ts` | 0 | 0 | Yardımcı Modül |
| `tests/yargitay-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |
| `tests/youtube-transcripts-actor.test.ts` | 0 | 0 | Etki Alanı Aktörü (Actor) |

## Kayıtlı API Rotaları

| Route | Method | Bağlı Actor / Controller |
|---|---|---|
| *(Belirlenemedi — henüz kaynak kodda API rotası tanımlanmamış)* | — | — |

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
| `arxiv` | `ArxivActor` |
| `wikimedia` | `WikimediaActor` |
| `wikipedia` | `WikipediaActor` |
| `open-alex` | `OpenAlexActor` |
| `stack-exchange` | `StackExchangeActor` |
| `gutenberg` | `GutenbergActor` |
| `europe-pmc` | `EuropePmcActor` |
| `ietf-rfc` | `IetfRfcActor` |
| `saglik-ekutuphane` | `SaglikEkutuphaneActor` |
| `ktb-ekitap` | `KtbEkitapActor` |
| `document-extractor` | `DocumentExtractorActor` |
| `archive-extractor` | `ArchiveExtractorActor` |
| `epub-extractor` | `EpubExtractorActor` |
| `dergi-park` | `DergiParkActor` |
| `internet-archive` | `InternetArchiveActor` |
| `clinical-trials` | `ClinicalTrialsActor` |
| `open-fda` | `OpenFdaActor` |
| `sec-edgar` | `SecEdgarActor` |
| `court-listener` | `CourtListenerActor` |
| `software-heritage` | `SoftwareHeritageActor` |
| `eur-lex` | `EurLexActor` |
| `open-stax` | `OpenStaxActor` |
| `mit-ocw` | `MitOcwActor` |
| `resmi-gazete` | `ResmiGazeteActor` |
| `yargitay` | `YargitayActor` |
| `kap` | `KapActor` |
| `github` | `GithubActor` |
| `hacker-news` | `HackerNewsActor` |
| `hugging-face-datasets` | `HuggingFaceDatasetsActor` |
| `math-reasoning` | `MathReasoningActor` |
| `code-eval` | `CodeEvalActor` |
| `proof-wiki` | `ProofWikiActor` |
| `lean-mathlib` | `LeanMathlibActor` |
| `less-wrong` | `LessWrongActor` |
| `open-review` | `OpenReviewActor` |
| `youtube-transcripts` | `YoutubeTranscriptsActor` |
| `wikisource` | `WikisourceActor` |
| `wiktionary` | `WiktionaryActor` |
| `wikiquote` | `WikiquoteActor` |
| `wikibooks` | `WikibooksActor` |
| `wikiversity` | `WikiversityActor` |
| `wikivoyage` | `WikivoyageActor` |
| `wikinews` | `WikinewsActor` |
| `wikispecies` | `WikispeciesActor` |
| `wikidata` | `WikidataActor` |
| `stanford-phil` | `StanfordPhilActor` |
| `internet-phil` | `InternetPhilActor` |
| `metamath` | `MetamathActor` |
| `phil-papers` | `PhilPapersActor` |
| `dev-docs` | `DevDocsActor` |
| `rosetta-code` | `RosettaCodeActor` |
| `papers-with-code` | `PapersWithCodeActor` |
| `libre-texts` | `LibreTextsActor` |
| `open-textbook` | `OpenTextbookActor` |
| `semantic-scholar` | `SemanticScholarActor` |
| `anayasa-mahkemesi` | `AnayasaMahkemesiActor` |
| `danistay` | `DanistayActor` |
| `google-patents` | `GooglePatentsActor` |
| `perseus-dl` | `PerseusDlActor` |
| `sacred-texts` | `SacredTextsActor` |
| `instagram` | `InstagramActor` |
| `pubmed` | `PubmedActor` |
| `biorxiv` | `BiorxivActor` |
| `doaj` | `DoajActor` |
| `aperta` | `ApertaActor` |
| `binance-vision` | `BinanceVisionActor` |
| `unlimited-ocr-connector` | `UnlimitedOcrConnector` |
| `local-llm-vision-ocr-connector` | `LocalLlmVisionOcrConnector` |
| `cloud-vision-ocr-connector` | `CloudVisionOcrConnector` |
| `mistral-ocr-connector` | `MistralOcrConnector` |
| `local-tesseract-ocr-connector` | `LocalTesseractOcrConnector` |
| `generic-http-ocr-connector` | `GenericHttpOcrConnector` |
| `main-r2` | `{
        type: "r2",
        bucket: "test-bucket",
      }` |

## İhraç Edilen Semboller ve Arayüz Kontratları (AST)

### `contracts/index.ts`

**Arayüzler (Interfaces):**
- `interface SourceDescriptorBudget` (3 üye)
- `interface SourceDescriptorPagination` (2 üye)
- `interface SourceDescriptor` (11 üye)
- `interface JobNotification` (5 üye)
**Tipler (Types):**
- `type IngestionMethod`

### `contracts/ledger.ts`

**Arayüzler (Interfaces):**
- `interface SourceRecord` (4 üye)
- `interface CrawlPartition` (8 üye)
- `interface DocumentRecord` (5 üye)
- `interface ContentObjectRecord` (3 üye)
- `interface ArtifactRecord` (9 üye)
- `interface JobRecord` (15 üye)
- `interface OutboxEventRecord` (9 üye)
- `interface FinalizeJobOptions` (3 üye)
- `interface FailJobOptions` (3 üye)
- `interface TaskContext` (3 üye)
- `interface TaskResult` (3 üye)
- `interface LedgerRepository` (16 üye)
**Tipler (Types):**
- `type JobStatus`
- `type TaskHandler`

### `contracts/storage.ts`

**Arayüzler (Interfaces):**
- `interface ObjectStore` (7 üye)
**Tipler (Types):**
- `type StorageRef`
- `type Capabilities`

### `scripts/checkpoint.mjs`

**Fonksiyonlar (Functions):**
- `createCheckpoint(label): void`
- `listCheckpoints(): void`
- `rollbackCheckpoint(targetId): void`

### `scripts/download_instagram_media.ts`

**Fonksiyonlar (Functions):**
- `downloadInstagramMedia(options: DownloaderOptions): void`

### `scripts/generate-connectome.mjs`

**Fonksiyonlar (Functions):**
- `scanFiles(dir, maxDepth, currentDepth): void`
- `parseFileAST(filePath, sourceText): void`
- `buildDependencyGraph(fileMap): void`
- `generateConnectome(target): void`

### `scripts/harvest_instagram_profile.ts`

**Fonksiyonlar (Functions):**
- `harvestInstagramProfile(options: HarvestOptions): void`

### `scripts/telemetry-logger.mjs`

**Fonksiyonlar (Functions):**
- `logTrace(entry, telemetryFile): void`
- `createTraceSession(task, tier, telemetryFile): void`

### `scripts/terminal-theme.mjs`

**Fonksiyonlar (Functions):**
- `badge(level, message): void`
- `banner(title, subtitle): void`
- `divider(char): void`
- `panel(title, entries): void`
- `table(headers, rows): void`

### `src/actors/actor-manifests.ts`

**Arayüzler (Interfaces):**
- `interface ActorInputField` (10 üye)
- `interface ActorInputSchema` (5 üye)
- `interface ActorManifest` (13 üye)
**Tipler (Types):**
- `type ActorCategory`

### `src/actors/actor-registry.ts`

**Sınıflar (Classes):**
- `class ActorRegistry`
  - `register(actor: IActor<unknown>): void`
  - `get(type: ActorType): IActor<T> | undefined`
  - `has(type: ActorType): boolean`
  - `list(): IActor<unknown>[]`
**Fonksiyonlar (Functions):**
- `createDefaultActorRegistry(): ActorRegistry`

### `src/actors/actor.template.ts`

**Sınıflar (Classes):**
- `class TemplateActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<TemplateActorResult>>`
  - `buildEndpointUrl(targetUrl: string, options: TemplateActorTaskOptions): string`
  - `parseResponse(rawContent: string, sourceUrl: string): TemplateActorResult`
**Arayüzler (Interfaces):**
- `interface TemplateActorTaskOptions` (4 üye)
- `interface TemplateActorResult` (3 üye)

### `src/actors/corpus/anayasa-mahkemesi-actor.ts`

**Sınıflar (Classes):**
- `class AnayasaMahkemesiActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<AnayasaMahkemesiActorResult>>`
  - `resolveAction(targetUrl: string, specifiedAction: AnayasaMahkemesiAction): AnayasaMahkemesiAction`
  - `buildEndpointUrl(targetUrl: string, action: AnayasaMahkemesiAction, options: AnayasaMahkemesiActorTaskOptions): string`
  - `parseResponse(rawText: string, queryUrl: string, action: AnayasaMahkemesiAction, options: AnayasaMahkemesiActorTaskOptions): AnayasaMahkemesiActorResult`
  - `parseJsonDecisions(rawItems: Record<string, unknown>[], queryUrl: string, action: AnayasaMahkemesiAction, explicitTotal: number): AnayasaMahkemesiActorResult`
  - `parseJsonDecisionDetail(data: Record<string, unknown>, queryUrl: string): AnayasaMahkemesiActorResult`
  - `parseHtmlDecisions(html: string, queryUrl: string, action: AnayasaMahkemesiAction, options: AnayasaMahkemesiActorTaskOptions): AnayasaMahkemesiActorResult`
  - `parseHtmlDecisionDetail(html: string, queryUrl: string): AnayasaMahkemesiActorResult`
  - `normalizeCategory(cat: unknown): "individual" | "norm" | "party" | "yuce_divan"`
  - `renderDecisionsMarkdown(decisions: AnayasaMahkemesiDecisionItem[], action: AnayasaMahkemesiAction, queryUrl: string): string`
  - `renderDetailMarkdown(detail: AnayasaMahkemesiDecisionDetail): string`

### `src/actors/corpus/aperta-actor.ts`

**Sınıflar (Classes):**
- `class ApertaActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ApertaActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: ApertaActorTaskOptions, action: "search_records" | "get_record" | "list_files"): string`
  - `transformItem(item: RawApertaItem): ApertaRecordItem`
  - `renderMarkdown(records: ApertaRecordItem[], action: string, totalCount: number, options: ApertaActorTaskOptions): string`

### `src/actors/corpus/arxiv-actor.ts`

**Sınıflar (Classes):**
- `class ArxivActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ArxivActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: ArxivActorTaskOptions): string`
  - `extractArxivId(input: string): string | undefined`
  - `parseAtomFeed(xml: string): {
    totalResults: number;
    startIndex: number;
    itemsPerPage: number;
    papers: ArxivPaperItem[];
  }`
  - `enrichPapersWithPdfText(papers: ArxivPaperItem[], timeoutMs: number, allowLocalNetwork: boolean): Promise<void>`

### `src/actors/corpus/binance-vision-actor.ts`

**Sınıflar (Classes):**
- `class BinanceVisionActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<BinanceVisionActorResult>>`
  - `buildPrefix(market: string, dataType: string, symbol: string, interval: string, periodType: string): string`
  - `parseXmlContents(xmlText: string): Array<{ key: string; size: number; lastModified: string }>`
  - `parseXmlCommonPrefixes(xmlText: string): string[]`
  - `fetchS3Xml(url: string, timeoutMs: number, allowLocalNetwork): Promise<string>`
  - `handleListFiles(taskId: string, market: string, dataType: string, symbol: string, interval: string, periodType: string, limit: number, timeoutMs: number, startTime: number, s3Base: string, isLocalTest): Promise<ActorResult<BinanceVisionActorResult>>`
  - `handleListSymbols(taskId: string, market: string, dataType: string, periodType: string, limit: number, timeoutMs: number, startTime: number, s3Base: string, isLocalTest): Promise<ActorResult<BinanceVisionActorResult>>`
  - `handleGetFileInfo(taskId: string, market: string, dataType: string, symbol: string, interval: string, periodType: string, year: string, month: string, timeoutMs: number, startTime: number, s3Base: string, isLocalTest): Promise<ActorResult<BinanceVisionActorResult>>`
  - `formatFilesMarkdown(market: string, dataType: string, symbol: string, interval: string, periodType: string, files: BinanceVisionFileItem[]): string`
  - `formatSymbolsMarkdown(market: string, dataType: string, periodType: string, symbols: string[]): string`

### `src/actors/corpus/biorxiv-actor.ts`

**Sınıflar (Classes):**
- `class BiorxivActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<BiorxivActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: BiorxivActorTaskOptions, server: string): string`
  - `synthesizeArticleMarkdown(item: {
    doi: string;
    title: string;
    server: string;
    category: string;
    pubDate?: string;
    version?: number;
    authors?: string;
    institution?: string;
    license?: string;
    publishedDoi?: string;
    abstractText?: string;
  }): string`
  - `synthesizeOverallMarkdown(meta: {
    server: string;
    totalCount: number;
    cursor: number;
    articles: BiorxivArticleItem[];
    query?: string;
    category?: string;
    interval?: string;
    doi?: string;
  }): string`

### `src/actors/corpus/clinical-trials-actor.ts`

**Sınıflar (Classes):**
- `class ClinicalTrialsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ClinicalTrialsActorResult>>`
  - `buildRequestUrl(task: ActorTask, options: ClinicalTrialsActorTaskOptions): string`
  - `normalizeStudy(raw: RawStudyProtocol): ClinicalStudySummary`
  - `synthesizeMarkdown(studies: ClinicalStudySummary[], totalCount: number): string`

### `src/actors/corpus/code-eval-actor.ts`

**Sınıflar (Classes):**
- `class CodeEvalActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<CodeEvalActorResult>>`
  - `resolveParameters(targetUrl: string, options: CodeEvalActorTaskOptions): {
    benchmark: string;
    dataset: string;
    config: string;
    split: string;
    offset: number;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string, resolved: {
      dataset: string;
      config: string;
      split: string;
      offset: number;
      limit: number;
    }): string`
  - `parseTasks(benchmark: string, json: Record<string, unknown>): CodeEvalItem[]`
  - `renderMarkdown(benchmark: string, split: string, tasks: CodeEvalItem[]): string`

### `src/actors/corpus/court-listener-actor.ts`

**Sınıflar (Classes):**
- `class CourtListenerActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<CourtListenerActorResult>>`
  - `buildRequestUrl(task: ActorTask, options: CourtListenerActorTaskOptions): string`
  - `normalizeItem(raw: RawCourtListenerItem): CourtListenerDocumentItem`
  - `synthesizeMarkdown(items: CourtListenerDocumentItem[], totalCount: number, options: CourtListenerActorTaskOptions): string`

### `src/actors/corpus/danistay-actor.ts`

**Sınıflar (Classes):**
- `class DanistayActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DanistayActorResult>>`
  - `resolveAction(targetUrl: string, specifiedAction: DanistayAction): DanistayAction`
  - `buildEndpointUrl(targetUrl: string, action: DanistayAction, options: DanistayActorTaskOptions): string`
  - `parseResponse(rawText: string, queryUrl: string, action: DanistayAction, options: DanistayActorTaskOptions): DanistayActorResult`
  - `parseJsonDecisions(rawItems: Record<string, unknown>[], queryUrl: string, action: DanistayAction, explicitTotal: number): DanistayActorResult`
  - `parseJsonDecisionDetail(data: Record<string, unknown>, queryUrl: string): DanistayActorResult`
  - `parseHtmlDecisions(html: string, queryUrl: string, action: DanistayAction, options: DanistayActorTaskOptions): DanistayActorResult`
  - `parseHtmlDecisionDetail(html: string, queryUrl: string): DanistayActorResult`
  - `renderDecisionsMarkdown(decisions: DanistayDecisionItem[], queryUrl: string): string`
  - `renderDetailMarkdown(detail: DanistayDecisionDetail): string`

### `src/actors/corpus/dergipark-actor.ts`

**Sınıflar (Classes):**
- `class DergiParkActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DergiParkActorResult>>`
  - `handleListSets(task: ActorTask, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<DergiParkActorResult>>`
  - `handleGetRecord(task: ActorTask, opts: DergiParkActorTaskOptions, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<DergiParkActorResult>>`
  - `handleListRecords(task: ActorTask, opts: DergiParkActorTaskOptions, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<DergiParkActorResult>>`
  - `parseRecord($: ReturnType<typeof cheerio.load>, el: Parameters<ReturnType<typeof cheerio.load>>[0]): DergiParkArticle | undefined`
  - `httpError(task: ActorTask, status: number, message: string, startTime: number): ActorResult<DergiParkActorResult>`

### `src/actors/corpus/devdocs-actor.ts`

**Sınıflar (Classes):**
- `class DevDocsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DevDocsActorResult>>`

### `src/actors/corpus/doaj-actor.ts`

**Sınıflar (Classes):**
- `class DoajActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DoajActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: DoajActorTaskOptions, action: "search_articles" | "search_journals" | "get_article"): string`
  - `normalizeItem(raw: RawDoajItem): DoajArticleItem`
  - `synthesizeArticleMarkdown(item: {
    id: string;
    doi?: string;
    title: string;
    abstract?: string;
    journal?: string;
    publisher?: string;
    issn?: string;
    year?: number;
    authors?: string;
    affiliations?: string;
    keywords?: string[];
    subjects?: string[];
    fulltextUrl?: string;
  }): string`
  - `synthesizeOverallMarkdown(meta: {
    action: string;
    totalCount: number;
    page: number;
    pageSize: number;
    articles: DoajArticleItem[];
    query?: string;
    articleId?: string;
  }): string`

### `src/actors/corpus/eur-lex-actor.ts`

**Sınıflar (Classes):**
- `class EurLexActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<EurLexActorResult>>`
  - `resolveCelex(task: ActorTask, options: EurLexActorTaskOptions): string | undefined`
  - `buildRequestUrl(task: ActorTask, celex: string, query: string, language): string`
  - `parseEurLexHtml(html: string, celex: string, language: string, url: string): EurLexDocumentItem`
  - `parseSparqlOrJsonResponse(json: unknown, language: string): { documents: EurLexDocumentItem[]; totalCount: number }`
  - `inferDocType(celex: string): string`
  - `synthesizeMarkdown(docs: EurLexDocumentItem[], celex: string, query: string, language): string`

### `src/actors/corpus/europe-pmc-actor.ts`

**Sınıflar (Classes):**
- `class EuropePmcActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<EuropePmcActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: EuropePmcActorTaskOptions): string`

### `src/actors/corpus/github-actor.ts`

**Sınıflar (Classes):**
- `class GithubActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<GithubActorResult>>`
  - `resolveRepoAndAction(targetUrl: string, options: GithubActorTaskOptions): { owner: string; repo: string; action: string }`
  - `buildEndpointUrl(targetUrl: string | undefined, owner: string, repo: string, action: string, options: GithubActorTaskOptions): string`
  - `renderMarkdown(owner: string, repo: string, action: string, data: Record<string, unknown> | Array<Record<string, unknown>>, endpointUrl: string): string`

### `src/actors/corpus/google-patents-actor.ts`

**Sınıflar (Classes):**
- `class GooglePatentsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<GooglePatentsActorResult>>`
  - `resolveAction(targetUrl: string, specifiedAction: GooglePatentsAction): GooglePatentsAction`
  - `resolvePatentId(targetUrl: string, specifiedPatentId: string): string`
  - `buildEndpointUrl(targetUrl: string, action: GooglePatentsAction, options: GooglePatentsActorTaskOptions): string`
  - `parseResponse(rawText: string, queryUrl: string, action: GooglePatentsAction, options: GooglePatentsActorTaskOptions): GooglePatentsActorResult`
  - `parseJsonPatent(data: Record<string, unknown>, queryUrl: string, action: GooglePatentsAction): GooglePatentsActorResult`
  - `parseJsonSearchResults(data: unknown, queryUrl: string): GooglePatentsActorResult`
  - `parseHtmlPatent(html: string, queryUrl: string, action: GooglePatentsAction, options: GooglePatentsActorTaskOptions): GooglePatentsActorResult`
  - `parseHtmlSearch(html: string, queryUrl: string, _options: GooglePatentsActorTaskOptions): GooglePatentsActorResult`
  - `renderClaimsMarkdown(claims: GooglePatentClaimItem[], patentId: string, queryUrl: string): string`
  - `renderPatentMarkdown(patent: GooglePatentItem): string`
  - `renderSearchMarkdown(patents: GooglePatentItem[], queryUrl: string): string`

### `src/actors/corpus/gutenberg-actor.ts`

**Sınıflar (Classes):**
- `class GutenbergActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<GutenbergActorResult>>`
  - `downloadAndCleanTexts(books: GutenbergBookItem[], maxBytes: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<void>`
  - `stripGutenbergHeaders(rawText: string): string`
  - `buildApiUrl(targetUrl: string | undefined, options: GutenbergActorTaskOptions): string`

### `src/actors/corpus/hacker-news-actor.ts`

**Sınıflar (Classes):**
- `class HackerNewsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<HackerNewsActorResult>>`
  - `resolveParameters(targetUrl: string, options: HackerNewsActorTaskOptions): {
    action: "top" | "best" | "new" | "ask" | "show" | "story" | "search";
    storyId?: number;
    query?: string;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, action: string, storyId: number, query: string, limit: number): string`
  - `parseResponse(action: string, rawText: string, endpointUrl: string, maxComments: number): { stories: HackerNewsStoryItem[]; markdown: string }`
  - `parseCommentTree(rawChildren: Array<Record<string, unknown>> | undefined, maxCount: number, currentCount): HackerNewsCommentItem[]`
  - `renderMarkdown(action: string, stories: HackerNewsStoryItem[], endpointUrl: string): string`
  - `renderCommentsMarkdown(comments: HackerNewsCommentItem[], lines: string[], depth: number): void`

### `src/actors/corpus/huggingface-datasets-actor.ts`

**Sınıflar (Classes):**
- `class HuggingFaceDatasetsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<HuggingFaceDatasetsActorResult>>`
  - `resolveParameters(targetUrl: string, options: HuggingFaceDatasetsActorTaskOptions): {
    action: "rows" | "splits" | "info" | "size";
    dataset: string;
    config: string;
    split: string;
    offset: number;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string, resolved: {
      action: "rows" | "splits" | "info" | "size";
      dataset: string;
      config: string;
      split: string;
      offset: number;
      limit: number;
    }): string`
  - `parseResponse(resolved: {
      action: "rows" | "splits" | "info" | "size";
      dataset: string;
      config: string;
      split: string;
      offset: number;
      limit: number;
    }, queryUrl: string, json: Record<string, unknown>): HuggingFaceDatasetsActorResult`
  - `renderRowsMarkdown(resolved: { dataset: string; config: string; split: string; offset: number; limit: number }, features: HuggingFaceDatasetsFeatureItem[], rows: Array<Record<string, unknown>>, totalRows: number): string`
  - `renderSplitsMarkdown(dataset: string, splits: HuggingFaceDatasetsSplitItem[]): string`
  - `renderInfoMarkdown(dataset: string, info: { description?: string; homepage?: string; license?: string; citation?: string }): string`

### `src/actors/corpus/ietf-rfc-actor.ts`

**Sınıflar (Classes):**
- `class IetfRfcActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<IetfRfcActorResult>>`
  - `cleanRfcText(rawText: string): string`
  - `parseRfcTextHeader(text: string, rfcNumber: number): {
    title: string;
    status?: string;
    authors?: string[];
    pubDate?: string;
    abstract?: string;
    obsoletes?: string[];
  }`
  - `resolveRfcNumber(targetUrl: string | undefined, options: IetfRfcActorTaskOptions): number | undefined`
  - `buildRfcTextUrl(targetUrl: string | undefined, rfcNumber: number): string`
  - `buildDatatrackerSearchUrl(targetUrl: string | undefined, options: IetfRfcActorTaskOptions): string`

### `src/actors/corpus/instagram-actor.ts`

**Sınıflar (Classes):**
- `class InstagramActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<InstagramActorResult>>`
  - `resolveTarget(targetUrl: string, options: InstagramActorTaskOptions): TargetResolution | null`
  - `executeHttpExtraction(target: TargetResolution, options: InstagramActorTaskOptions, timeoutMs: number, allowLocalNetwork: boolean): Promise<InstagramActorResult>`
  - `executeBrowserExtraction(target: TargetResolution, options: InstagramActorTaskOptions, timeoutMs: number, allowLocalNetwork: boolean): Promise<InstagramActorResult>`
  - `extractFromPageDom(page: import("playwright").Page, target: TargetResolution, _options: InstagramActorTaskOptions): Promise<InstagramActorResult>`
  - `parseJsonResponse(target: TargetResolution, json: Record<string, unknown>, _options: InstagramActorTaskOptions): InstagramActorResult`
  - `normalizeProfile(raw: Record<string, unknown>): InstagramProfileRecord`
  - `normalizeMedia(raw: Record<string, unknown>): InstagramMediaRecord`
  - `normalizeHashtag(raw: Record<string, unknown>, tagName: string): InstagramHashtagRecord`
  - `synthesizeMarkdown(result: InstagramActorResult): string`
  - `buildApiEndpoint(target: TargetResolution): string`
  - `buildWebUrl(target: TargetResolution): string`
  - `buildCookieHeader(options: InstagramActorTaskOptions): string | undefined`
  - `parseProfileStatsFromDescription(desc: string): {
    followers: number;
    following: number;
    posts: number;
  }`
  - `parseNumericKmb(val: string): number`
  - `extractHashtags(text: string): string[]`
  - `extractMentions(text: string): string[]`

### `src/actors/corpus/internet-archive-actor.ts`

**Sınıflar (Classes):**
- `class InternetArchiveActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<InternetArchiveActorResult>>`
  - `handleMetadata(task: ActorTask, opts: InternetArchiveActorTaskOptions, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<InternetArchiveActorResult>>`
  - `handleSearch(task: ActorTask, opts: InternetArchiveActorTaskOptions, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<InternetArchiveActorResult>>`
  - `handleText(task: ActorTask, opts: InternetArchiveActorTaskOptions, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<InternetArchiveActorResult>>`
  - `parseMetadataJson(json: Record<string, unknown>, identifier: string): InternetArchiveItem`
  - `selectTextFile(files: InternetArchiveFile[]): InternetArchiveFile | undefined`
  - `resolveIdentifier(task: ActorTask, opts: InternetArchiveActorTaskOptions): string | undefined`
  - `httpError(task: ActorTask, status: number, message: string, startTime: number): ActorResult<InternetArchiveActorResult>`

### `src/actors/corpus/internet-phil-actor.ts`

**Sınıflar (Classes):**
- `class InternetPhilActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<InternetPhilActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: InternetPhilActorTaskOptions): {
    action: "entry" | "search";
    slug: string;
    query?: string;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, resolved: ReturnType<typeof this.resolveParameters>): string`
  - `parseResponse(action: "entry" | "search", html: string, endpoint: string, slug: string): InternetPhilActorResult`

### `src/actors/corpus/kap-actor.ts`

**Sınıflar (Classes):**
- `class KapActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<KapActorResult>>`
  - `buildEndpointUrl(targetUrl: string, options: KapActorTaskOptions): string`
  - `parseResponse(rawText: string, queryUrl: string, options: KapActorTaskOptions): KapActorResult`
  - `parseJsonDisclosures(rawItems: Record<string, unknown>[], queryUrl: string, options: KapActorTaskOptions): KapActorResult`
  - `parseHtmlDisclosures(html: string, queryUrl: string, options: KapActorTaskOptions): KapActorResult`
  - `applyFilters(items: KapDisclosureItem[], options: KapActorTaskOptions): KapDisclosureItem[]`
  - `renderMarkdownSummary(disclosures: KapDisclosureItem[], queryUrl: string, companyTicker: string): string`

### `src/actors/corpus/ktb-ekitap-actor.ts`

**Sınıflar (Classes):**
- `class KtbEkitapActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<KtbEkitapActorResult>>`
  - `resolveBaseUrl(targetUrl: string): string`
  - `extractIdFromUrl(url: string): number | undefined`
  - `handleListAction(task: ActorTask, baseUrl: string, category: KtbEkitapCategory, page: number, limit: number, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<KtbEkitapActorResult>>`
  - `handleDetailOrExtractAction(task: ActorTask, baseUrl: string, detailUrl: string, explicitBookId: number | undefined, shouldExtractText: boolean, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<KtbEkitapActorResult>>`
  - `sanitizeTextForLlm(pages: string[]): string`

### `src/actors/corpus/lean-mathlib-actor.ts`

**Sınıflar (Classes):**
- `class LeanMathlibActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<LeanMathlibActorResult>>`
  - `resolveParameters(targetUrl: string, options: LeanMathlibActorTaskOptions): {
    action: "file" | "theorem" | "search" | "random";
    repo: string;
    path: string;
    theorem?: string;
    query?: string;
    limit: number;
    githubToken?: string;
  }`
  - `buildEndpointUrl(targetUrl: string, resolved: {
      action: "file" | "theorem" | "search" | "random";
      repo: string;
      path: string;
      query?: string;
    }): string`
  - `parseLeanDeclarations(sourceText: string, repo: string, filePath: string, filterTheorem: string): LeanMathlibItem[]`
  - `parseSearchResults(json: Record<string, unknown>, repo: string): LeanMathlibItem[]`
  - `renderMarkdown(action: string, repo: string, path: string, items: LeanMathlibItem[]): string`

### `src/actors/corpus/lesswrong-actor.ts`

**Sınıflar (Classes):**
- `class LessWrongActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<LessWrongActorResult>>`
  - `resolveParameters(targetUrl: string, options: LessWrongActorTaskOptions): {
    action: "posts" | "post" | "comments" | "search";
    platform: "lesswrong" | "alignmentforum";
    postId?: string;
    slug?: string;
    query?: string;
    limit: number;
    view: string;
    includeComments: boolean;
    maxComments: number;
  }`
  - `buildEndpointUrl(targetUrl: string, platform: "lesswrong" | "alignmentforum"): string`
  - `buildGraphQLPayload(resolved: {
    action: "posts" | "post" | "comments" | "search";
    postId?: string;
    slug?: string;
    query?: string;
    limit: number;
    view: string;
  }): { query: string; variables: Record<string, unknown> }`
  - `parseGraphQLResponse(_action: string, json: Record<string, unknown>): { posts: LessWrongPost[]; comments?: LessWrongComment[] }`
  - `fetchCommentsForPost(endpoint: string, postId: string, limit: number, headers: Record<string, string>, allowLocalNetwork: boolean): Promise<LessWrongComment[]>`
  - `renderMarkdown(platform: string, action: string, posts: LessWrongPost[], comments: LessWrongComment[]): string`

### `src/actors/corpus/libretexts-actor.ts`

**Sınıflar (Classes):**
- `class LibreTextsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<LibreTextsActorResult>>`
  - `resolveLibrary(targetUrl: string, specifiedLibrary: string): string`
  - `resolveBaseUrl(targetUrl: string, library): string`
  - `resolveAction(task: ActorTask, options: LibreTextsActorTaskOptions): "page" | "search" | "subpages" | "toc"`
  - `handleSearch(task: ActorTask, options: LibreTextsActorTaskOptions, library: string, baseUrl: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<LibreTextsActorResult>>`
  - `handlePage(task: ActorTask, options: LibreTextsActorTaskOptions, library: string, baseUrl: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<LibreTextsActorResult>>`
  - `handleSubpages(task: ActorTask, options: LibreTextsActorTaskOptions, library: string, baseUrl: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<LibreTextsActorResult>>`
  - `renderSearchMarkdown(query: string, library: string, pages: LibreTextsPageItem[]): string`
  - `renderPageMarkdown(page: LibreTextsPageItem): string`

### `src/actors/corpus/math-reasoning-actor.ts`

**Sınıflar (Classes):**
- `class MathReasoningActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<MathReasoningActorResult>>`
  - `resolveParameters(targetUrl: string, options: MathReasoningActorTaskOptions): {
    benchmark: string;
    dataset: string;
    config: string;
    split: string;
    subject?: string;
    offset: number;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string, resolved: {
      dataset: string;
      config: string;
      split: string;
      offset: number;
      limit: number;
    }): string`
  - `parseProblems(benchmark: string, json: Record<string, unknown>): MathReasoningItem[]`
  - `renderMarkdown(benchmark: string, subject: string | undefined, problems: MathReasoningItem[]): string`

### `src/actors/corpus/metamath-actor.ts`

**Sınıflar (Classes):**
- `class MetamathActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<MetamathActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: MetamathActorTaskOptions): {
    action: "theorem" | "search" | "axiom";
    theorem?: string;
    axiom?: string;
    query?: string;
    database: "set.mm" | "iset.mm" | "ql.mm";
    includeProofSteps: boolean;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, resolved: ReturnType<typeof this.resolveParameters>): string`
  - `parseResponse(action: "theorem" | "search" | "axiom", html: string, endpoint: string, symbol: string, database: string, includeProofSteps: boolean): MetamathActorResult`

### `src/actors/corpus/mit-ocw-actor.ts`

**Sınıflar (Classes):**
- `class MitOcwActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<MitOcwActorResult>>`
  - `searchCourses(task: ActorTask, options: MitOcwActorTaskOptions, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<MitOcwActorResult>>`
  - `fetchCourseDetail(task: ActorTask, options: MitOcwActorTaskOptions, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<MitOcwActorResult>>`
  - `renderCoursesMarkdown(courses: MitOcwCourseItem[], query: string | undefined, totalCount: number): string`
  - `renderCourseDetailMarkdown(course: MitOcwCourseItem, data: RawCourseDataJson): string`

### `src/actors/corpus/open-fda-actor.ts`

**Sınıflar (Classes):**
- `class OpenFdaActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenFdaActorResult>>`
  - `buildRequestUrl(task: ActorTask, options: OpenFdaActorTaskOptions, endpoint: string): string`
  - `synthesizeMarkdown(endpoint: string, results: Array<Record<string, unknown>>, total: number): string`
  - `getFirstStringArray(val: unknown): string | undefined`

### `src/actors/corpus/open-textbook-actor.ts`

**Sınıflar (Classes):**
- `class OpenTextbookActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenTextbookActorResult>>`
  - `resolveAction(task: ActorTask, options: OpenTextbookActorTaskOptions): "book" | "search" | "subjects"`
  - `resolveBaseUrl(targetUrl: string): string`
  - `handleSearch(task: ActorTask, options: OpenTextbookActorTaskOptions, baseUrl: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<OpenTextbookActorResult>>`
  - `handleBook(task: ActorTask, options: OpenTextbookActorTaskOptions, baseUrl: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<OpenTextbookActorResult>>`
  - `handleSubjects(task: ActorTask, _options: OpenTextbookActorTaskOptions, baseUrl: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<OpenTextbookActorResult>>`
  - `renderSearchMarkdown(query: string, books: OpenTextbookItem[]): string`
  - `renderBookMarkdown(book: OpenTextbookItem): string`

### `src/actors/corpus/openalex-actor.ts`

**Sınıflar (Classes):**
- `class OpenAlexActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenAlexActorResult>>`
  - `reconstructAbstract(invertedIndex: Record<string, number[]>): string | undefined`
  - `buildApiUrl(targetUrl: string | undefined, options: OpenAlexActorTaskOptions): string`

### `src/actors/corpus/openreview-actor.ts`

**Sınıflar (Classes):**
- `class OpenReviewActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenReviewActorResult>>`
  - `resolveParameters(targetUrl: string, options: OpenReviewActorTaskOptions): {
    action: "submissions" | "forum" | "note";
    venue?: string;
    forumId?: string;
    noteId?: string;
    query?: string;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, action: string, venue: string, forumId: string, noteId: string, query: string, limit: number): string`
  - `parseNotes(rawJson: string): OpenReviewNoteItem[]`
  - `renderMarkdown(action: string, venue: string, forumId: string, notes: OpenReviewNoteItem[], endpointUrl: string): string`

### `src/actors/corpus/openstax-actor.ts`

**Sınıflar (Classes):**
- `class OpenStaxActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<OpenStaxActorResult>>`
  - `fetchCatalogOrSearch(task: ActorTask, options: OpenStaxActorTaskOptions, action: "catalog" | "search" | "detail" | "chapter", startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<OpenStaxActorResult>>`
  - `fetchBookDetail(task: ActorTask, options: OpenStaxActorTaskOptions, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<OpenStaxActorResult>>`
  - `fetchChapterContent(task: ActorTask, options: OpenStaxActorTaskOptions, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<OpenStaxActorResult>>`
  - `renderBooksMarkdown(books: OpenStaxBookItem[], query: string | undefined, totalCount: number, action: string): string`
  - `renderBookDetailMarkdown(book: OpenStaxBookItem, detail: Record<string, unknown>): string`

### `src/actors/corpus/papers-with-code-actor.ts`

**Sınıflar (Classes):**
- `class PapersWithCodeActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PapersWithCodeActorResult>>`

### `src/actors/corpus/perseus-dl-actor.ts`

**Sınıflar (Classes):**
- `class PerseusDlActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PerseusDlActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: PerseusDlActorTaskOptions): {
    action: PerseusDlAction;
    doc: string;
    subReference?: string;
    word?: string;
    language: string;
    query?: string;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, resolved: ReturnType<typeof this.resolveParameters>): string`
  - `parseResponse(action: PerseusDlAction, html: string, endpoint: string, resolved: ReturnType<typeof this.resolveParameters>): PerseusDlActorResult`
  - `parseTextPassage($: cheerio.CheerioAPI, docId: string, endpoint: string): PerseusTextPassage`
  - `parseMorphAnalysis($: cheerio.CheerioAPI, word: string): PerseusMorphAnalysis[]`
  - `extractGrammaticalFeatures(text: string): NonNullable<PerseusMorphAnalysis["features"]>`
  - `parseSearchResults($: cheerio.CheerioAPI, limit: number): PerseusSearchResultItem[]`
  - `renderPassageMarkdown(passage: PerseusTextPassage): string`
  - `renderMorphMarkdown(analyses: PerseusMorphAnalysis[], word: string): string`
  - `renderSearchMarkdown(results: PerseusSearchResultItem[], query: string): string`

### `src/actors/corpus/philpapers-actor.ts`

**Sınıflar (Classes):**
- `class PhilPapersActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PhilPapersActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: PhilPapersActorTaskOptions): {
    action: "record" | "search" | "category";
    id?: string;
    query?: string;
    category?: string;
    filterSubject?: string;
    startYear?: number;
    endYear?: number;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, resolved: ReturnType<typeof this.resolveParameters>): string`
  - `parseResponse(action: "record" | "search" | "category", html: string, endpoint: string, id: string, category: string): PhilPapersActorResult`

### `src/actors/corpus/proofwiki-actor.ts`

**Sınıflar (Classes):**
- `class ProofWikiActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ProofWikiActorResult>>`
  - `resolveParameters(targetUrl: string, options: ProofWikiActorTaskOptions): {
    action: "theorem" | "search" | "random" | "category";
    title?: string;
    query?: string;
    category?: string;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string, resolved: {
      action: "theorem" | "search" | "random" | "category";
      title?: string;
      query?: string;
      category?: string;
      limit: number;
    }): string`
  - `parseResponse(_action: string, json: Record<string, unknown>, fallbackTitle: string): ProofWikiItem[]`
  - `parseWikitextSections(wikitext: string): {
    theorem?: string;
    proofs: string[];
    definitions: string[];
    sources: string[];
  }`
  - `normalizeMath(text: string): string`
  - `renderMarkdown(action: string, items: ProofWikiItem[]): string`

### `src/actors/corpus/pubmed-actor.ts`

**Sınıflar (Classes):**
- `class PubmedActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PubmedActorResult>>`
  - `buildApiUrl(targetUrl: string | undefined, options: PubmedActorTaskOptions, action: "search" | "summary" | "fetch" | "bioc"): string`
  - `parsePubmedXml(xmlText: string): PubmedArticleItem[]`
  - `parseEsummaryJson(resultObj: Record<string, unknown>): PubmedArticleItem[]`
  - `parseBioCJson(biocObj: RawBioCResult): PubmedArticleItem[]`

### `src/actors/corpus/resmi-gazete-actor.ts`

**Sınıflar (Classes):**
- `class ResmiGazeteActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ResmiGazeteActorResult>>`
  - `buildEndpointUrl(targetUrl: string, options: ResmiGazeteActorTaskOptions): string`
  - `parseResmiGazeteHtml(html: string, queryUrl: string, options: ResmiGazeteActorTaskOptions): ResmiGazeteActorResult`
  - `resolveAbsoluteUrl(href: string, base: string): string`
  - `cleanDocumentText($: cheerio.CheerioAPI, _url: string): string`
  - `monthNameToNumber(name: string): string`
  - `renderMarkdownSummary(date: string, issueNumber: number | undefined, isRepeated: boolean, items: ResmiGazeteItem[], queryUrl: string): string`

### `src/actors/corpus/rosetta-code-actor.ts`

**Sınıflar (Classes):**
- `class RosettaCodeActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<RosettaCodeActorResult>>`

### `src/actors/corpus/sacred-texts-actor.ts`

**Sınıflar (Classes):**
- `class SacredTextsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<SacredTextsActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: SacredTextsActorTaskOptions): {
    action: SacredTextsAction;
    tradition: string;
    path: string;
    query?: string;
    limit: number;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, resolved: ReturnType<typeof this.resolveParameters>): string`
  - `parseResponse(action: SacredTextsAction, html: string, endpoint: string, resolved: ReturnType<typeof this.resolveParameters>): SacredTextsActorResult`
  - `parseTextPassage($: cheerio.CheerioAPI, endpoint: string, tradition: string): SacredTextsPassage`
  - `parseCatalog($: cheerio.CheerioAPI, endpoint: string, tradition: string, limit: number): SacredTextsBookItem[]`
  - `resolveRelativeUrl(base: string, relative: string): string`
  - `renderPassageMarkdown(passage: SacredTextsPassage): string`
  - `renderCatalogMarkdown(books: SacredTextsBookItem[], tradition: string, query: string): string`

### `src/actors/corpus/saglik-ekutuphane-actor.ts`

**Sınıflar (Classes):**
- `class SaglikEkutuphaneActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<SaglikEkutuphaneActorResult>>`
  - `resolveBaseUrl(targetUrl: string): string`
  - `extractIdFromUrl(url: string): number | undefined`
  - `handleListAction(task: ActorTask, baseUrl: string, category: SaglikEkutuphaneCategory, page: number, limit: number, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<SaglikEkutuphaneActorResult>>`
  - `handleDetailOrExtractAction(task: ActorTask, baseUrl: string, publicationId: number, shouldExtractText: boolean, timeoutMs: number, allowLocalNetwork: boolean, startTime: number): Promise<ActorResult<SaglikEkutuphaneActorResult>>`
  - `parseSizeToBytes(sizeStr: string): number | undefined`

### `src/actors/corpus/sec-edgar-actor.ts`

**Sınıflar (Classes):**
- `class SecEdgarActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<SecEdgarActorResult>>`
  - `resolveCik(task: ActorTask, options: SecEdgarActorTaskOptions): string | undefined`
  - `formatCik(val: string | number): string`
  - `buildRequestUrl(task: ActorTask, cik: string): string`
  - `parseRecentFilings(cik: string, recent: RawRecentFilings): SecFilingItem[]`
  - `filterFilings(filings: SecFilingItem[], options: SecEdgarActorTaskOptions): SecFilingItem[]`
  - `synthesizeMarkdown(entityName: string, cik: string, sic: string, sicDescription: string, filings: SecFilingItem[], totalFilings): string`

### `src/actors/corpus/semantic-scholar-actor.ts`

**Sınıflar (Classes):**
- `class SemanticScholarActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<SemanticScholarActorResult>>`
  - `resolveAction(task: ActorTask, options: SemanticScholarActorTaskOptions): "paper" | "search" | "author" | "author_search" | "citations" | "references" | "pdf_ocr"`
  - `resolveApiBase(targetUrl: string): string`
  - `resolvePaperId(targetUrl: string, specifiedPaperId: string): string`
  - `getAuthHeaders(apiKey: string): Record<string, string>`
  - `normalizePaper(raw: RawS2Paper): SemanticScholarPaperItem`
  - `handlePaper(task: ActorTask, options: SemanticScholarActorTaskOptions, apiBase: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<SemanticScholarActorResult>>`
  - `handleSearch(task: ActorTask, options: SemanticScholarActorTaskOptions, apiBase: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<SemanticScholarActorResult>>`
  - `handleAuthor(task: ActorTask, options: SemanticScholarActorTaskOptions, apiBase: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<SemanticScholarActorResult>>`
  - `handleAuthorSearch(task: ActorTask, options: SemanticScholarActorTaskOptions, apiBase: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<SemanticScholarActorResult>>`
  - `handleCitationsOrReferences(task: ActorTask, options: SemanticScholarActorTaskOptions, action: "citations" | "references", apiBase: string, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<SemanticScholarActorResult>>`
  - `renderPaperMarkdown(paper: SemanticScholarPaperItem): string`
  - `renderSearchMarkdown(query: string, papers: SemanticScholarPaperItem[], totalResults: number): string`
  - `renderAuthorMarkdown(author: SemanticScholarAuthorItem): string`
  - `handlePdfOcr(task: ActorTask, options: SemanticScholarActorTaskOptions, startTime: number, timeoutMs: number, allowLocalNetwork: boolean): Promise<ActorResult<SemanticScholarActorResult>>`

### `src/actors/corpus/software-heritage-actor.ts`

**Sınıflar (Classes):**
- `class SoftwareHeritageActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<SoftwareHeritageActorResult>>`
  - `resolveActionAndUrl(task: ActorTask, options: SoftwareHeritageActorTaskOptions): {
    action: "content" | "directory" | "origin" | "revision";
    requestUrl: string;
    cleanId: string;
  } | null`
  - `synthesizeContentMarkdown(swhid: string, content: string, totalBytes: number, isTruncated: boolean): string`
  - `synthesizeDirectoryMarkdown(swhid: string, entries: SoftwareHeritageDirectoryEntry[]): string`
  - `synthesizeOriginMarkdown(visit: RawSwhOriginVisit): string`
  - `synthesizeRevisionMarkdown(swhid: string, rev: RawSwhRevision): string`

### `src/actors/corpus/stack-exchange-actor.ts`

**Sınıflar (Classes):**
- `class StackExchangeActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<StackExchangeActorResult>>`
  - `fetchAnswersForQuestions(questionIds: number[], site: string, apiKey: string | undefined, timeoutMs: number, allowLocalNetwork: boolean, baseApiUrl: string): Promise<Map<number, RawAnswer[]>>`
  - `buildSearchUrl(targetUrl: string | undefined, options: StackExchangeActorTaskOptions, site: string): string`

### `src/actors/corpus/stanford-phil-actor.ts`

**Sınıflar (Classes):**
- `class StanfordPhilActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<StanfordPhilActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: StanfordPhilActorTaskOptions): {
    action: "entry" | "search" | "contents";
    slug: string;
    query?: string;
    letter?: string;
    limit: number;
    includeBibliography: boolean;
    includeRelated: boolean;
  }`
  - `buildEndpointUrl(targetUrl: string | undefined, resolved: ReturnType<typeof this.resolveParameters>): string`
  - `parseResponse(action: "entry" | "search" | "contents", html: string, endpoint: string, slug: string): StanfordPhilActorResult`

### `src/actors/corpus/wikibooks-actor.ts`

**Sınıflar (Classes):**
- `class WikibooksActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikibooksActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikibooksActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `buildCanonicalWebUrl(lang: string, title: string): string`
  - `stripHtmlTags(html: string): string`
  - `renderMarkdownReport(items: WikibooksArticleItem[], lang: string, action: string): string`

### `src/actors/corpus/wikidata-actor.ts`

**Sınıflar (Classes):**
- `class WikidataActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikidataActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikidataActorTaskOptions): {
    action: "entity" | "search" | "sparql" | "claims";
    entityId?: string;
    query?: string;
    sparql?: string;
    lang: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, action: "entity" | "search" | "sparql" | "claims", entityId: string, query: string, sparql: string, lang, limit: number): string`
  - `renderEntityListMarkdown(items: WikidataEntityItem[], title: string, lang: string): string`
  - `renderSparqlMarkdown(sparqlData: { head: { vars: string[] }; results: { bindings: WikidataSparqlBinding[] } }, query: string): string`

### `src/actors/corpus/wikinews-actor.ts`

**Sınıflar (Classes):**
- `class WikinewsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikinewsActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikinewsActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `buildCanonicalWebUrl(lang: string, title: string): string`
  - `stripHtmlTags(html: string): string`
  - `renderMarkdownReport(items: WikinewsArticleItem[], lang: string, action: string): string`

### `src/actors/corpus/wikipedia-actor.ts`

**Sınıflar (Classes):**
- `class WikipediaActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikipediaActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikipediaActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `stripHtmlTags(input: string): string`
- `class WikimediaActor`

### `src/actors/corpus/wikiquote-actor.ts`

**Sınıflar (Classes):**
- `class WikiquoteActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikiquoteActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikiquoteActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `buildCanonicalWebUrl(lang: string, title: string): string`
  - `stripHtmlTags(html: string): string`
  - `renderMarkdownReport(items: WikiquoteArticleItem[], lang: string, action: string): string`

### `src/actors/corpus/wikisource-actor.ts`

**Sınıflar (Classes):**
- `class WikisourceActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikisourceActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikisourceActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `buildCanonicalWebUrl(lang: string, title: string): string`
  - `stripHtmlTags(html: string): string`
  - `renderMarkdownReport(items: WikisourceArticleItem[], lang: string, action: string): string`

### `src/actors/corpus/wikispecies-actor.ts`

**Sınıflar (Classes):**
- `class WikispeciesActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikispeciesActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikispeciesActorTaskOptions): {
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `buildCanonicalWebUrl(title: string): string`
  - `stripHtmlTags(html: string): string`
  - `renderMarkdownReport(items: WikispeciesTaxonItem[], action: string): string`

### `src/actors/corpus/wikiversity-actor.ts`

**Sınıflar (Classes):**
- `class WikiversityActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikiversityActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikiversityActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `buildCanonicalWebUrl(lang: string, title: string): string`
  - `stripHtmlTags(html: string): string`
  - `renderMarkdownReport(items: WikiversityArticleItem[], lang: string, action: string): string`

### `src/actors/corpus/wikivoyage-actor.ts`

**Sınıflar (Classes):**
- `class WikivoyageActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WikivoyageActorResult>>`
  - `resolveParameters(targetUrl: string | undefined, options: WikivoyageActorTaskOptions): {
    lang: string;
    title?: string;
    action: "summary" | "article" | "search";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string | undefined, lang: string, action: "summary" | "article" | "search", title: string, query: string, limit: number): string`
  - `buildCanonicalWebUrl(lang: string, title: string): string`
  - `stripHtmlTags(html: string): string`
  - `renderMarkdownReport(items: WikivoyageArticleItem[], lang: string, action: string): string`

### `src/actors/corpus/wiktionary-actor.ts`

**Sınıflar (Classes):**
- `class WiktionaryActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<WiktionaryActorResult>>`
  - `cleanDefinitionHtml(html: string): string`
  - `resolveParameters(targetUrl: string, options: WiktionaryActorTaskOptions): {
    lang: string;
    word: string;
    action: "definition" | "entry" | "search" | "random";
    query?: string;
  }`
  - `buildApiUrl(targetUrl: string, lang, action: "definition" | "entry" | "search" | "random", word, query: string, limit): string`

### `src/actors/corpus/yargitay-actor.ts`

**Sınıflar (Classes):**
- `class YargitayActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<YargitayActorResult>>`
  - `buildEndpointUrl(targetUrl: string, options: YargitayActorTaskOptions): string`
  - `parseResponse(rawText: string, queryUrl: string, options: YargitayActorTaskOptions): YargitayActorResult`
  - `parseJsonDecisions(rawItems: Record<string, unknown>[], queryUrl: string, courtName: string, options: YargitayActorTaskOptions): YargitayActorResult`
  - `parseHtmlDecisions(html: string, queryUrl: string, courtName: string, options: YargitayActorTaskOptions): YargitayActorResult`
  - `applyFilters(items: YargitayDecisionItem[], options: YargitayActorTaskOptions): YargitayDecisionItem[]`
  - `renderMarkdownSummary(courtName: string, decisions: YargitayDecisionItem[], queryUrl: string): string`

### `src/actors/corpus/youtube-transcripts-actor.ts`

**Sınıflar (Classes):**
- `class YoutubeTranscriptsActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<YoutubeTranscriptsActorResult>>`
  - `extractSingleVideo(videoId: string, watchUrl: string, options: YoutubeTranscriptsActorTaskOptions, outputFormat: YoutubeTranscriptOutputFormat, cleanText: boolean, preferredLang: string, timeoutMs: number, allowLocalNetwork: boolean): Promise<YoutubeTranscriptRecord>`
  - `extractViaBrowser(_videoId: string, watchUrl: string, timeoutMs: number, allowLocalNetwork: boolean, options: YoutubeTranscriptsActorTaskOptions): Promise<{ segments: YoutubeTranscriptSegment[]; rawXml?: string } | null>`
  - `parseTimedTextXml(xml: string): YoutubeTranscriptSegment[]`
  - `cleanSegmentText(text: string): string`
  - `extractVideoId(input: string): string | null`
  - `extractPlayerResponse(html: string): Record<string, unknown> | null`
  - `unescapeHtml(str: string): string`
  - `escapeXml(str: string): string`
  - `renderMarkdownSummary(records: YoutubeTranscriptRecord[], format: YoutubeTranscriptOutputFormat): string`

### `src/actors/documents/archive-extractor-actor.ts`

**Sınıflar (Classes):**
- `class ArchiveExtractorActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<ArchiveExtractorResult>>`

### `src/actors/documents/document-extractor-actor.ts`

**Sınıflar (Classes):**
- `class DocumentExtractorActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<DocumentExtractorResult>>`
  - `resolveFormat(url: string, buffer: Buffer, explicitFormat: SupportedDocumentFormat): SupportedDocumentFormat`

### `src/actors/documents/epub-extractor-actor.ts`

**Sınıflar (Classes):**
- `class EpubExtractorActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<EpubExtractorResult>>`

### `src/actors/documents/pdf-document-actor.ts`

**Sınıflar (Classes):**
- `class PdfDocumentActor`
  - `run(task: ActorTask, context: ActorRunContext): Promise<ActorResult<PdfDocumentResult>>`
  - `validatePdfMagicBytes(data: Uint8Array): boolean`

### `src/actors/web/api-extractor-actor.ts`

**Sınıflar (Classes):**
- `class ApiExtractorActor`
  - `getNestedValue(obj: unknown, path: string): unknown`
  - `applyProjection(data: unknown, keys: string[]): unknown`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ApiExtractorResult>>`
  - `executeRequest(url: string, method: string, options: ApiExtractorTaskOptions, timeoutMs: number): Promise<{ status: number; headers: Record<string, string>; data: unknown }>`

### `src/actors/web/cheerio-scraper-actor.ts`

**Sınıflar (Classes):**
- `class CheerioScraperActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ScrapedPageResult>>`

### `src/actors/web/crawler-actor.ts`

**Sınıflar (Classes):**
- `class CrawlerActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<CrawlerResult>>`

### `src/actors/web/markdown-reader-actor.ts`

**Sınıflar (Classes):**
- `class MarkdownReaderActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<MarkdownReaderResult>>`
  - `distillHtml(html: string, targetUrl: string, options: MarkdownReaderTaskOptions): MarkdownReaderResult`
  - `extractHeadings(markdown: string): MarkdownHeadingItem[]`
  - `renderToc(headings: MarkdownHeadingItem[]): string`
  - `generateFrontmatter(meta: Record<string, string | number | undefined>): string`

### `src/actors/web/network-interceptor-actor.ts`

**Sınıflar (Classes):**
- `class NetworkInterceptorActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<NetworkInterceptorResult>>`

### `src/actors/web/playwright-browser-actor.ts`

**Sınıflar (Classes):**
- `class PlaywrightBrowserActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<ScrapedPageResult>>`

### `src/actors/web/serp-search-actor.ts`

**Sınıflar (Classes):**
- `class SerpSearchActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<SerpSearchResult>>`
  - `parseSerpHtml(html: string, maxResults: number): SerpResultItem[]`

### `src/actors/web/sitemap-xml-actor.ts`

**Sınıflar (Classes):**
- `class SitemapXmlActor`
  - `run(task: ActorTask, _context: ActorRunContext): Promise<ActorResult<SitemapResult>>`
  - `fetchXml(url: string, signal: AbortSignal): Promise<string>`
  - `crawlSitemapRecursive(url: string, currentDepth: number, maxDepth: number, maxUrls: number, filterPatterns: string[] | undefined, aggregatedUrls: SitemapUrlEntry[], subSitemapsList: string[], signal: AbortSignal, setIndexFlag: (isIndex: boolean) => void): Promise<void>`

### `src/api/context-guard.ts`

**Sınıflar (Classes):**
- `class ContextGuard`
  - `stripInvisibleUnicode(text: string, options: { preserveZwnj?: boolean }): string`
  - `sanitizeInvisibleCharacters(text: string, options: { preserveZwnj?: boolean }): InvisibleCharacterSanitizeResult`
  - `estimateTokens(text: string): number`
  - `guardMarkdown(content: string, options: ContextGuardOptions): GuardedContentResult`
**Arayüzler (Interfaces):**
- `interface ContextGuardOptions` (4 üye)
- `interface GuardedContentResult` (6 üye)
- `interface InvisibleCharacterSanitizeResult` (3 üye)

### `src/api/openapi-spec.ts`

**Fonksiyonlar (Functions):**
- `renderDocsHtml(): string`

### `src/api/registry-database.ts`

**Sınıflar (Classes):**
- `class RegistryDatabase`
  - `initDatabase(): void`
  - `prepareStatements(): void`
  - `createRun(record: {
    runId: string;
    actorName: string;
    input: Record<string, unknown>;
    startedAt: string;
    metadata?: RunMetadata;
  }): void`
  - `startRun(runId: string): void`
  - `appendLog(runId: string, log: { timestamp: string; level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO"; message: string }): void`
  - `completeRun(runId: string, output: unknown, itemCount: number, finishedAt: string, durationMs: number, metadata: RunMetadata): void`
  - `failRun(runId: string, errorMessage: string, finishedAt: string, durationMs: number, metadata: RunMetadata): void`
  - `getRun(runId: string): RunRecord | undefined`
  - `listRuns(limit): RunRecord[]`
  - `mapRunRow(row: Record<string, unknown>, logs: Array<{
      timestamp: string;
      level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO";
      message: string;
    }>): RunRecord`
  - `recordPipelineExecution(result: PipelineRunResult): void`
  - `listPipelineExecutions(limit): PipelineRunResult[]`
  - `upsertScheduledJob(job: ScheduledJobInfo): void`
  - `updateScheduledJobRun(id: string, lastRunAt: string, runCount: number): void`
  - `updateScheduledJobFailure(id: string, lastRunAt: string, errorMessage: string): void`
  - `setScheduledJobRunning(id: string, running: boolean): void`
  - `mapJobRow(row: Record<string, unknown>): ScheduledJobInfo`
  - `listScheduledJobs(): ScheduledJobInfo[]`
  - `getScheduledJob(id: string): ScheduledJobInfo | undefined`
  - `deleteScheduledJob(id: string): boolean`
  - `recordDatasetShard(shard: DatasetShardRecord): void`
  - `listDatasetShards(datasetName: string, limit): DatasetShardRecord[]`
  - `getDatasetShard(shardId: string): DatasetShardRecord | undefined`
  - `deleteDatasetShard(shardId: string): boolean`
  - `upsertDataset(dataset: DatasetRecord): void`
  - `getDataset(datasetId: string): DatasetRecord | undefined`
  - `listDatasets(): DatasetRecord[]`
  - `deleteDataset(datasetId: string): boolean`
  - `recordDatasetSnapshot(snapshot: DatasetSnapshotRecord): void`
  - `listDatasetSnapshots(datasetName: string, limit): DatasetSnapshotRecord[]`
  - `getDatasetSnapshot(snapshotId: string): DatasetSnapshotRecord | undefined`
  - `getLatestDatasetSnapshot(datasetName: string): DatasetSnapshotRecord | undefined`
  - `deleteDatasetSnapshot(snapshotId: string): boolean`
  - `recordStorageReplica(replica: StorageReplicaRecord): void`
  - `listStorageReplicas(shardId: string): StorageReplicaRecord[]`
  - `recordVerificationAudit(audit: VerificationAuditRecord): void`
  - `listVerificationAudits(runId: string): VerificationAuditRecord[]`
  - `close(): void`
**Fonksiyonlar (Functions):**
- `getDefaultRegistryDatabase(): RegistryDatabase`
- `resetDefaultRegistryDatabase(): void`
**Arayüzler (Interfaces):**
- `interface DatasetShardRecord` (11 üye)
- `interface DatasetSnapshotRecord` (11 üye)
- `interface DatasetRecord` (7 üye)
- `interface StorageReplicaRecord` (9 üye)
- `interface VerificationAuditRecord` (14 üye)
- `interface RegistryDatabaseOptions` (2 üye)

### `src/api/routers/control-router.ts`

**Sınıflar (Classes):**
- `class ControlRouter`
  - `getLedger(): LedgerRepository`
  - `handleCreateJob(res: http.ServerResponse, body: CreateJobRequestBody): Promise<void>`
  - `handleGetJob(res: http.ServerResponse, jobId: string): Promise<void>`
  - `handleCreateSource(res: http.ServerResponse, body: CreateSourceRequestBody): Promise<void>`
  - `handleGetSource(res: http.ServerResponse, sourceId: string): Promise<void>`
  - `handleReapLeases(res: http.ServerResponse): Promise<void>`
**Arayüzler (Interfaces):**
- `interface CreateJobRequestBody` (5 üye)
- `interface CreateSourceRequestBody` (3 üye)

### `src/api/routers/dataset-router.ts`

**Sınıflar (Classes):**
- `class DatasetRouter`
  - `getPublisher(): DatasetPublisher`
  - `handlePublishDataset(res: http.ServerResponse, body: PublishDatasetOptions): Promise<void>`
  - `handleListDatasets(res: http.ServerResponse): void`
  - `handleGetDataset(res: http.ServerResponse, datasetName: string): void`
  - `handleListSnapshots(res: http.ServerResponse, datasetName: string): void`
  - `handleGetSnapshot(res: http.ServerResponse, _datasetName: string, snapshotId: string): void`
  - `handleGetLatestManifest(res: http.ServerResponse, datasetName: string): void`

### `src/api/routers/job-router.ts`

**Sınıflar (Classes):**
- `class JobRouter`
  - `restoreActiveJobs(): void`
  - `createExecutionHandler(pipeline: ScheduleJobRequestBody["pipeline"], actor: ScheduleJobRequestBody["actor"], explicitFilePath: string): () => Promise<void>`
  - `getBroker(): ScheduleBroker`
  - `handleScheduleJob(res: http.ServerResponse, body: ScheduleJobRequestBody): Promise<void>`
  - `handleListJobs(res: http.ServerResponse): void`
  - `handleGetJob(res: http.ServerResponse, jobId: string): void`
  - `handleCancelJob(res: http.ServerResponse, jobId: string): void`
**Arayüzler (Interfaces):**
- `interface ScheduleJobRequestBody` (6 üye)

### `src/api/routers/pipeline-router.ts`

**Sınıflar (Classes):**
- `class PipelineRouter`
  - `getRunner(): PipelineRunner`
  - `handleRunPipeline(res: http.ServerResponse, body: PipelineRunRequestBody): Promise<void>`
  - `handleListRuns(req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleGetRun(res: http.ServerResponse, runId: string): void`
  - `handleListTemplates(res: http.ServerResponse): void`
**Arayüzler (Interfaces):**
- `interface PipelineRunRequestBody` (4 üye)

### `src/api/routers/store-router.ts`

**Sınıflar (Classes):**
- `class StoreRouter`
  - `handleListActors(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleGetActor(res: http.ServerResponse, name: string): void`
  - `handleRunActor(res: http.ServerResponse, name: string, body: Record<string, unknown>): Promise<void>`
  - `handleListRuns(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleGetRun(res: http.ServerResponse, runId: string): void`
  - `handleRunEventsSSE(res: http.ServerResponse, runId: string): void`
  - `handleGetQuarantine(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleGetMcpCatalog(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleServiceInfo(_req: http.IncomingMessage, res: http.ServerResponse): void`
  - `handleServeWeb(req: http.IncomingMessage, res: http.ServerResponse): void`

### `src/api/routers/vault-router.ts`

**Sınıflar (Classes):**
- `class VaultRouter`
  - `getExporter(): ColdVaultExporter`
  - `validateVolumePath(pathInput: string): {
    valid: boolean;
    resolvedPath: string;
    error?: string;
  }`
  - `handleExport(res: http.ServerResponse, body: ColdVaultExportOptions): Promise<void>`
  - `handleVerify(res: http.ServerResponse, body: { volumeRoot: string }): Promise<void>`
  - `handleInspect(res: http.ServerResponse, volumeRoot: string): void`

### `src/api/run-logger.ts`

**Fonksiyonlar (Functions):**
- `writeRunLog(run: RunRecord, baseDir): { logPath: string; indexEntry: LogIndexEntry }`
**Arayüzler (Interfaces):**
- `interface LogIndexEntry` (11 üye)

### `src/api/run-registry.ts`

**Sınıflar (Classes):**
- `class RunRegistry`
  - `createRun(actorName: string, input: Record<string, unknown>, metadata: Partial<RunMetadata>): RunRecord`
  - `getRun(runId: string): RunRecord | undefined`
  - `listRuns(limit): RunRecord[]`
  - `startRun(runId: string): void`
  - `appendLog(runId: string, level: "INFO" | "WARN" | "ERROR" | "PASS" | "VETO", message: string): void`
  - `completeRun(runId: string, output: unknown, itemCount, metadataUpdate: Partial<RunMetadata>): void`
  - `failRun(runId: string, errorMessage: string, metadataUpdate: Partial<RunMetadata>): void`
**Arayüzler (Interfaces):**
- `interface RunMetadata` (10 üye)
- `interface RunRecord` (12 üye)
- `interface RunRegistryOptions` (1 üye)
**Tipler (Types):**
- `type RunStatus`

### `src/api/server.ts`

**Fonksiyonlar (Functions):**
- `createServer(): http.Server`

### `src/api/types.ts`

**Arayüzler (Interfaces):**
- `interface ExtractedTable` (5 üye)
- `interface ScrapedPageResult` (16 üye)
- `interface ApiPaginationConfig` (7 üye)
- `interface ApiExtractorTaskOptions` (9 üye)
- `interface ApiExtractorResult` (5 üye)
- `interface CrawledPageData` (6 üye)
- `interface CrawlerTaskOptions` (15 üye)
- `interface CrawlerResult` (4 üye)
- `interface SitemapUrlEntry` (4 üye)
- `interface SitemapTaskOptions` (5 üye)
- `interface SitemapResult` (5 üye)
- `interface MarkdownHeadingItem` (3 üye)
- `interface MarkdownReaderTaskOptions` (8 üye)
- `interface MarkdownReaderResult` (16 üye)
- `interface InterceptedApiResponse` (7 üye)
- `interface NetworkInterceptorTaskOptions` (5 üye)
- `interface NetworkInterceptorResult` (3 üye)
- `interface SerpResultItem` (5 üye)
- `interface SerpSearchTaskOptions` (4 üye)
- `interface SerpSearchResult` (3 üye)
- `interface PdfDocumentMetadata` (6 üye)
- `interface PdfPageEntry` (4 üye)
- `interface PdfDocumentAnomalyInfo` (6 üye)
- `interface PdfDocumentTaskOptions` (7 üye)
- `interface PdfDocumentResult` (12 üye)
- `interface DocumentExtractorTaskOptions` (5 üye)
- `interface DocumentSpreadsheetSheet` (5 üye)
- `interface DocumentExtractorResult` (9 üye)
- `interface ArchiveEntryResult` (6 üye)
- `interface ArchiveExtractorTaskOptions` (8 üye)
- `interface ArchiveExtractorResult` (6 üye)
- `interface PublicationIssueMetadata` (11 üye)
- `interface TableOfContentsItem` (6 üye)
- `interface EpubChapterItem` (6 üye)
- `interface EpubExtractorTaskOptions` (4 üye)
- `interface EpubExtractorResult` (8 üye)
- `interface MultiColumnLayoutOptions` (3 üye)
- `interface DergiParkActorTaskOptions` (7 üye)
- `interface DergiParkArticle` (12 üye)
- `interface DergiParkActorResult` (6 üye)
- `interface InternetArchiveActorTaskOptions` (10 üye)
- `interface InternetArchiveFile` (4 üye)
- `interface InternetArchiveItem` (12 üye)
- `interface InternetArchiveActorResult` (5 üye)
- `interface ArxivAuthor` (2 üye)
- `interface ArxivPaperItem` (16 üye)
- `interface ArxivActorTaskOptions` (8 üye)
- `interface ArxivActorResult` (5 üye)
- `interface WikimediaArticleItem` (9 üye)
- `interface WikimediaActorTaskOptions` (8 üye)
- `interface WikimediaActorResult` (4 üye)
- `interface WikisourceArticleItem` (9 üye)
- `interface WikisourceActorTaskOptions` (8 üye)
- `interface WikisourceActorResult` (5 üye)
- `interface WiktionarySenseItem` (3 üye)
- `interface WiktionaryPartOfSpeechItem` (3 üye)
- `interface WiktionaryEntryItem` (12 üye)
- `interface WiktionaryActorTaskOptions` (8 üye)
- `interface WiktionaryActorResult` (5 üye)
- `interface WikiquoteArticleItem` (9 üye)
- `interface WikiquoteActorTaskOptions` (8 üye)
- `interface WikiquoteActorResult` (5 üye)
- `interface WikibooksArticleItem` (9 üye)
- `interface WikibooksActorTaskOptions` (8 üye)
- `interface WikibooksActorResult` (5 üye)
- `interface WikiversityArticleItem` (9 üye)
- `interface WikiversityActorTaskOptions` (8 üye)
- `interface WikiversityActorResult` (5 üye)
- `interface WikivoyageArticleItem` (9 üye)
- `interface WikivoyageActorTaskOptions` (8 üye)
- `interface WikivoyageActorResult` (5 üye)
- `interface WikinewsArticleItem` (9 üye)
- `interface WikinewsActorTaskOptions` (8 üye)
- `interface WikinewsActorResult` (5 üye)
- `interface WikispeciesTaxonItem` (8 üye)
- `interface WikispeciesActorTaskOptions` (8 üye)
- `interface WikispeciesActorResult` (4 üye)
- `interface WikidataEntityItem` (9 üye)
- `interface WikidataSparqlBinding` (1 üye)
- `interface WikidataActorTaskOptions` (9 üye)
- `interface WikidataActorResult` (5 üye)
- `interface StanfordPhilTableOfContentsItem` (3 üye)
- `interface StanfordPhilSection` (3 üye)
- `interface StanfordPhilSearchResultItem` (4 üye)
- `interface StanfordPhilEntry` (12 üye)
- `interface StanfordPhilActorTaskOptions` (8 üye)
- `interface StanfordPhilActorResult` (7 üye)
- `interface InternetPhilSection` (3 üye)
- `interface InternetPhilSearchResultItem` (4 üye)
- `interface InternetPhilEntry` (8 üye)
- `interface InternetPhilActorTaskOptions` (5 üye)
- `interface InternetPhilActorResult` (6 üye)
- `interface MetamathHypothesis` (3 üye)
- `interface MetamathProofStep` (4 üye)
- `interface MetamathTheorem` (9 üye)
- `interface MetamathSearchResultItem` (5 üye)
- `interface MetamathActorTaskOptions` (8 üye)
- `interface MetamathActorResult` (6 üye)
- `interface PhilPapersRecord` (15 üye)
- `interface PhilPapersSearchResultItem` (7 üye)
- `interface PhilPapersCategoryDetails` (6 üye)
- `interface PhilPapersActorTaskOptions` (9 üye)
- `interface PhilPapersActorResult` (7 üye)
- `interface DevDocMeta` (10 üye)
- `interface DevDocEntry` (3 üye)
- `interface DevDocsActorTaskOptions` (7 üye)
- `interface DevDocsActorResult` (9 üye)
- `interface RosettaCodeImplementation` (4 üye)
- `interface RosettaCodeSearchResultItem` (4 üye)
- `interface RosettaCodeTaskDetails` (8 üye)
- `interface RosettaCodeActorTaskOptions` (6 üye)
- `interface RosettaCodeActorResult` (7 üye)
- `interface PapersWithCodeRepo` (5 üye)
- `interface PapersWithCodePaperRecord` (15 üye)
- `interface PapersWithCodeSearchResultItem` (8 üye)
- `interface PapersWithCodeActorTaskOptions` (6 üye)
- `interface PapersWithCodeActorResult` (7 üye)
- `interface LibreTextsPageItem` (10 üye)
- `interface LibreTextsActorTaskOptions` (8 üye)
- `interface LibreTextsActorResult` (8 üye)
- `interface OpenTextbookReview` (5 üye)
- `interface OpenTextbookItem` (15 üye)
- `interface OpenTextbookSubject` (4 üye)
- `interface OpenTextbookActorTaskOptions` (6 üye)
- `interface OpenTextbookActorResult` (7 üye)
- `interface SemanticScholarPaperItem` (16 üye)
- `interface SemanticScholarAuthorItem` (9 üye)
- `interface SemanticScholarActorTaskOptions` (13 üye)
- `interface SemanticScholarPdfExtractionResult` (9 üye)
- `interface SemanticScholarActorResult` (11 üye)
- `interface AnayasaMahkemesiDecisionItem` (15 üye)
- `interface AnayasaMahkemesiDecisionDetail` (6 üye)
- `interface AnayasaMahkemesiActorTaskOptions` (15 üye)
- `interface AnayasaMahkemesiActorResult` (7 üye)
- `interface DanistayDecisionItem` (10 üye)
- `interface DanistayDecisionDetail` (10 üye)
- `interface DanistayActorTaskOptions` (12 üye)
- `interface DanistayActorResult` (7 üye)
- `interface GooglePatentClaimItem` (5 üye)
- `interface GooglePatentItem` (18 üye)
- `interface GooglePatentsActorTaskOptions` (11 üye)
- `interface GooglePatentsActorResult` (7 üye)
- `interface PerseusMorphAnalysis` (6 üye)
- `interface PerseusTextPassage` (10 üye)
- `interface PerseusSearchResultItem` (6 üye)
- `interface PerseusDlActorTaskOptions` (8 üye)
- `interface PerseusDlActorResult` (7 üye)
- `interface SacredTextsBookItem` (7 üye)
- `interface SacredTextsFootnote` (3 üye)
- `interface SacredTextsPassage` (10 üye)
- `interface SacredTextsActorTaskOptions` (6 üye)
- `interface SacredTextsActorResult` (6 üye)
- `interface InstagramMediaChild` (5 üye)
- `interface InstagramCommentRecord` (7 üye)
- `interface InstagramMediaRecord` (18 üye)
- `interface InstagramProfileRecord` (12 üye)
- `interface InstagramHashtagRecord` (4 üye)
- `interface InstagramActorTaskOptions` (16 üye)
- `interface InstagramActorResult` (8 üye)
- `interface OpenAlexWorkItem` (12 üye)
- `interface OpenAlexActorTaskOptions` (11 üye)
- `interface OpenAlexActorResult` (5 üye)
- `interface StackExchangeAnswerItem` (6 üye)
- `interface StackExchangeQuestionItem` (10 üye)
- `interface StackExchangeActorTaskOptions` (11 üye)
- `interface StackExchangeActorResult` (5 üye)
- `interface GutenbergBookItem` (8 üye)
- `interface GutenbergActorTaskOptions` (7 üye)
- `interface GutenbergActorResult` (3 üye)
- `interface EuropePmcArticleItem` (13 üye)
- `interface EuropePmcActorTaskOptions` (6 üye)
- `interface EuropePmcActorResult` (4 üye)
- `interface PubmedArticleItem` (13 üye)
- `interface PubmedActorTaskOptions` (7 üye)
- `interface PubmedActorResult` (5 üye)
- `interface BiorxivArticleItem` (15 üye)
- `interface BiorxivActorTaskOptions` (8 üye)
- `interface BiorxivActorResult` (6 üye)
- `interface DoajArticleItem` (17 üye)
- `interface DoajActorTaskOptions` (7 üye)
- `interface DoajActorResult` (7 üye)
- `interface ApertaFileItem` (5 üye)
- `interface ApertaRecordItem` (18 üye)
- `interface ApertaActorTaskOptions` (7 üye)
- `interface ApertaActorResult` (7 üye)
- `interface BinanceVisionFileItem` (5 üye)
- `interface BinanceVisionKlineItem` (14 üye)
- `interface BinanceVisionActorTaskOptions` (10 üye)
- `interface BinanceVisionActorResult` (12 üye)
- `interface IetfRfcItem` (10 üye)
- `interface IetfRfcActorTaskOptions` (7 üye)
- `interface IetfRfcActorResult` (3 üye)
- `interface SaglikEkutuphaneItem` (12 üye)
- `interface SaglikEkutuphaneTaskOptions` (7 üye)
- `interface SaglikEkutuphaneActorResult` (6 üye)
- `interface KtbEkitapItem` (12 üye)
- `interface KtbEkitapTaskOptions` (8 üye)
- `interface KtbEkitapActorResult` (6 üye)
- `interface ClinicalStudySummary` (14 üye)
- `interface ClinicalTrialsActorTaskOptions` (9 üye)
- `interface ClinicalTrialsActorResult` (5 üye)
- `interface OpenFdaActorTaskOptions` (6 üye)
- `interface OpenFdaActorResult` (5 üye)
- `interface SecFilingItem` (15 üye)
- `interface SecEdgarActorTaskOptions` (7 üye)
- `interface SecEdgarActorResult` (10 üye)
- `interface CourtListenerDocumentItem` (11 üye)
- `interface CourtListenerActorTaskOptions` (11 üye)
- `interface CourtListenerActorResult` (5 üye)
- `interface SoftwareHeritageDirectoryEntry` (5 üye)
- `interface SoftwareHeritageActorTaskOptions` (6 üye)
- `interface SoftwareHeritageActorResult` (5 üye)
- `interface EurLexDocumentItem` (8 üye)
- `interface EurLexActorTaskOptions` (7 üye)
- `interface EurLexActorResult` (6 üye)
- `interface OpenStaxBookItem` (10 üye)
- `interface OpenStaxActorTaskOptions` (7 üye)
- `interface OpenStaxActorResult` (7 üye)
- `interface MitOcwCourseItem` (12 üye)
- `interface MitOcwActorTaskOptions` (7 üye)
- `interface MitOcwActorResult` (8 üye)
- `interface ResmiGazeteItem` (10 üye)
- `interface ResmiGazeteActorTaskOptions` (9 üye)
- `interface ResmiGazeteActorResult` (7 üye)
- `interface YargitayDecisionItem` (12 üye)
- `interface YargitayActorTaskOptions` (11 üye)
- `interface YargitayActorResult` (5 üye)
- `interface KapDisclosureItem` (11 üye)
- `interface KapActorTaskOptions` (9 üye)
- `interface KapActorResult` (5 üye)
- `interface GithubActorTaskOptions` (8 üye)
- `interface GithubActorResult` (6 üye)
- `interface OpenReviewNoteItem` (16 üye)
- `interface OpenReviewActorTaskOptions` (8 üye)
- `interface OpenReviewActorResult` (7 üye)
- `interface HackerNewsCommentItem` (6 üye)
- `interface HackerNewsStoryItem` (9 üye)
- `interface HackerNewsActorTaskOptions` (7 üye)
- `interface HackerNewsActorResult` (5 üye)
- `interface HuggingFaceDatasetsFeatureItem` (3 üye)
- `interface HuggingFaceDatasetsSplitItem` (4 üye)
- `interface HuggingFaceDatasetsActorTaskOptions` (9 üye)
- `interface HuggingFaceDatasetsActorResult` (13 üye)
- `interface MathReasoningItem` (9 üye)
- `interface MathReasoningActorTaskOptions` (8 üye)
- `interface MathReasoningActorResult` (5 üye)
- `interface CodeEvalItem` (8 üye)
- `interface CodeEvalActorTaskOptions` (7 üye)
- `interface CodeEvalActorResult` (8 üye)
- `interface ProofWikiItem` (9 üye)
- `interface ProofWikiActorTaskOptions` (7 üye)
- `interface ProofWikiActorResult` (5 üye)
- `interface LeanMathlibItem` (10 üye)
- `interface LeanMathlibActorTaskOptions` (9 üye)
- `interface LeanMathlibActorResult` (6 üye)
- `interface LessWrongComment` (7 üye)
- `interface LessWrongPost` (11 üye)
- `interface LessWrongActorTaskOptions` (12 üye)
- `interface LessWrongActorResult` (7 üye)
- `interface YoutubeTranscriptSegment` (3 üye)
- `interface YoutubeTranscriptRecord` (18 üye)
- `interface YoutubeTranscriptsActorTaskOptions` (22 üye)
- `interface YoutubeTranscriptsActorResult` (6 üye)
- `interface ActorTask` (5 üye)
- `interface ActorResult` (7 üye)
- `interface ActorRunContext` (3 üye)
- `interface IActor` (3 üye)
- `interface SelfHealingError` (6 üye)
- `interface SelfHealingErrorResponse` (7 üye)
**Tipler (Types):**
- `type EntityId`
- `type ActorType`
- `type PdfAnomalyStatus`
- `type SupportedDocumentFormat`
- `type ArchiveFormat`
- `type DergiParkAction`
- `type InternetArchiveAction`
- `type WikipediaArticleItem`
- `type WikipediaActorTaskOptions`
- `type WikipediaActorResult`
- `type AnayasaMahkemesiAction`
- `type AnayasaMahkemesiCategory`
- `type DanistayAction`
- `type GooglePatentsAction`
- `type PerseusDlAction`
- `type SacredTextsAction`
- `type InstagramAction`
- `type InstagramMediaType`
- `type SaglikEkutuphaneCategory`
- `type SaglikEkutuphaneAction`
- `type KtbEkitapCategory`
- `type KtbEkitapAction`
- `type YoutubeTranscriptOutputFormat`

### `src/browser/browser-pool.ts`

**Sınıflar (Classes):**
- `class BrowserPool`
  - `resolveExecutablePath(): string | undefined`
  - `getBrowser(): Promise<Browser>`
  - `scheduleIdleShutdown(): void`
  - `acquireSession(options: AcquireContextOptions): Promise<PooledBrowserSession>`
  - `getActiveContexts(): number`
  - `shutdown(): Promise<void>`
**Arayüzler (Interfaces):**
- `interface BrowserPoolOptions` (2 üye)
- `interface AcquireContextOptions` (7 üye)
- `interface PooledBrowserSession` (3 üye)

### `src/browser/browser-session-manager.ts`

**Sınıflar (Classes):**
- `class BrowserSessionManager`
  - `onSessionClosed(fn: (sessionId: string) => void): void`
  - `getOrCreateSession(sessionId: string, options: AcquireContextOptions): Promise<BrowserSessionState>`
  - `touchSession(session: BrowserSessionState): void`
  - `getActivePage(sessionId: string, options: AcquireContextOptions): Promise<Page>`
  - `createTab(sessionId: string, url: string): Promise<{ tabId: string; page: Page }>`
  - `switchTab(sessionId: string, tabId: string): Promise<Page>`
  - `closeTab(sessionId: string, tabId: string): Promise<{ remainingTabs: string[]; activeTabId: string }>`
  - `listTabs(sessionId: string): Promise<BrowserTabInfo[]>`
  - `closeSession(sessionId: string): Promise<void>`
  - `shutdownAll(): Promise<void>`
**Arayüzler (Interfaces):**
- `interface BrowserTabInfo` (4 üye)
- `interface BrowserSessionState` (8 üye)

### `src/browser/dom-indexer.ts`

**Sınıflar (Classes):**
- `class DOMIndexer`
  - `indexPage(page: Page): Promise<DOMIndexResult>`
  - `injectBadges(page: Page, elements: IndexedElement[]): Promise<void>`
  - `removeBadges(page: Page): Promise<void>`
**Arayüzler (Interfaces):**
- `interface IndexedElement` (13 üye)
- `interface DOMIndexResult` (3 üye)

### `src/browser/interactive-browser-controller.ts`

**Sınıflar (Classes):**
- `class InteractiveBrowserController`
  - `cleanupSession(sessionId: string): void`
  - `attachListeners(sessionId: string, page: Page): void`
  - `navigate(sessionId: string, url: string, options: { captureScreenshot?: boolean; timeoutMs?: number }): Promise<BrowserActionResult>`
  - `click(sessionId: string, target: BrowserActionTarget, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `type(sessionId: string, target: BrowserActionTarget, text: string, options: TypeActionOptions & { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `pressKey(sessionId: string, key: string, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `scroll(sessionId: string, direction: "up" | "down" | "top" | "bottom", amount, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `selectOption(sessionId: string, target: BrowserActionTarget, value: string, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `hover(sessionId: string, target: BrowserActionTarget, options: { captureScreenshot?: boolean }): Promise<BrowserActionResult>`
  - `extractContent(sessionId: string, selector: string, format: "text" | "markdown" | "html"): Promise<BrowserActionResult>`
  - `captureScreenshot(sessionId: string, withBadges): Promise<{ base64: string; elements: IndexedElement[]; manifest: string }>`
  - `evaluate(sessionId: string, script: string): Promise<BrowserActionResult>`
  - `createTab(sessionId: string, url: string): Promise<BrowserActionResult>`
  - `switchTab(sessionId: string, tabId: string): Promise<BrowserActionResult>`
  - `closeTab(sessionId: string, tabId: string): Promise<BrowserActionResult>`
  - `screenshot(sessionId: string, _withBadges): Promise<BrowserActionResult>`
  - `executeAction(sessionId: string, action: string, params: BrowserActionParams): Promise<BrowserActionResult>`
  - `closeSession(sessionId: string): Promise<void>`
  - `buildActionResult(sessionId: string, page: Page, action: string, captureScreenshot: boolean): Promise<BrowserActionResult>`
**Arayüzler (Interfaces):**
- `interface BrowserActionTarget` (4 üye)
- `interface BrowserActionResult` (12 üye)
- `interface TypeActionOptions` (3 üye)
- `interface BrowserActionParams` (20 üye)

### `src/browser/session-vault.ts`

**Sınıflar (Classes):**
- `class SessionVault`
  - `saveState(context: BrowserContext, filePath: string): Promise<StoredSessionState>`
  - `loadState(filePath: string): StoredSessionState | undefined`
  - `hasState(filePath: string): boolean`
**Arayüzler (Interfaces):**
- `interface StoredCookie` (8 üye)
- `interface StoredOriginStorage` (2 üye)
- `interface StoredSessionState` (2 üye)

### `src/browser/stealth-manager.ts`

**Sınıflar (Classes):**
- `class StealthManager`
  - `getRandomProfile(): StealthProfile`
  - `getInitScript(): () => void`
  - `simulateHumanInteraction(page: {
    evaluate: (fn: () => void) => Promise<unknown>;
    waitForTimeout?: (ms: number) => Promise<void>;
  }): Promise<void>`
**Arayüzler (Interfaces):**
- `interface StealthProfile` (3 üye)

### `src/dataset/dataset-publisher.ts`

**Sınıflar (Classes):**
- `class DatasetPublisher`
  - `publishSnapshot(options: PublishDatasetOptions): Promise<PublishDatasetResult>`
  - `getSnapshot(snapshotId: string): DatasetSnapshotRecord | undefined`
  - `getLatestSnapshot(datasetName: string): DatasetSnapshotRecord | undefined`
  - `listSnapshots(datasetName: string, limit): DatasetSnapshotRecord[]`
  - `getManifest(snapshotIdOrName: string): TrainingDatasetManifest | undefined`
  - `resolveShards(datasetName: string, options: PublishDatasetOptions): Promise<DatasetShardRecord[]>`
  - `verifyShardChecksumOnDisk(shard: DatasetShardRecord): void`
  - `computeSplits(shards: DatasetShardRecord[], options: PublishDatasetOptions): Record<string, SplitDefinition>`
  - `estimateTokens(totalRecords: number, totalSizeBytes: number, metadata: Record<string, unknown>): number`
  - `resolveSafeOutputDir(outputDir: string | undefined, datasetName: string, version: string): string`
  - `uploadManifestToRemote(connectorName: string, prefix: string, data: Buffer): Promise<{ backend: string; uri: string; bytesWritten: number }>`
**Arayüzler (Interfaces):**
- `interface DatasetPublisherOptions` (3 üye)

### `src/dataset/types.ts`

**Arayüzler (Interfaces):**
- `interface ShardManifestEntry` (7 üye)
- `interface SplitDefinition` (4 üye)
- `interface TrainingDatasetManifest` (12 üye)
- `interface SplitRatios` (3 üye)
- `interface PublishDatasetOptions` (15 üye)
- `interface PublishDatasetResult` (7 üye)

### `src/extractors/epub-extractor.ts`

**Sınıflar (Classes):**
- `class EpubExtractor`
  - `extract(buffer: Buffer, options: EpubExtractorTaskOptions): EpubExtractorResult`
  - `parseContainerXml(xml: string): string`
  - `extractMetadata($opf: cheerio.CheerioAPI): PublicationIssueMetadata`
  - `parseManifest($opf: cheerio.CheerioAPI, opfDir: string): Map<string, ManifestEntry>`
  - `parseSpine($opf: cheerio.CheerioAPI): string[]`
  - `extractTableOfContents($opf: cheerio.CheerioAPI, manifest: Map<string, ManifestEntry>, entriesMap: Map<string, Buffer>): TableOfContentsItem[]`
  - `parseEpub3Nav(html: string, navDir: string): TableOfContentsItem[]`
  - `parseEpub2Ncx(xml: string, ncxDir: string): TableOfContentsItem[]`
  - `resolveChapterTitle($chap: cheerio.CheerioAPI, resolvedPath: string, toc: TableOfContentsItem[], chapterIndex: number): string`
  - `createTurndownService(): TurndownService`

### `src/extractors/multi-column-layout-resolver.ts`

**Sınıflar (Classes):**
- `class MultiColumnLayoutResolver`
  - `resolvePages(pages: StructuredTextItem[][], options: MultiColumnLayoutOptions): string[]`
  - `detectColumnBoundaries(items: StructuredTextItem[], minGap: number, expectedColumns: number): number[]`
  - `reorderByColumns(items: StructuredTextItem[], boundaries: number[]): string`
  - `joinItems(items: StructuredTextItem[]): string`
- `class HeaderFooterStripper`
  - `stripFromItems(pages: StructuredTextItem[][]): StructuredTextItem[][]`
  - `stripFromText(pages: string[]): string[]`
  - `filterRecurring(candidates: Map<string, number>, total: number): Set<string>`

### `src/extractors/office-extractor.ts`

**Sınıflar (Classes):**
- `class OfficeExtractor`
  - `readZipEntries(buffer: Buffer): Map<string, Buffer>`
  - `extractDocx(buffer: Buffer): DocxExtractionResult`
  - `extractXlsx(buffer: Buffer): XlsxExtractionResult`
  - `extractTextFromP(pXml: string): string`
  - `parseDocxTable(tableXml: string): string`
  - `renderGridToMarkdown(headers: string[], dataRows: string[][]): string`
  - `extractXmlTagValue(xml: string, tagName: string): string | undefined`
  - `decodeXmlEntities(str: string): string`
**Arayüzler (Interfaces):**
- `interface ZipEntry` (5 üye)
- `interface DocxExtractionResult` (6 üye)
- `interface XlsxExtractionResult` (5 üye)

### `src/extractors/pdf-anomaly-detector.ts`

**Sınıflar (Classes):**
- `class PdfAnomalyDetector`
  - `detect(input: PdfAnalysisInput): PdfDocumentAnomalyInfo`
  - `hasPdfMagicBytes(data: Uint8Array): boolean`
  - `detectRasterImagePresence(data: Uint8Array): {
    hasImages: boolean;
    estimatedImageCount: number;
  }`
**Arayüzler (Interfaces):**
- `interface PdfAnalysisInput` (4 üye)

### `src/extractors/readability-extractor.ts`

**Sınıflar (Classes):**
- `class ReadabilityExtractor`
  - `extract(rawHtml: string, targetUrl: string, options: ReadabilityExtractOptions): ReadabilityExtractResult`
  - `fallbackExtract(html: string, turndown: TurndownService): ReadabilityExtractResult`
**Arayüzler (Interfaces):**
- `interface ReadabilityExtractOptions` (4 üye)
- `interface ReadabilityExtractResult` (9 üye)

### `src/extractors/robots-parser.ts`

**Sınıflar (Classes):**
- `class RobotsParser`
  - `parse(content: string): void`
  - `findMatchingGroup(userAgent: string): UserAgentGroup | undefined`
  - `matchPattern(pathname: string, pattern: string): boolean`
  - `isAllowed(urlOrPath: string, userAgent): boolean`
  - `getCrawlDelay(userAgent): number | undefined`
  - `fetchForOrigin(targetUrl: string, options: { timeoutMs?: number; allowLocalNetwork?: boolean }): Promise<RobotsParser>`
  - `clearCache(): void`
**Arayüzler (Interfaces):**
- `interface RobotsRule` (2 üye)
- `interface UserAgentGroup` (3 üye)

### `src/extractors/structured-extractor.ts`

**Sınıflar (Classes):**
- `class StructuredExtractor`
  - `extractTables(html: string): ExtractedTable[]`
  - `extractJsonLd(html: string): unknown[]`
  - `extractMetaTags(html: string): Record<string, string>`

### `src/extractors/tabular-extractor.ts`

**Sınıflar (Classes):**
- `class TabularExtractor`
  - `parse(content: string, options: TabularParseOptions): TabularParseResult`
  - `detectDelimiter(sample: string): string`
  - `tokenizeRfc4180(input: string, delimiter: string): string[][]`
  - `renderMarkdown(headers: string[], rows: string[][]): string`
**Arayüzler (Interfaces):**
- `interface TabularParseOptions` (3 üye)
- `interface TabularParseResult` (7 üye)

### `src/integrations/pipedream-connect.ts`

**Sınıflar (Classes):**
- `class PipedreamConnectService`
  - `isConfigured(): boolean`
  - `getConfigSummary(): {
    projectId: string;
    projectEnvironment: "production" | "development";
    isConfigured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
  }`
  - `getClient(): PipedreamClient`
  - `createConnectToken(options: CreateConnectTokenOptions): Promise<ConnectTokenResult>`
  - `validateConnectToken(token: string, appId: string): Promise<boolean>`
  - `listAccounts(externalUserId: string, app: string): Promise<unknown[]>`
  - `deleteAccount(accountId: string): Promise<void>`
  - `getDeveloperAccessToken(): Promise<string>`
  - `getMcpConfig(options: {
    appSlug: string;
    externalUserId: string;
    developerAccessToken?: string;
  }): PipedreamMcpConfig`
**Arayüzler (Interfaces):**
- `interface PipedreamConnectConfig` (5 üye)
- `interface CreateConnectTokenOptions` (4 üye)
- `interface ConnectTokenResult` (4 üye)
- `interface PipedreamMcpConfig` (7 üye)

### `src/mcp/auth-guard.ts`

**Fonksiyonlar (Functions):**
- `verifyMcpToken(req: IncomingMessage): boolean`

### `src/mcp/http-transport.ts`

**Sınıflar (Classes):**
- `class HttpMcpTransport`
  - `handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>`
  - `handleEvents(req: IncomingMessage, res: ServerResponse): void`
  - `readRequestBody(req: IncomingMessage): Promise<string>`
  - `isValidJsonRpcRequest(val: unknown): val is JsonRpcRequest`
  - `sendJsonRpc(res: ServerResponse, statusCode: number, payload: JsonRpcResponse): void`
**Arayüzler (Interfaces):**
- `interface HttpMcpTransportOptions` (1 üye)

### `src/mcp/protokol-mcp-server.ts`

**Sınıflar (Classes):**
- `class ProtokolMcpServer`
  - `getTools(): void`
  - `getScheduleBroker(): ScheduleBroker`
  - `processRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null>`
  - `start(input: NodeJS.ReadableStream, output: NodeJS.WritableStream): void`
  - `getQuarantineItems(): unknown[]`
  - `close(): void`
**Arayüzler (Interfaces):**
- `interface JsonRpcRequest` (4 üye)
- `interface JsonRpcResponse` (4 üye)

### `src/network/crawl-frontier.ts`

**Sınıflar (Classes):**
- `class CrawlFrontier`
  - `loadCheckpoint(): void`
  - `enqueue(url: string, depth: number): boolean`
  - `dequeue(): FrontierItem | undefined`
  - `hasMore(): boolean`
  - `size(): number`
  - `getVisitedCount(): number`
  - `getTotalCrawled(): number`
  - `isVisited(url: string): boolean`
  - `appendPage(page: CrawledPageData): void`
  - `saveCheckpoint(): void`
  - `readAllPages(): CrawledPageData[]`
  - `clear(): void`
**Arayüzler (Interfaces):**
- `interface FrontierItem` (2 üye)
- `interface FrontierCheckpoint` (4 üye)
- `interface CrawlFrontierOptions` (3 üye)

### `src/network/crawl-url-accumulator.ts`

**Sınıflar (Classes):**
- `class CrawlUrlAccumulator`
  - `addUrls(urls: string[], depth: number): void`
  - `next(): CrawlItem | undefined`
  - `hasMore(): boolean`
  - `getVisitedUrls(): string[]`
  - `getQueueSize(): number`
  - `getVisitedCount(): number`
**Arayüzler (Interfaces):**
- `interface CrawlAccumulatorConfig` (6 üye)
- `interface CrawlItem` (2 üye)

### `src/network/politeness-limiter.ts`

**Sınıflar (Classes):**
- `class PolitenessLimiter`
  - `setMinInterval(ms: number): void`
  - `extractHostname(rawUrl: string): string`
  - `pruneStaleDomains(now: number): void`
  - `computeJitter(baseDelay: number): number`
  - `waitForSlot(url: string): Promise<number>`
  - `recordRateLimit(url: string, retryAfterSeconds: number): void`
  - `recordSuccess(url: string): void`
  - `getBackoffMs(url: string): number`
  - `clear(): void`
**Arayüzler (Interfaces):**
- `interface PolitenessLimiterOptions` (3 üye)

### `src/network/proxy-manager.ts`

**Sınıflar (Classes):**
- `class ProxyManager`
  - `addProxy(proxyInput: string | ProxyConfig): ProxyConfig`
  - `addProxies(proxyList: Array<string | ProxyConfig>): void`
  - `getProxyKey(config: ProxyConfig): string`
  - `getHealthyProxies(): ProxyConfig[]`
  - `getProxy(options: {
    domain?: string;
    strategy?: ProxyRotationStrategy;
  }): ProxyConfig | undefined`
  - `recordFailure(proxy: ProxyConfig | string): void`
  - `recordSuccess(proxy: ProxyConfig | string): void`
  - `getDispatcher(proxy: ProxyConfig): ProxyAgent`
  - `size(): number`
  - `clear(): void`
**Arayüzler (Interfaces):**
- `interface ProxyConfig` (3 üye)
- `interface ProxyManagerOptions` (2 üye)
**Tipler (Types):**
- `type ProxyRotationStrategy`

### `src/network/retry-handler.ts`

**Fonksiyonlar (Functions):**
- `isRetryableError(error: unknown, retryableStatuses): boolean`
- `parseRetryAfter(headerValue: string | null | undefined): number | undefined`
- `withRetry(operation: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T>`
**Arayüzler (Interfaces):**
- `interface RetryOptions` (7 üye)

### `src/network/safe-redirect-fetcher.ts`

**Fonksiyonlar (Functions):**
- `safeRedirectFetch(initialUrl: string, options: SafeFetchOptions): Promise<Response>`
**Arayüzler (Interfaces):**
- `interface SafeFetchOptions` (5 üye)

### `src/network/ssrf-guard.ts`

**Sınıflar (Classes):**
- `class SSRFGuard`
  - `isPrivateIPv4(ip: string): boolean`
  - `parseIPv6Segments(ip: string): number[] | null`
  - `isPrivateIPv6(ip: string): boolean`
  - `isPrivateIp(ip: string): boolean`
  - `validateUrl(rawUrl: string, options: SSRFGuardOptions): SSRFValidationResult`
  - `validateUrlWithDns(rawUrl: string, options: SSRFGuardOptions): Promise<SSRFValidationResult>`
**Arayüzler (Interfaces):**
- `interface SSRFValidationResult` (4 üye)
- `interface SSRFGuardOptions` (1 üye)

### `src/network/url-normalizer.ts`

**Fonksiyonlar (Functions):**
- `normalizeUrl(rawUrl: string, options: SSRFGuardOptions): UrlNormalizationResult`
**Arayüzler (Interfaces):**
- `interface UrlNormalizationResult` (3 üye)

### `src/network/url-pattern-matcher.ts`

**Fonksiyonlar (Functions):**
- `isValidUrlPattern(pattern: string): boolean`
- `matchUrlPattern(url: string, pattern: string): boolean`

### `src/ocr/connectors/cloud-vision-connector.ts`

**Sınıflar (Classes):**
- `class CloudVisionOcrConnector`
  - `isAvailable(): Promise<boolean>`
  - `extract(request: OcrRequest): Promise<OcrResult>`
  - `resolveImageBase64(request: OcrRequest): string | undefined`
**Arayüzler (Interfaces):**
- `interface CloudVisionOptions` (3 üye)

### `src/ocr/connectors/generic-http-connector.ts`

**Sınıflar (Classes):**
- `class GenericHttpOcrConnector`
  - `isAvailable(): Promise<boolean>`
  - `extract(request: OcrRequest): Promise<OcrResult>`
  - `resolveImageBase64(request: OcrRequest): string | undefined`
  - `extractTextByPath(obj: Record<string, unknown>, pathStr: string): string`
**Arayüzler (Interfaces):**
- `interface GenericHttpOcrOptions` (5 üye)

### `src/ocr/connectors/local-llm-vision-connector.ts`

**Sınıflar (Classes):**
- `class LocalLlmVisionOcrConnector`
  - `isAvailable(): Promise<boolean>`
  - `extract(request: OcrRequest): Promise<OcrResult>`
  - `resolveImageBase64(request: OcrRequest): string | undefined`
  - `callOllamaApi(imageBase64: string, prompt: string): Promise<string>`
  - `callOpenAiCompatibleApi(imageBase64: string, prompt: string): Promise<string>`
**Arayüzler (Interfaces):**
- `interface LocalLlmVisionOptions` (4 üye)

### `src/ocr/connectors/local-tesseract-connector.ts`

**Sınıflar (Classes):**
- `class LocalTesseractOcrConnector`
  - `isAvailable(): Promise<boolean>`
  - `extract(request: OcrRequest): Promise<OcrResult>`
  - `resolveImageBuffer(request: OcrRequest): Buffer | undefined`
**Arayüzler (Interfaces):**
- `interface LocalTesseractOptions` (3 üye)

### `src/ocr/connectors/mistral-ocr-connector.ts`

**Sınıflar (Classes):**
- `class MistralOcrConnector`
  - `isAvailable(): Promise<boolean>`
  - `extract(request: OcrRequest): Promise<OcrResult>`
  - `resolveImageBase64(request: OcrRequest): string | undefined`
**Arayüzler (Interfaces):**
- `interface MistralOcrOptions` (4 üye)

### `src/ocr/connectors/unlimited-ocr-connector.ts`

**Sınıflar (Classes):**
- `class UnlimitedOcrConnector`
  - `isAvailable(): Promise<boolean>`
  - `extract(request: OcrRequest): Promise<OcrResult>`
  - `resolveImageBase64(request: OcrRequest): string | undefined`
**Arayüzler (Interfaces):**
- `interface UnlimitedOcrOptions` (4 üye)

### `src/ocr/ocr-connector-registry.ts`

**Sınıflar (Classes):**
- `class NoAvailableOcrConnectorError`
- `class OcrConnectorRegistry`
  - `registerDefaults(): void`
  - `register(connector: IOcrConnector): void`
  - `unregister(name: string): boolean`
  - `get(name: string): IOcrConnector | undefined`
  - `list(): string[]`
  - `getAvailable(): Promise<string[]>`
  - `executeOcr(request: OcrRequest, preferredConnector: string): Promise<OcrResult>`
  - `executeMultiPageOcr(pageImages: Buffer[], preferredConnector: string, options: Record<string, unknown>): Promise<OcrResult>`

### `src/ocr/pdf-rasterizer.ts`

**Sınıflar (Classes):**
- `class PdfRasterizer`
  - `getPdfJsSource(): string`
  - `toPureUint8Array(input: Buffer | Uint8Array): Uint8Array`
  - `extractEmbeddedImages(pdfBuffer: Buffer | Uint8Array, pageNumber): Promise<Buffer[]>`
  - `rasterizePage(pdfBuffer: Buffer | Uint8Array, pageNumber, scale, timeoutMs): Promise<Buffer>`
  - `rasterizeAllPages(pdfBuffer: Buffer | Uint8Array, options: PdfRasterizerOptions): Promise<Buffer[]>`
  - `rasterizePages(pdfBuffer: Buffer | Uint8Array, pageNumbers: number[], scale: number, timeoutMs: number): Promise<Buffer[]>`
**Arayüzler (Interfaces):**
- `interface PdfRasterizerOptions` (3 üye)

### `src/ocr/types.ts`

**Arayüzler (Interfaces):**
- `interface OcrRequest` (6 üye)
- `interface OcrPageResult` (4 üye)
- `interface OcrResult` (6 üye)
- `interface IOcrConnector` (3 üye)
**Tipler (Types):**
- `type OcrConnectorType`

### `src/pipeline/actor-resolver.ts`

**Sınıflar (Classes):**
- `class ActorResolver`
  - `resolve(actorId: string, inputConfig: Record<string, unknown>): ResolvedActor`
  - `has(actorId: string): boolean`
  - `listAvailableActors(): string[]`
**Arayüzler (Interfaces):**
- `interface ResolvedActor` (3 üye)

### `src/pipeline/connectors/connector-registry.ts`

**Sınıflar (Classes):**
- `class ConnectorRegistry`
  - `register(name: string, config: ConnectorConfig): void`
  - `has(name: string): boolean`
  - `get(name: string): ConnectorConfig | undefined`
  - `resolve(name: string, env: NodeJS.ProcessEnv): T`
  - `list(): Array<{ name: string; type: string }>`

### `src/pipeline/connectors/env-resolver.ts`

**Fonksiyonlar (Functions):**
- `resolveEnvString(value: string, env: NodeJS.ProcessEnv): string`
- `resolveConnectorConfig(rawConfig: T, env: NodeJS.ProcessEnv): T`

### `src/pipeline/execution/index.ts`

**Arayüzler (Interfaces):**
- `interface ExecutionResult` (6 üye)
- `interface ExecutionTarget` (2 üye)

### `src/pipeline/execution/local-executor.ts`

**Sınıflar (Classes):**
- `class LocalExecutor`
  - `run(actorId: string, config: Record<string, unknown>): Promise<ExecutionResult>`
  - `normalizeItems(rawOutput: unknown): unknown[]`
**Tipler (Types):**
- `type CustomActorRunner`

### `src/pipeline/execution/pipedream-executor.ts`

**Sınıflar (Classes):**
- `class PipedreamExecutor`
  - `run(actorId: string, config: Record<string, unknown>): Promise<ExecutionResult>`
**Arayüzler (Interfaces):**
- `interface PipedreamExecutorOptions` (3 üye)

### `src/pipeline/execution/remote-http-executor.ts`

**Sınıflar (Classes):**
- `class RemoteHttpExecutor`
  - `run(actorId: string, config: Record<string, unknown>): Promise<ExecutionResult>`
  - `extractItems(body: Record<string, unknown>): unknown[]`
**Arayüzler (Interfaces):**
- `interface RemoteHttpExecutorOptions` (3 üye)

### `src/pipeline/output-sink.ts`

**Sınıflar (Classes):**
- `class BufferedSink`
  - `write(newItems: unknown[]): void`
  - `close(): void`
  - `getItems(): unknown[]`
  - `getItemCount(): number`
  - `getByteLength(): number`
- `class StreamSink`
  - `write(newItems: unknown[]): void`
  - `close(): void`
  - `getItems(): unknown[]`
  - `getItemCount(): number`
  - `getByteLength(): number`
**Arayüzler (Interfaces):**
- `interface OutputSink` (5 üye)

### `src/pipeline/pipeline-runner.ts`

**Sınıflar (Classes):**
- `class PipelineRunner`
  - `registerExecutor(executor: ExecutionTarget): void`
  - `registerProcessor(processor: OutputProcessor): void`
  - `registerStorage(storage: StorageBackend): void`
  - `registerConnector(name: string, config: ConnectorConfig): void`
  - `scheduleConfig(config: PipelineConfig, checkIntervalMs: number): { stop: () => void }`
  - `getScheduleBroker(): ScheduleBroker`
  - `getRegistryDatabase(): RegistryDatabase | undefined`
  - `runFile(filePath: string, options: PipelineExecutionOptions): Promise<PipelineRunResult>`
  - `runYaml(yamlString: string, options: PipelineExecutionOptions): Promise<PipelineRunResult>`
  - `runConfig(config: PipelineConfig, options: PipelineExecutionOptions): Promise<PipelineRunResult>`
  - `getRunHistory(limit: number): PipelineRunResult[]`
  - `getRunById(runId: string): PipelineRunResult | undefined`
  - `getFailedRuns(): PipelineRunResult[]`
  - `resolveExecutor(config: PipelineConfig): ExecutionTarget`
  - `resolveStorageBackend(config: PipelineConfig): StorageBackend`
**Arayüzler (Interfaces):**
- `interface PipelineRunResult` (10 üye)
- `interface PipelineExecutionOptions` (1 üye)
- `interface PipelineRunnerOptions` (9 üye)

### `src/pipeline/processors/csv-writer.ts`

**Sınıflar (Classes):**
- `class CsvWriter`
  - `process(items: unknown[], baseName: string): Promise<ProcessedOutput>`
  - `escapeCsvValue(val: unknown): string`

### `src/pipeline/processors/dedup-filter.ts`

**Sınıflar (Classes):**
- `class DedupFilter`
  - `reset(): void`
  - `fnv1a64(str: string): bigint`
  - `computeSimHash(text: string): bigint`
  - `hammingDistance(a: bigint, b: bigint): number`
  - `extractFingerprints(item: Record<string, unknown>): {
    exactHash: string;
    text: string;
  }`
  - `evaluate(item: Record<string, unknown>, itemId): DedupResult`
  - `filterBatch(items: T[]): T[]`
**Arayüzler (Interfaces):**
- `interface DedupConfig` (5 üye)
- `interface DedupResult` (5 üye)

### `src/pipeline/processors/index.ts`

**Arayüzler (Interfaces):**
- `interface ProcessedOutput` (5 üye)
- `interface OutputProcessor` (2 üye)

### `src/pipeline/processors/jsonl-writer.ts`

**Sınıflar (Classes):**
- `class JsonlWriter`
  - `process(items: unknown[], baseName: string): Promise<ProcessedOutput>`

### `src/pipeline/processors/parquet-packer.ts`

**Sınıflar (Classes):**
- `class ParquetPacker`
  - `process(items: unknown[], baseName: string): Promise<ProcessedOutput>`

### `src/pipeline/processors/passthrough-writer.ts`

**Sınıflar (Classes):**
- `class PassthroughWriter`
  - `process(items: unknown[], baseName: string): Promise<ProcessedOutput>`

### `src/pipeline/processors/quality-filter.ts`

**Sınıflar (Classes):**
- `class QualityFilter`
  - `calculateMetrics(text: string): QualityMetrics`
  - `evaluate(text: string): QualityEvaluationResult`
  - `processItem(item: T): T | null`
  - `filterBatch(items: T[]): T[]`
**Arayüzler (Interfaces):**
- `interface QualityMetrics` (8 üye)
- `interface QualityGateConfig` (9 üye)
- `interface QualityEvaluationResult` (3 üye)

### `src/pipeline/processors/text-normalizer.ts`

**Sınıflar (Classes):**
- `class TextNormalizer`
  - `normalize(text: string): string`
  - `processItem(item: T): NormalizedItemResult<T>`
  - `processBatch(items: T[]): T[]`
**Arayüzler (Interfaces):**
- `interface NormalizerOptions` (6 üye)
- `interface NormalizedItemResult` (5 üye)

### `src/pipeline/schedule-broker.ts`

**Sınıflar (Classes):**
- `class ScheduleBroker`
  - `scheduleJob(id: string, cronExpression: string, handler: () => Promise<unknown> | unknown, checkIntervalMs, jobConfig: {
      pipelineConfig?: ScheduledJobInfo["pipelineConfig"];
      actorConfig?: ScheduledJobInfo["actorConfig"];
    }): { stop: () => void }`
  - `stopJob(id: string): boolean`
  - `stopAll(): void`
  - `hasJob(id: string): boolean`
  - `getActiveJobs(): ScheduledJobInfo[]`
**Fonksiyonlar (Functions):**
- `matchCronField(pattern: string, value: number, min: number, max: number): boolean`
- `isCronMatch(cronExpression: string, date: Date): boolean`
**Arayüzler (Interfaces):**
- `interface ScheduledJobInfo` (9 üye)
- `interface ScheduleBrokerOptions` (1 üye)

### `src/pipeline/schema.ts`

**Sınıflar (Classes):**
- `class PipelineError`
**Fonksiyonlar (Functions):**
- `parsePipelineYaml(yamlString: string): PipelineConfig`
- `loadPipelineConfigFile(filePath: string): PipelineConfig`
**Tipler (Types):**
- `type PipelineConfig`
- `type PipelineNormalizationConfig`
- `type PipelineQualityGateConfig`
- `type PipelineDedupConfig`
- `type ConnectorConfig`

### `src/pipeline/storage/b2-storage.ts`

**Sınıflar (Classes):**
- `class B2Storage`
**Arayüzler (Interfaces):**
- `interface B2StorageOptions` (0 üye)

### `src/pipeline/storage/google-drive-storage.ts`

**Sınıflar (Classes):**
- `class GoogleDriveStorage`
  - `upload(fileName: string, data: Buffer, prefix): Promise<StorageReceipt>`
  - `getFolderId(): string | undefined`
**Arayüzler (Interfaces):**
- `interface DriveClientLike` (1 üye)
- `interface GoogleDriveStorageOptions` (4 üye)

### `src/pipeline/storage/index.ts`

**Arayüzler (Interfaces):**
- `interface StorageReceipt` (5 üye)
- `interface StorageBackend` (2 üye)

### `src/pipeline/storage/local-storage.ts`

**Sınıflar (Classes):**
- `class LocalStorage`
  - `upload(fileName: string, data: Buffer, prefix): Promise<StorageReceipt>`
  - `getBaseDir(): string`

### `src/pipeline/storage/r2-storage.ts`

**Sınıflar (Classes):**
- `class R2Storage`
**Arayüzler (Interfaces):**
- `interface R2StorageOptions` (2 üye)

### `src/pipeline/storage/s3-storage.ts`

**Sınıflar (Classes):**
- `class S3Storage`
  - `upload(fileName: string, data: Buffer, prefix): Promise<StorageReceipt>`
  - `getBucket(): string`
**Fonksiyonlar (Functions):**
- `detectMimeType(fileName: string): string`
**Arayüzler (Interfaces):**
- `interface S3ClientLike` (1 üye)
- `interface S3StorageOptions` (5 üye)

### `src/storage/adapters/local-object-store.ts`

**Sınıflar (Classes):**
- `class LocalObjectStore`
  - `resolveKey(key: string): string`
  - `putStream(key: string, data: AsyncIterable<Uint8Array>): Promise<StorageRef>`
  - `openStream(ref: StorageRef, range: { start: number; endExclusive: number }): AsyncIterable<Uint8Array>`
  - `head(ref: StorageRef): Promise<StorageRef>`
  - `exists(key: string): Promise<boolean>`
  - `listPage(prefix: string, cursor: string): Promise<{ items: StorageRef[]; next: string | null }>`
  - `delete(ref: StorageRef): Promise<void>`
**Arayüzler (Interfaces):**
- `interface LocalObjectStoreOptions` (3 üye)

### `src/storage/adapters/r2-object-store.ts`

**Sınıflar (Classes):**
- `class R2ObjectStore`
  - `putStream(key: string, data: AsyncIterable<Uint8Array>): Promise<StorageRef>`
  - `openStream(ref: StorageRef, range: { start: number; endExclusive: number }): AsyncIterable<Uint8Array>`
  - `head(ref: StorageRef): Promise<StorageRef>`
  - `exists(key: string): Promise<boolean>`
  - `listPage(prefix: string, cursor: string): Promise<{ items: StorageRef[]; next: string | null }>`
  - `delete(ref: StorageRef): Promise<void>`
**Arayüzler (Interfaces):**
- `interface R2ObjectStoreOptions` (7 üye)

### `src/storage/instagram-database.ts`

**Sınıflar (Classes):**
- `class InstagramDatabase`
  - `initDatabase(): void`
  - `prepareStatements(): void`
  - `upsertProfile(profile: InstagramProfileRecord, rawJson: unknown): void`
  - `upsertPost(post: InstagramMediaRecord, ownerUsername: string, rawJson: unknown): void`
  - `upsertComment(comment: InstagramCommentRecord, postShortcode: string, parentCommentId: string, rawJson: unknown): void`
  - `upsertHashtag(hashtag: InstagramHashtagRecord): void`
  - `saveActorResult(result: InstagramActorResult): {
    profilesSaved: number;
    postsSaved: number;
    commentsSaved: number;
  }`
  - `recordHarvestRun(run: InstagramHarvestRunRecord): void`
  - `getProfile(username: string): InstagramProfileRecord | null`
  - `getProfileById(id: string): InstagramProfileRecord | null`
  - `listHarvestRuns(limit): InstagramHarvestRunRecord[]`
  - `listProfileSnapshots(profileId: string, limit): Array<{
    followerCount: number;
    followingCount: number;
    mediaCount: number;
    capturedAt: number;
  }>`
  - `getPost(shortcode: string): InstagramMediaRecord | null`
  - `listPosts(options: {
    ownerUsername?: string;
    limit?: number;
    offset?: number;
  }): InstagramMediaRecord[]`
  - `listComments(postShortcode: string, limit, offset): InstagramCommentRecord[]`
  - `getStats(): InstagramDatabaseStats`
  - `mapPostRow(row: Record<string, unknown>): InstagramMediaRecord`
  - `getExistingShortcodes(ownerUsername: string): Set<string>`
  - `updatePostLocalPath(shortcode: string, localPath: string): void`
  - `updateSlideLocalPath(id: string, localPath: string): void`
  - `getPendingMediaDownloads(username: string): {
    posts: Array<{
      id: string;
      shortcode: string;
      owner_username: string;
      media_type: string;
      display_url: string;
      video_url?: string;
      local_path?: string;
    }>;
    slides: Array<{
      id: string;
      post_shortcode: string;
      slide_order: number;
      media_type: string;
      display_url: string;
      video_url?: string;
      owner_username: string;
      local_path?: string;
    }>;
  }`
  - `close(): void`
**Arayüzler (Interfaces):**
- `interface InstagramDatabaseOptions` (2 üye)
- `interface InstagramHarvestRunRecord` (10 üye)
- `interface InstagramDatabaseStats` (7 üye)

### `src/storage/ledger/outbox-dispatcher.ts`

**Sınıflar (Classes):**
- `class OutboxDispatcher`
  - `subscribe(eventType: string, handler: OutboxEventHandler): void`
  - `dispatchOnce(): Promise<{ claimed: number; dispatched: number; failed: number }>`
**Arayüzler (Interfaces):**
- `interface OutboxDispatcherOptions` (4 üye)
**Tipler (Types):**
- `type OutboxEventHandler`

### `src/storage/ledger/sqlite-ledger-repository.ts`

**Sınıflar (Classes):**
- `class SqliteLedgerRepository`
  - `initSchema(): void`
  - `createSource(source: {
    id?: string;
    name: string;
    descriptor: Record<string, unknown>;
    enabled?: boolean;
  }): Promise<SourceRecord>`
  - `getSource(id: string): Promise<SourceRecord | null>`
  - `getOrCreatePartition(sourceId: string, partitionKey: string): Promise<CrawlPartition>`
  - `updatePartitionCursor(id: string, cursor: Record<string, unknown>, expectedRevision: number): Promise<boolean>`
  - `upsertDocument(doc: {
    sourceId: string;
    externalId: string;
    canonicalUrl?: string;
  }): Promise<DocumentRecord>`
  - `registerContentObject(obj: {
    sha256: string;
    sizeBytes: number;
    mimeType: string;
  }): Promise<ContentObjectRecord>`
  - `recordArtifact(artifact: {
    documentId?: string;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    providerId: string;
    container: string;
    objectKey: string;
    objectVersion?: string | null;
    transformVersion: string;
    metadata?: Record<string, unknown>;
    role?: string;
  }): Promise<ArtifactRecord>`
  - `createJob(job: {
    documentId?: string;
    operation: string;
    idempotencyKey: string;
    input: Record<string, unknown>;
    maxAttempts?: number;
  }): Promise<JobRecord>`
  - `getJob(jobId: string): Promise<JobRecord | null>`
  - `claimJob(owner: string, leaseSeconds: number, allowedOperations: string[]): Promise<JobRecord | null>`
  - `heartbeatJob(jobId: string, owner: string, leaseEpoch: number, leaseSeconds: number): Promise<boolean>`
  - `finalizeJob(jobId: string, owner: string, leaseEpoch: number, options: FinalizeJobOptions): Promise<boolean>`
  - `failJob(jobId: string, owner: string, leaseEpoch: number, errorCode: string, options: FailJobOptions): Promise<boolean>`
  - `claimOutboxEvents(owner: string, batchSize, leaseSeconds): Promise<OutboxEventRecord[]>`
  - `markOutboxPublished(eventId: string, owner: string, dispatchEpoch: number): Promise<boolean>`
  - `reapExpiredLeases(): Promise<{ expiredJobs: number; expiredOutbox: number }>`
  - `close(): void`
**Arayüzler (Interfaces):**
- `interface SqliteLedgerRepositoryOptions` (1 üye)

### `src/storage/object-vault.ts`

**Sınıflar (Classes):**
- `class ObjectVault`
  - `resolvePath(actor: string, targetId: string, category: MediaCategory, filename: string): {
    absolutePath: string;
    relativePath: string;
    directory: string;
  }`
  - `hasAsset(actor: string, targetId: string, category: MediaCategory, filename: string): boolean`
  - `saveBuffer(buffer: Buffer | Uint8Array, options: StoreObjectOptions): Promise<StoredObjectMetadata>`
  - `downloadAsset(url: string, options: StoreObjectOptions, customHeaders: Record<string, string>): Promise<StoredObjectMetadata>`
  - `appendManifestLedger(metadata: StoredObjectMetadata): Promise<void>`
**Arayüzler (Interfaces):**
- `interface ObjectVaultOptions` (1 üye)
- `interface StoredObjectMetadata` (11 üye)
- `interface StoreObjectOptions` (7 üye)
**Tipler (Types):**
- `type MediaCategory`

### `src/telemetry/anomalies.ts`

**Fonksiyonlar (Functions):**
- `recordAnomaly(anomaly: Omit<AnomalyEvent, "eventId" | "timestamp">, filePath): AnomalyEvent`
**Arayüzler (Interfaces):**
- `interface AnomalyEvent` (10 üye)
**Tipler (Types):**
- `type AnomalyCode`
- `type AnomalySeverity`

### `src/utils/terminal-theme.ts`

**Fonksiyonlar (Functions):**
- `badge(level: LogLevel | string, message: string): string`
- `banner(title: string, subtitle: string): string`
- `divider(char): string`
- `panel(title: string, entries: Array<[string, string]>): string`
- `table(headers: string[], rows: (string | number)[][]): string`
**Tipler (Types):**
- `type LogLevel`

### `src/vault/cold-vault-exporter.ts`

**Sınıflar (Classes):**
- `class ColdVaultExporter`
  - `computeSha256(filePath: string): string`
  - `initVolume(volumeRoot: string, volumeLabel: string, filesystem: "btrfs" | "ext4" | "other"): VolumeInfo`
  - `inspectVolume(volumeRoot: string): VolumeInfo | undefined`
  - `exportDataset(options: ColdVaultExportOptions): Promise<ColdVaultExportReceipt>`
  - `verifyVolume(volumeRoot: string): Promise<VolumeVerificationResult>`

### `src/vault/types.ts`

**Arayüzler (Interfaces):**
- `interface VolumeInfo` (8 üye)
- `interface ColdVaultExportOptions` (8 üye)
- `interface ExportedShardReceipt` (7 üye)
- `interface ColdVaultExportReceipt` (12 üye)
- `interface VolumeVerificationItem` (6 üye)
- `interface VolumeVerificationResult` (9 üye)

### `src/workers/handlers/dergipark-harvest-handler.ts`

**Fonksiyonlar (Functions):**
- `createDergiParkHarvestJobHandler(): JobHandler`
**Arayüzler (Interfaces):**
- `interface DergiParkHarvestJobInput` (11 üye)

### `src/workers/handlers/download-handler.ts`

**Fonksiyonlar (Functions):**
- `createDownloadJobHandler(): JobHandler`
**Arayüzler (Interfaces):**
- `interface DownloadJobInput` (7 üye)

### `src/workers/handlers/extract-handler.ts`

**Fonksiyonlar (Functions):**
- `createExtractJobHandler(): JobHandler`
**Arayüzler (Interfaces):**
- `interface ExtractJobInput` (7 üye)

### `src/workers/task-worker.ts`

**Sınıflar (Classes):**
- `class QuarantineError`
- `class TerminalJobError`
- `class TaskWorker`
  - `registerHandler(operation: string, handler: JobHandler): this`
  - `getHandler(operation: string): JobHandler | undefined`
  - `getActiveJob(): JobRecord | null`
  - `getActiveAbortSignal(): AbortSignal | null`
  - `getIsRunning(): boolean`
  - `start(): void`
  - `stop(): Promise<void>`
  - `scheduleNextPoll(delayMs: number): void`
  - `executeOnce(): Promise<boolean>`

### `src/workers/types.ts`

**Arayüzler (Interfaces):**
- `interface WorkerConfig` (8 üye)
- `interface WorkerPoolConfig` (3 üye)
- `interface WorkerStats` (6 üye)
- `interface TaskExecutionContext` (5 üye)
- `interface TaskExecutionResult` (3 üye)
**Tipler (Types):**
- `type JobHandler`

### `src/workers/worker-pool.ts`

**Sınıflar (Classes):**
- `class WorkerPool`
  - `registerHandler(operation: string, handler: JobHandler): this`
  - `start(): void`
  - `stop(): Promise<void>`
  - `drain(): Promise<void>`
  - `getStats(): WorkerStats`
  - `getWorkers(): readonly TaskWorker[]`

## Modül ve Dosya Envanteri

| Dosya Yolu |
|---|
| `contracts/index.ts` |
| `contracts/ledger.ts` |
| `contracts/storage.ts` |
| `scripts/checkpoint.mjs` |
| `scripts/consolidate-memory.mjs` |
| `scripts/doctor.mjs` |
| `scripts/download_instagram_media.ts` |
| `scripts/generate-connectome.mjs` |
| `scripts/harvest_instagram_profile.ts` |
| `scripts/logs.mjs` |
| `scripts/omega-mcp-server.mjs` |
| `scripts/omega-memory.mjs` |
| `scripts/pipedream-cli.mjs` |
| `scripts/pulse.mjs` |
| `scripts/register-source.ts` |
| `scripts/run-worker.ts` |
| `scripts/sca-check.mjs` |
| `scripts/scaffold-actor.mjs` |
| `scripts/telemetry-logger.mjs` |
| `scripts/terminal-theme.mjs` |
| `scripts/verify-pipeline.mjs` |
| `src/actors/actor-manifests.ts` |
| `src/actors/actor-registry.ts` |
| `src/actors/actor.template.ts` |
| `src/actors/corpus/anayasa-mahkemesi-actor.ts` |
| `src/actors/corpus/aperta-actor.ts` |
| `src/actors/corpus/arxiv-actor.ts` |
| `src/actors/corpus/binance-vision-actor.ts` |
| `src/actors/corpus/biorxiv-actor.ts` |
| `src/actors/corpus/clinical-trials-actor.ts` |
| `src/actors/corpus/code-eval-actor.ts` |
| `src/actors/corpus/court-listener-actor.ts` |
| `src/actors/corpus/danistay-actor.ts` |
| `src/actors/corpus/dergipark-actor.ts` |
| `src/actors/corpus/devdocs-actor.ts` |
| `src/actors/corpus/doaj-actor.ts` |
| `src/actors/corpus/domains/academic.ts` |
| `src/actors/corpus/domains/index.ts` |
| `src/actors/corpus/domains/legal.ts` |
| `src/actors/corpus/domains/philosophy-humanities.ts` |
| `src/actors/corpus/domains/reasoning-code.ts` |
| `src/actors/corpus/domains/wikimedia.ts` |
| `src/actors/corpus/eur-lex-actor.ts` |
| `src/actors/corpus/europe-pmc-actor.ts` |
| `src/actors/corpus/github-actor.ts` |
| `src/actors/corpus/google-patents-actor.ts` |
| `src/actors/corpus/gutenberg-actor.ts` |
| `src/actors/corpus/hacker-news-actor.ts` |
| `src/actors/corpus/huggingface-datasets-actor.ts` |
| `src/actors/corpus/ietf-rfc-actor.ts` |
| *... ve 291 dosya daha* |

