# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Aktif görev tamamlandı; OpenAlex S3 snapshot pipeline'ı PID 958059 olarak arka planda canlı çalışıyor)*

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- [ ] **Kapsamlı Veri Çekme Yöntemleri ve Kurumsal Modüler Mimari Dönüşümü** — `Tier: 2` — Tüm 7 veri çekme yöntemini (S3/GCS snapshot, arşiv dump'ları, REST/GraphQL API'leri, Playwright stealth, Git SCM, multimodal OCR ve ses transkriptleri) birleştiren modüler mimari planı [`docs/plans/kapsamli-veri-cekme-ve-mimari-kategorizasyon-plani.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/plans/kapsamli-veri-cekme-ve-mimari-kategorizasyon-plani.md) hazırlandı. Canlı süreç (PID 958059) bitiminde uygulanacak.

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Instagram Veri Çıkarma Aktörü (`instagram`)** — `Tier: 2` — Instagram kamuya açık profil, gönderi/reel, hashtag ve son gönderi çıkarımı için ikili motorlu (HTTP API + Playwright Chromium Stealth fallback) aktör mimarisi geliştirildi. `InstagramActor` sınıfı (`src/actors/corpus/instagram-actor.ts`), `ActorType` ve veri sözleşmeleri (`src/api/types.ts`), `POST /api/v1/instagram` REST rotası (`src/api/server.ts`), `query_instagram` MCP aracı (`src/mcp/protokol-mcp-server.ts`), OpenAPI 3.1.0 spesifikasyonu, `docs/actors/instagram.md`, `examples/actors/instagram.json` ve 11 birim/entegrasyon testi (`tests/instagram-actor.test.ts`) eksiksiz tamamlandı. 895 testin tamamı hatasız geçti, `npm run verify` 6/6 onaylandı. Walkthrough: [`docs/walkthroughs/instagram-aktoru-walkthrough.md`](file:///home/l7v/l7v-dev/play/protokol-7/docs/walkthroughs/instagram-aktoru-walkthrough.md).

- [x] **OpenAlex S3 Snapshot Temizleme, Parçalama ve Drive Yükleme Hattı** — `Tier: 2` — `s3://openalex/data/parquet/works/` (707 GB) resmi snapshot'ı için uçtan uca akış hattı kuruldu. `cleaner.py` (paratext/retraction filtreleme, inverted-index abstract reconstruction, Markdown sentezi), `packer.py` (kompakt `oa_w_...` isimlendirme, Zstd compression, 10-50 GB shard tavanı), `downloader.py` (manifest ayrıştırma, AWS CLI / HTTPS streaming, anında ham veri temizliği), `drive_sync.py` (Drive v3 resumable upload, MD5 doğrulama, sıfır yerel disk artığı), `ledger.py` (`data/openalex_snapshot_catalog.sqlite` ACID defteri + `data/catalog.sqlite` dual-sync), `orchestrator.py` CLI motoru. 8 birim testi (`test_snapshot_pipeline.py`) eksiksiz geçti, pilot dry-run testi başarıyla doğrulandı; `npm run verify` 6/6 onaylandı.

- [x] **Proje Denetim ve Mimari İyileştirme Paketi (T1.1 - T3.4)** — `Tier: 2` — `proje-denetim-tasklist.md` içindeki tüm kritik ve operasyonel açıklar giderildi. Adım 1 & 2: `scheduled_jobs` DDL ve broker şemasına `pipeline_config_json`, `actor_config_json`, `last_error`, `fail_count` eklendi; `JobRouter` constructor'ında `restoreActiveJobs()` ile restart/recovery garantisi sağlandı (T1.1, T4.2). Adım 3 & 4: `ProtokolMcpServer`'a `RegistryDatabase` DI eklendi, `resetDefaultRegistryDatabase()` export edildi; `RegistryDatabase`'e `deleteScheduledJob`, `deleteDataset`, `deleteDatasetShard`, `deleteDatasetSnapshot` CRUD metodları eklendi (T3.1, T3.2, T3.3). Adım 5: `context/schema.sql` SQLite veritabanı ile birebir senkronize edildi (T1.2). Adım 6: `context/architecture-schema.md` stale `src/core/` yolları `src/api/` ile düzeltildi, `anomalies.ts` ve `terminal-theme.ts` eklendi, aktör sayısı 69 olarak senkronize edildi (T2.1, T2.2, T2.3, T2.5). Adım 7: `wikisource_pipeline` (5 test) ve `wiktionary_pipeline` (5 test) Python birim testleri yazıldı, `package.json` script'leri ve `test:wikimedia` güncellendi (T2.4). Adım 8: Kök dizindeki harvest logları `ledger/logs/` dizinine taşındı (T3.4). Tüm 884 TS testi ve 10 Python testi hatasız geçti; `npm run verify` 6/6 onaylandı.

- [x] **Semantic Scholar PDF OCR Pipeline Entegrasyonu** — `Tier: 2` — 3 aşamalı (pdfminer -> Tesseract -> GPU Vision LLM) PDF çıkarma ve OCR entegrasyonu tamamlandı. Adım 1: `pdf_extractor.py`, Parquet schema güncellemesi (`pdf_text`, `pdf_ocr_needed`, `pdf_char_count`), `--fetch-pdf` CLI flag'i ve 32 birim testi (COMMIT: 5a46062). Adım 2: `SemanticScholarActor` `pdf_ocr` eylemi, `PdfAnomalyDetector` entegrasyonu, `actor-manifests.ts` ve 7 birim testi (COMMIT: da5fc1e). Adım 3 & 4: Colab batch OCR script'i (`colab_ocr_batch.py`) ve notebook'u (`colab_ocr_batch.ipynb`) ile `baidu/Unlimited-OCR` ve `Qwen2.5-VL-7B` desteği; `UnlimitedOcrConnector` TS sınıfı, `OcrConnectorRegistry` kaydı ve 25 birim testi (COMMIT: a1316d1).

- [x] **Wikibooks, Wikinews, Wikiquote, Wikispecies, Wikiversity, Wikivoyage Sıfır Disk Artığı Dump ETL Boru Hatları** — `Tier: 2` — 6 Wikimedia corpus pipeline'ı (Wikibooks 121 dil, Wikinews 36 dil, Wikiquote 100 dil, Wikispecies global taksonomi, Wikiversity 17 dil, Wikivoyage 27 dil) sıfır disk artığı mimarisiyle inşa edildi; her biri cleaner/downloader/packer/drive_sync/orchestrator + 5 birim testi; toplam 30 test eksiksiz geçti. Master koordinatörler `run_all_wikimedia_pipelines.py` ve `run_news_and_species_pipelines.py` eklendi. architecture-schema.md güncellendi.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
