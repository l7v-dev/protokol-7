# DergiPark Tam Metin PDF İndirme ve Markdown Çıkarma Hattı Walkthrough

## 1. Genel Bakış ve Kapsam
TÜBİTAK ULAKBİM DergiPark açık erişimli akademik makale kataloğunda bulunan kayıtların (131.127 makale) tam metin PDF dosyalarını indirmek, metin katmanlarını PyMuPDF motoru ile Türkçe diyakritik bozulma olmaksızın yapılandırılmış Markdown formatına dönüştürmek, Zstandard seviye 6 ile sıkıştırılmış Parquet shard'larına paketlemek ve Google Drive'a sıfır yerel disk artığıyla senkronize etmek üzere uçtan uca boru hattı ve orkestratör CLI modülü kuruldu.

## 2. Yapılan Mimari Değişiklikler

### A. PDF Çözümleyici ve Metin Çıkarma Motoru (`pipelines/api_stream/dergipark/pdf_extractor.py`)
- **`ThreadSafeRateLimiter`**: Birden çok eşzamanlı işçi (worker thread) arasında DergiPark sunucularını aşırı yüklemeyen, milisaniye hassasiyetli thread-safe istek hız sınırlayıcı.
- **`DergiParkPdfExtractor`**:
  - `resolve_pdf_url(landing_url)`: Makale iniş sayfasındaki `/tr/download/article-file/(\d+)` regex deseniyle doğrudan PDF indirme bağlantısını çözer.
  - `fetch_pdf_bytes(pdf_url)`: 50 MB güvenlik sınırı, 35 saniye zaman aşımı, HTTP 429/503 durumlarında üssel geri çekilme (exponential backoff) ve `%PDF` sihirli bayt doğrulaması yapar.
  - `extract_text(pdf_bytes)`: PyMuPDF (`pymupdf`) ile her sayfayı ayrıştırır, `<!-- Page N -->` etiketleriyle sayfa sınırlarını korur, boşluk ve mizanpaj gürültülerini temizler. Metin boyutu 100 karakterin altındaysa `scanned_or_sparse` bayrağıyla işaretler.
  - `process_article(article)`: Uçtan uca makale işleme fonksiyonu.

### B. SQLite Katalog Şeması ve Durum Yönetimi (`pipelines/api_stream/dergipark/ledger.py`)
- Dinamik migrasyon ile `dergipark_articles` tablosuna tam metin alanları eklendi:
  - `pdf_status TEXT DEFAULT 'pending'`
  - `pdf_direct_url TEXT`
  - `page_count INTEGER DEFAULT 0`
  - `extracted_at TEXT`
  - `pdf_shard_name TEXT`
  - `idx_dp_pdf_status` indeksi
- Durum yönetimi fonksiyonları:
  - `get_pending_pdf_articles(limit)`: Yıllara göre azalan sırada işlenmeyi bekleyen makaleleri getirir.
  - `mark_pdf_extracted(article_id, pdf_url, page_count, char_count, word_count, shard_name)`: Başarılı çıkarımı kaydeder.
  - `mark_pdf_failed(article_id, status, pdf_url)`: Hatalı veya taranmış/boş PDF'leri işaretler.
  - `get_pdf_stats()`: `pending`, `extracted`, `failed`, `scanned_or_sparse`, `too_large` dağılımını gruplayarak raporlar (SQL alias çakışması `pdf_stat` ile önlendi).
  - `get_next_fulltext_part_index()`: Tam metin shard indekslerini (`dergipark_fulltext_%`) metaveri shard'larından izole ederek sıralı numaralandırır.

### C. Tam Metin Parquet Sharder (`pipelines/api_stream/dergipark/fulltext_packer.py`)
- `DergiParkFulltextSharder`:
  - Protokol-7 Cold Vault standardında PyArrow şeması: `id`, `doi`, `title`, `journal`, `year`, `language`, `pdf_url`, `page_count`, `fulltext`, `char_count`, `word_count`, `extracted_at`.
  - Zstandard (seviye 6) sıkıştırma.
  - 512 MB veya 2.000 makale eşiğinde otomatik shard rotasyonu.
  - SHA-256 ve MD5 kriptografik bütünlük özetleri.
  - `current_shard_name` dinamik mülkü ile yazılmakta olan shard adını anlık raporlar.

