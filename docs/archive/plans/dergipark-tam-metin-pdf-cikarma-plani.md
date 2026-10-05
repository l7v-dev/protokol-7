# DergiPark Tam Metin PDF İndirme ve Metin Çıkarımı Mimari Planı

## 1. Amaç ve Kapsam
TÜBİTAK ULAKBİM DergiPark külliyatında kataloglanmış olan 126.953 makalenin tam metin PDF'lerine erişilerek yüksek kaliteli LLM eğitim ve RAG külliyatı (corpus) üretilmesi.

Bu plan:
1. DergiPark iniş URL'lerinden doğrudan PDF indirme adreslerinin (`/tr/download/article-file/{id}`) tespiti,
2. PyMuPDF (fitz) ile Türkçe karakter korumalı ve düzen duyarlı Markdown metin çıkarımı,
3. Zstandard sıkıştırmalı Parquet shard'larına paketleme ve Google Drive `DergiPark/Fulltext/` klasörüne aktarım,
4. SQLite katalog defterinde (`dergipark_catalog.sqlite`) çıkarım durumunun ACID olarak takibi,
5. Çoklu iş parçacıklı ve nazik oran sınırlamalı (politeness rate-limit) yürütme motorunun kurulmasını kapsar.

## 2. Mimari Bileşenler

### A. PDF Çıkarım Motoru (`pipelines/api_stream/dergipark/pdf_extractor.py`)
- `DergiParkPdfExtractor`:
  - `resolve_pdf_url(landing_url: str) -> Optional[str]`: HTML iniş sayfasından `/tr/download/article-file/\d+` bağlantısını regex ile yakalar.
  - `fetch_and_extract(url: str) -> Dict[str, Any]`:
    - Boyut filtresi: 50 MB üzeri dosyalar atlanır.
    - Zaman aşımı: 30 saniye.
    - PyMuPDF ile sayfa sayfa metin ayrıştırma, başlık/metin düzeni normalizasyonu.
    - Karakter ve kelime istatistiklerinin üretilmesi.

### B. SQLite Katalog Defteri Güncellemeleri (`ledger.py`)
- `dergipark_articles` tablosuna sütunlar:
  - `pdf_status`: `'pending'`, `'extracted'`, `'failed'`, `'no_url'`, `'too_large'`
  - `pdf_direct_url`: Doğrudan indirilen PDF bağlantısı
  - `page_count`: Sayfa sayısı
  - `extracted_at`: Çıkarım zaman damgası
- Metotlar: `get_pending_pdf_articles(limit)`, `mark_pdf_extracted()`, `mark_pdf_failed()`, `get_pdf_stats()`.

### C. Tam Metin Parquet Paketleyicisi (`fulltext_packer.py`)
- Zstandard sıkıştırmalı `dergipark_fulltext_YYYYMMDD_p00000.parquet` dosyaları üretir.
- 512 MB veya 5.000 makale eşiğinde shard rotasyonu.
- SHA-256 ve MD5 sağlama toplamı hesaplaması.
- `DergiParkDriveSync` ile Google Drive `DergiPark/Fulltext/` konumuna aktarım ve yerel dosya temizliği.

### D. Çıkarım Koşucusu CLI (`fulltext_runner.py`)
- `--max-articles`, `--batch-size`, `--workers`, `--status`, `--dry-run`, `--no-drive`.
- Hata durumunda (429, 503) üstel geri çekilme (exponential backoff).

## 3. Doğrulama ve Testler
- `test_pdf_extractor_link_resolution`: HTML içeriğinden indirme linkinin doğru çözüldüğünü doğrular.
- `test_pdf_extractor_pymupdf_extraction`: Sentetik PDF baytlarından metin ve sayfa sayısı çıkarımını test eder.
- `test_fulltext_packer_rotation`: Tam metin shard paketleyicisinin Zstandard Parquet oluşturduğunu doğrular.
- `test_ledger_pdf_status_tracking`: SQLite durum güncellemelerini test eder.
- `npm run verify`: 6 katmanlı tam doğrulama hattı.

## 4. Kısıtlar ve Güvenlik
- **Sıfır Emoji:** Kod, log, commit ve dokümanlarda kesinlikle emoji kullanılmaz.
- **DOAJ Süreç Güvenliği:** PID 106385 DOAJ arka plan akışı kesintisiz çalışmaya devam eder.
- **Git Standartları:** `feat(dergipark): implement full-text pdf extraction and parquet sharder pipeline`.
