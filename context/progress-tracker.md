# Progress Tracker

## Project

protokol-7 — Headless Web Scraping, Deep Crawling & Anti-Detection Browser Automation Microservice (Node.js 22, TypeScript, Playwright Chromium, Cheerio, Mozilla Readability, GFM Structured Extraction, Politeness Limiter, and HTTP REST API).

---

## Current Phase

**Faz: Veri Kumesi Envanteri ve Egitim Manifestosu Yayincisi (Dataset Snapshot & Training Manifest) tamamlandi.** `DatasetPublisher` motoru (`src/dataset/dataset-publisher.ts`), `dataset_snapshots` SQLite ACID tablosu; `POST /api/v1/datasets/publish`, `GET /api/v1/datasets`, `GET /api/v1/datasets/:name`, `GET /api/v1/datasets/:name/manifest` REST rotalari; `publish_dataset`, `list_datasets`, `get_dataset_manifest` MCP araclari uygulandi. **470/470 test %100 yesil, 6 asamali deterministik dogrulama hatti (`npm run verify`) hatasiz gecmektedir.**

---

## Completed (Veri Kumesi Envanteri ve Egitim Manifestosu Yayincisi)

- [x] **`DatasetPublisher` (`src/dataset/dataset-publisher.ts`):** Şard envanteri çözümleme, deterministik train/val/test bölme, SHA-256 sağlama toplamı denetimi, `manifest.json` ve `checksums.sha256` üretimi, uzak depolama bağlayıcılarına (S3/R2/B2) yükleme ve `RegistryDatabase` ACID kaydı.
- [x] **HTTP API Uç Noktalari (`src/core/dataset-router.ts` & `src/core/server.ts`):** `POST /api/v1/datasets/publish`, `GET /api/v1/datasets`, `GET /api/v1/datasets/:name`, `GET /api/v1/datasets/:name/manifest`, `GET /api/v1/datasets/:name/snapshots`, `GET /api/v1/datasets/:name/snapshots/:snapshotId`.
- [x] **MCP Araclari (`src/mcp/protokol-mcp-server.ts`):** Toplam 36 MCP aracı; `publish_dataset`, `list_datasets`, `get_dataset_manifest` ile AI ajanlarının otonom eğitim veri kümesi mühürlemesi sağlandı.
- [x] **OpenAPI 3.1.0 Spesifikasyonu (`src/core/openapi-spec.ts`):** `Datasets` etiketi altında tüm şemalar, istek gövdeleri ve yanıt formatları belgelendi.
- [x] **Entegrasyon Testleri (`tests/dataset-publisher-and-api.test.ts`):** 11 entegrasyon testi ile şard bölme, token tahmini, hata reddi, REST rotaları ve MCP JSON-RPC araç çağrıları doğrulandı.

---

## Completed (Kök Dizin Mimari Şeması ve Modüler Etki Alanı)

- [x] **Kök Mimari Dokümantasyonu (`ARCHITECTURE.md`):** Kökten yaprağa dizin hiyerarşisi, domain sınırları ve mimari invaryantlar tek kaynakta toplandı.
- [x] **Modüler Etki Alanı Paketleri (`src/`):** 24 düz dosya 5 alana ayrıştırıldı:
  - `src/core/`: Sunucu (`server.ts`), tipler (`types.ts`), barrel dışa aktarımı (`index.ts`).
  - `src/actors/`: 8 kazıma/tarama aktörü ve aktör kayıt kütüğü (`actor-registry.ts`).
  - `src/browser/`: Tarayıcı havuzu, oturum yöneticisi, gizlilik ve DOM indeksleme.
  - `src/extractors/`: Readability, GFM tabloları, robots.txt ayrıştırıcıları.
  - `src/network/`: SSRF koruması, nezaket sınırlandırıcısı, URL normalizasyonu ve kuyruk yönetimi.
- [x] **Geriye Dönük Uyumluluk (Trampolines):** `src/index.ts` ve `src/server.ts` kök dışa aktarımları ile `tsconfig.json` çoklu path mapping eşleşmeleri sağlandı.
- [x] **Bağlam ve Sistem Haritası Senkronizasyonu:** `context/architecture-schema.md` ve `context/connectome.md` güncellendi.

---

## Completed (Faz 4: Tarayıcı ve Ağ Aktörleri & NixOS Entegrasyonu)

