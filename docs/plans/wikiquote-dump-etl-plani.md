# Wikiquote 100 Dilli Sıfır Disk Artığı Dump ETL Boru Hattı Planı

## 1. Mimari Genel Bakış
Wikiquote (Vikisöz) külliyatının 100 dünya dilindeki tüm doğrulanmış alıntı, aforizma, atasözü ve tarihî söylevlerini Wikimedia resmi XML bz2 dump arşivlerinden çekip temizleyen, Zstandard Parquet formatına dönüştüren ve Google Drive v3'e yükledikten sonra yerel diskteki tüm geçici dosyaları anında imha eden (Zero Disk Residue) otonom ETL boru hattıdır.

## 2. Modül Yapısı (`scripts/wikiquote_pipeline/`)
- `downloader.py`: Wikimedia dump aynalarından `<db>-latest-pages-articles.xml.bz2` arşivini akış halinde indiren ve kesintiye dayanıklı modül.
- `cleaner.py`: `xml.etree.ElementTree.iterparse` ile bellek tüketimini O(1) sabit düzeyde tutan, wikitext gürültüsünü (şablonlar, referanslar, tablolar) temizleyen ve saf alıntıları ayıklayan akış ayrıştırıcısı.
- `packer.py`: `pyarrow` ile PyArrow Tabloları oluşturan ve Zstandard (zstd lvl 6) Parquet parçalarına bölen modül.
- `drive_sync.py`: Google Drive v3 API üzerinden `Wikiquote/<lang>/` klasör hiyerarşisi oluşturan, MD5 sağlama toplamı doğrulaması yapan ve yerel dosyayı hemen silen senkronizasyon motoru.
- `orchestrator.py`: SQLite veritabanında (`data/wikiquote_catalog.sqlite`) durum takibi yapan, kesinti anında kaldığı yerden devam edebilen, 100 dili sırayla işleyen ana orkestratör.

## 3. Veri Şeması (Parquet)
- `article_id`: `int64` (Wikimedia sayfa kimliği)
- `title`: `string` (Madde / Yazar / Konu başlığı)
- `lang`: `string` (Dil kodu, örn: `tr`, `en`, `la`)
- `text`: `string` (Temizlenmiş GFM alıntı metni)
- `quotes_count`: `int32` (Ayıklanan alıntı sayısı)
- `raw_length`: `int32` (Ham wikitext karakter sayısı)
- `clean_length`: `int32` (Temizlenmiş metin karakter sayısı)
- `url`: `string` (Resmi Wikiquote madde URL'si)
- `timestamp`: `string` (Son revizyon zaman damgası)

## 4. Doğrulama Kapıları
- Birim testleri: `scripts/wikiquote_pipeline/test_wikiquote_pipeline.py`
- Linter ve kod stili kontrolleri.
- Küçük hacimli bir dil (örn: `la` veya `ang`) ile uçtan uca kuru test doğrulaması.
