# TASKS — Görev Belleği (Hipokampüs)

Bu dosya **protokol-7** projesinde ajanın **çalışan belleğidir**.
Burada sadece "şu an ne yapıyorum, sırada ne var, nerede takıldım" bilgisi tutulur.

Her görev bir güven kademesi (Trust-Tier) taşır — bkz. `rules/trust-tiers.md`.

---

## Aktif

- *(Şu an aktif görev bulunmuyor — yeni talimat bekleniyor)*

## Bekleyen (Blok var)

- *(Bloklu görev bulunmuyor)*

## Sağlamlaştırma bekliyor

- *(Yeni fikirler burada bekler)*

## Son tamamlananlar (son 3-5, eskiler ledger/'a taşınır)

- [x] **Semantic Scholar PDF OCR Pipeline Entegrasyonu** — `Tier: 2` — 3 aşamalı (pdfminer -> Tesseract -> GPU Vision LLM) PDF çıkarma ve OCR entegrasyonu tamamlandı. Adım 1: `pdf_extractor.py`, Parquet schema güncellemesi (`pdf_text`, `pdf_ocr_needed`, `pdf_char_count`), `--fetch-pdf` CLI flag'i ve 32 birim testi (COMMIT: 5a46062). Adım 2: `SemanticScholarActor` `pdf_ocr` eylemi, `PdfAnomalyDetector` entegrasyonu, `actor-manifests.ts` ve 7 birim testi (COMMIT: da5fc1e). Adım 3 & 4: Colab batch OCR script'i (`colab_ocr_batch.py`) ve notebook'u (`colab_ocr_batch.ipynb`) ile `baidu/Unlimited-OCR` ve `Qwen2.5-VL-7B` desteği; `UnlimitedOcrConnector` TS sınıfı, `OcrConnectorRegistry` kaydı ve 25 birim testi (COMMIT: a1316d1).

- [x] **Wikibooks, Wikinews, Wikiquote, Wikispecies, Wikiversity, Wikivoyage Sıfır Disk Artığı Dump ETL Boru Hatları** — `Tier: 2` — 6 Wikimedia corpus pipeline'ı (Wikibooks 121 dil, Wikinews 36 dil, Wikiquote 100 dil, Wikispecies global taksonomi, Wikiversity 17 dil, Wikivoyage 27 dil) sıfır disk artığı mimarisiyle inşa edildi; her biri cleaner/downloader/packer/drive_sync/orchestrator + 5 birim testi; toplam 30 test eksiksiz geçti. Master koordinatörler `run_all_wikimedia_pipelines.py` ve `run_news_and_species_pipelines.py` eklendi. architecture-schema.md güncellendi.

- [x] **Gutenberg Görüntü TAR Shard Pipeline (scripts/gutenberg_pipeline/)** — `Tier: 2` — EPUB/ZIP arşivinden resim çekme (`fetch_book_images`, `pick_image_source_url`), ZipBomb koruması (tek dosya > 20 MB atla, kitap başına 50 MB sınır), `GutenbergImageTarSharder` ile 10 GB WebDataset TAR.GZ shard (iç yapı `{book_id}/{image_name}`), Drive subfolder yükleme (`Gutenberg/Images/`), Parquet şemasına `has_images`, `image_count`, `image_archive_shard` kolonları eklendi; 14 birim testi tamamı geçti (toplam 68/68).

- [x] **Wikibooks, Wikiversity ve Wikivoyage Sıfır Disk Artığı Dump ETL Boru Hatları (scripts/wikibooks_pipeline/, scripts/wikiversity_pipeline/, scripts/wikivoyage_pipeline/)** — `Tier: 2` — Wikibooks (121 dil, 388.413 madde, 635.98 MB Parquet), Wikiversity (17 dil, 101.370 madde, 161.22 MB Parquet) ve Wikivoyage (27 dil, 149.950 madde, 276.84 MB Parquet) için 4 GB RAM mimarisi, Zstandard Parquet akışı, Google Drive v3 yükleme ve MD5 doğrulama ile sıfır disk artığı ETL boru hatları inşa edildi ve tamamlandı; toplam 639.733 madde doğrudan Google Drive'a mühürlendi; 15 birim testi eksiksiz geçti.

- [x] **Wikiquote 100 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı (scripts/wikiquote_pipeline/)** — `Tier: 2` — Wikiquote'un 100 dünya dili için XML bz2 dump akışı, wikitext vecize ve aforizma temizleyici, Zstandard Parquet paketleyici, Google Drive v3 yükleme ve MD5 doğrulama ile sıfır disk artığı ETL hattı inşa edildi; 4 GB RAM bellek tamponlarıyla optimize edilen boru hattı 99 aktif dünya dilini (Türkçe `tr` 6.372 madde, İngilizce `en` 69.128 madde, İtalyanca `it` 56.662 madde vb.) işleyerek toplam 419.975 maddeyi 505.34 MB Zstd Parquet halinde doğrudan Google Drive'a mühürledi; geçici dosyalar anında silinerek yerel diskte sıfır artık garanti edildi; 5 birim testi eksiksiz geçti.

- [x] **Gutenberg, StackExchange, OpenAlex ve Semantic Scholar Drive Entegrasyonlu Sıfır Disk Artığı ETL Boru Hatları (scripts/*_pipeline/)** — `Tier: 2` — Project Gutenberg (~70.000 kitap), StackExchange (~100M+ Soru/Cevap konusu), OpenAlex (OA akademik çalışmalar) ve Semantic Scholar (S2AG/S2ORC) için streaming ingestion, cleaner, Zstd Parquet sharding, Google Drive v3 yükleme, MD5 sağlama doğrulaması ve anında yerel disk temizliği mimarisi tamamlandı; 64 birim testi eksiksiz geçti; 4 adet deklaratif YAML manifest ve detaylı walkthrough dokümanı mühürlendi.

- [x] **OpenAlex ve SemanticScholar Pipeline Birim Testleri (scripts/openalex_pipeline/test_openalex_pipeline.py, scripts/semanticscholar_pipeline/test_semanticscholar_pipeline.py)** — `Tier: 2` — OpenAlex için 18 test (reconstruct_abstract kalite kapısı, build_record alan çıkarma, OpenAlexParquetSharder şema/boş/callback) ve SemanticScholar için 24 test (_clean yardımcı, build_record kalite kapısı, alan çıkarma, S2ParquetSharder şema/tip doğrulama) yazıldı; npm run test:corpus-pipelines ile 64 testin tamamı (Gutenberg 10, StackExchange 12, OpenAlex 18, S2 24) geçti. package.json'a dört pipeline ve test script'i eklendi.

- [x] **Klasik Filoloji, Antik Metinler & Dünya Mirası Paketi (Set 6: Perseus-DL, Sacred-Texts)** — `Tier: 2` — Tufts Perseus Digital Library (`perseus-dl`) ve Internet Sacred Text Archive (`sacred-texts`) aktör sınıfları, REST uç noktaları (`POST /api/v1/<name>`), MCP araçları (`query_*`, toplam 79 araç), Zod/JSON şemaları, OpenAPI 3.1.0 tanımları, 23 birim/entegrasyon testi, teknik wikileri, örnek yapılandırmaları ve walkthrough dokümanı ile eksiksiz tamamlandı; 868 test ve 6 aşamalı doğrulama hattı başarıyla geçti.

---

## Oturum Sonu Protokolü
1. Aktif görevin `Durum:` satırını güncelle.
2. 5'ten fazla tamamlanan varsa: `npm run consolidate` çalıştır.