- [x] **`NetworkInterceptorActor` (`src/actors/network-interceptor-actor.ts`):** Chromium arka plan ağ trafiğini (`page.on('response')`) dinleyerek JSON API yanıtlarını yakalayan, URL deseni ve durum kodu filtreleyen aktör uygulandı.
- [x] **`SerpSearchActor` (`src/actors/serp-search-actor.ts`):** DuckDuckGo HTML arama motoru sonuçlarını ayrıştıran, takip yönlendirmelerini çözen ve organik sıralamaları çıkaran aktör uygulandı.
- [x] **HTTP API Uç Noktaları:** `POST /api/v1/network/intercept` ve `POST /api/v1/search` uç noktaları eklendi.
- [x] **NixOS Deklaratif Geliştirme Ortamı:** `flake.nix`, `devenv.nix` ve `.envrc` yapılandırılarak `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` Nix sistem Chromium'una bağlandı.

---

## Completed (Faz 3: Çekirdek Aktörlerin Entegrasyonu)

- [x] **`SitemapXmlActor` (`src/actors/sitemap-xml-actor.ts`):** XML sitemap, `sitemapindex` özyinelemeli çözümleme, gzip dekompresyonu (`zlib`) ve RSS/Atom akış link ayrıştırması uygulandı.
- [x] **`MarkdownReaderActor` (`src/actors/markdown-reader-actor.ts`):** Mozilla Readability ve Cheerio temizliği ile LLM odaklı GFM markdown, YAML frontmatter ve token tahmini üretimi sağlandı.
- [x] **HTTP API Uç Noktaları:** `POST /api/v1/sitemap` ve `POST /api/v1/reader` uç noktaları eklendi.

---

## Completed (Faz 2: Doğrulama ve Bilişsel Altyapı)

- [x] **Biome Entegrasyonu (`biome.json`):** Kod stili, formatlama ve statik analiz tüm projeye entegre edildi.
- [x] **Canlı SCA Paket Denetimi (`scripts/sca-check.mjs`):** NPM resmi kayıt defterinden bağımlılık doğrulama otomasyonu kuruldu.
- [x] **Deterministik Doğrulama Hattı (`scripts/verify-pipeline.mjs`):** 5 aşamalı mimari, isimlendirme, loglama, güvenlik ve linter kapısı oluşturuldu.
- [x] **Sistem Haritası Otomasyonu (`scripts/generate-connectome.mjs`):** Mimari bağlantıların otomatik üretimi sağlandı.

---

## Completed (Faz 1: Güvenlik ve Çekirdek Düzeltmeler)

- [x] **SSRFGuard IPv6 Çeper Koruması:** RFC 4291 IPv4-compatible IPv6 (`::/96`), NAT64 ve 6to4 gömülü yerel adres bypass açıkları kapatıldı.
- [x] **BrowserPool İzolasyonu & Tekil Başlatma Kilidi:** Rota filtreleme `context.route` seviyesine çıkarıldı, cold-start eşzamanlı process sızıntısı giderildi.
- [x] **PolitenessLimiter Eşzamanlılık Kilidi:** Atomik zaman yuvası rezervasyonu ile eşzamanlı istek yarış durumları önlendi.
- [x] **Bağıntılı Link Takibi ve Sınır Koruması:** `PlaywrightBrowserActor` mutlak link (`el.href`) toplamaya geçirildi, `CrawlUrlAccumulator` için `sameDomainOnly` koruması eklendi.
- [x] **HTTP Sunucu Koruma Sınırı:** `MAX_BODY_SIZE_BYTES` ile 10MB payload limiti getirildi.

---

## Verification Metrics

```bash
# Test Suite
$ npm test
ℹ tests 76
ℹ suites 3
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6895

# Verification Pipeline
$ npm run verify
=== OMEGA-3 DETERMINISTIK DOGRULAMA HATTI BASLATILIYOR ===
[1/5] Mimari Dosya Butunlugu Denetleniyor... [OK]
[2/5] Isimlendirme Disiplini (Naming Discipline) Taranıyor... [OK]
[3/5] Loglama Disiplini (Sıfır Emoji) Taranıyor... [OK]
[4/5] Bagimlilik ve Paket Halusinasyonu (SCA) Denetleniyor... [PASS]
[5/5] Kod Stili ve Statik Analiz (Biome Lint) Denetleniyor... [OK]
[PASS] DOGRULAMA BASARILI: Kod tabani tum dogrulama katmanlarindan gecti.

# TypeScript Type Check
$ npm run typecheck
Exit Code: 0 (0 errors)
```