### D. Tam Metin Orkestratör CLI (`pipelines/api_stream/dergipark/fulltext_runner.py`)
- CLI parametreleri:
  - `--batch-size` (varsayılan 50), `--max-articles` (0: sınırsız), `--workers` (varsayılan 4), `--rate-limit` (varsayılan 0.35s).
  - `--shard-size-mb`, `--max-shard-records`, `--output-dir`, `--db-path`.
  - `--status`: Durum dağılım tablosunu yazdırıp çıkar.
  - `--dry-run`, `--no-drive`, `--sync-shards`.
- `ThreadPoolExecutor` ile paralel çekim ve thread-safe SQLite/Parquet yazımı.
- Her tamamlanan shard'ı otomatik Google Drive `DergiPark/` klasörüne aktarır, MD5 doğrular ve yerel diski sıfırlar.
- Merkezi katalogla (`data/catalog.sqlite`) çift yönlü senkronizasyon (`sync_to_central_catalog("dergipark_fulltext")`).

## 3. Doğrulama ve Test Sonuçları

### Python Birim ve Entegrasyon Testleri
```bash
.venv/bin/pytest pipelines/api_stream/dergipark/test_dergipark_pipeline.py -v
```
- `test_cleaner_valid_record` PASSED
- `test_cleaner_landing_page_and_doi_url` PASSED
- `test_cleaner_turkish_normalization` PASSED
- `test_cleaner_deleted_or_empty_rejected` PASSED
- `test_cleaner_doi_and_issn_extraction` PASSED
- `test_downloader_xml_record_parser` PASSED
- `test_ledger_index_and_retrieve` PASSED
- `test_packer_parquet_generation` PASSED
- `test_drive_sync_dry_run` PASSED
- `test_partitioner_date_windows` PASSED
- `test_ledger_partition_and_deduplication` PASSED
- `test_downloader_token_callback` PASSED
- `test_rate_limiter_pacing` PASSED
- `test_pdf_extractor_resolve_url` PASSED
- `test_pdf_extractor_extract_text` PASSED
- `test_pdf_extractor_process_article` PASSED
- `test_fulltext_sharder_generation` PASSED
- `test_ledger_pdf_status_and_stats` PASSED
**Sonuç:** 18/18 test yeşil geçti (1.20s).

### Canlı Çıkarım Doğrulaması (Canlı DergiPark Makaleleri)
```bash
.venv/bin/python pipelines/api_stream/dergipark/fulltext_runner.py --max-articles 3 --workers 2 --no-drive
```
- 3 makale 2.8 saniyede başarıyla çekildi (ortalama 1.1 makale/sn).
- Toplam 65 sayfa, 170.779 karakter tam metin çıkarıldı.
- `data/parquets/dergipark/fulltext/dergipark_fulltext_20261003_p00000.parquet` (0.06 MB) üretildi ve PyArrow ile şema/veri doğrulaması yapıldı.

### TypeScript ve Kontrol Düzlemi Testleri
```bash
npx tsx --test tests/dergipark-actor.test.ts tests/dergipark-worker.test.ts tests/contracts.test.ts
```
**Sonuç:** 22/22 test yeşil geçti.

### 6 Katmanlı Doğrulama Hattı
```bash
npm run verify
```
- Mimari dosya bütünlüğü: PASS
- İsimlendirme ve dokümantasyon disiplini: PASS
- Loglama disiplini (sıfır emoji): PASS
- Gizli anahtar taraması: PASS
- Canlı SCA bağımlılık denetimi (11 paket): PASS
- Biome lint (360 dosya): PASS
**Sonuç:** Tüm 6 katman başarıyla geçti.
