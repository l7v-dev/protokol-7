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

### D. Ham PDF Arşivleyici TAR.GZ Sharder (`pipelines/api_stream/dergipark/pdf_tar_packer.py`)
- `DergiParkPdfTarSharder`:
  - İndirilen ham PDF ikili verilerini (`pdf_bytes`) bellekten doğrudan WebDataset/Cold Vault uyumlu `dergipark_raw_pdfs_{date}_p{part:05d}.tar.gz` paketlerine aktarır.
  - 512 MB veya 500 PDF eşiğinde otomatik rotasyon yapar.
  - SHA-256 ve MD5 hash özetleri çıkarır, Google Drive `DergiPark/pdfs/` klasörüne aktarır.
  - Uzak MD5 doğrulandıktan sonra yerel `.tar.gz` arşivini diskten silerek sıfır artık (zero-disk residue) bırakır.

### E. Tam Metin Orkestratör CLI (`pipelines/api_stream/dergipark/fulltext_runner.py`)
- CLI parametreleri:
  - `--batch-size` (varsayılan 50), `--max-articles` (0: sınırsız), `--workers` (varsayılan 4), `--rate-limit` (varsayılan 0.35s).
  - `--shard-size-mb`, `--max-shard-records`, `--output-dir`, `--db-path`.
  - `--pdf-archive-dir`, `--max-pdf-archive-mb`, `--max-pdf-archive-records`, `--no-archive-pdfs`.
  - `--status`: Durum dağılım tablosunu yazdırıp çıkar.
  - `--dry-run`, `--no-drive`, `--sync-shards`.
- `ThreadPoolExecutor` ile paralel indirme; tek bir HTTP isteğiyle hem metin çıkarımı hem de ham PDF arşivlemesi gerçekleştirilir.
- Hem Parquet tam metin hem de TAR.GZ ham PDF arşivleri Google Drive'a aktarılır, MD5 doğrulanır ve yerel disk sıfırlanır.
- Merkezi katalogla (`data/catalog.sqlite`) çift yönlü senkronizasyon (`dergipark_fulltext` ve `dergipark_raw_pdfs`).


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
- `test_pdf_tar_packer` PASSED
- `test_ledger_pdf_archive_tracking` PASSED
**Sonuç:** 20/20 test yeşil geçti (0.91s).

### Canlı Çıkarım ve Drive Senkronizasyon Doğrulaması
```bash
.venv/bin/python pipelines/api_stream/dergipark/fulltext_runner.py --max-articles 2 --workers 2
```
- 2 makale 6.6 saniyede başarıyla çekildi; 73 sayfa, 237.460 karakter tam metin çıkarıldı.
- `dergipark_fulltext_20261003_p00001.parquet` (0.08 MB) Google Drive `DergiPark/` klasörüne aktarıldı, MD5 doğrulandı, yerel dosya diskten silindi.
- `dergipark_raw_pdfs_20261003_p00000.tar.gz` (1.82 MB) Google Drive `DergiPark/pdfs/` klasörüne aktarıldı, MD5 doğrulandı, yerel dosya diskten silindi.
- Yerel diskte sıfır artık (0 bayt) bırakıldı.


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
