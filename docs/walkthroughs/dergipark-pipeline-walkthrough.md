# Walkthrough: DergiPark (TÜBİTAK ULAKBİM) Akış Boru Hattı ve Depolama Mimarisi

TÜBİTAK ULAKBİM DergiPark ulusal akademik dergi ağının (~2.200 dergi, ~600.000+ açık erişim Türkçe ve İngilizce makale) kurumsal standartlarda OAI-PMH tabanlı akış boru hattı, SQLite ilişkisel işlem defteri, Parquet paketleyicisi, Google Drive senkronizasyonu ve `dbx` veritabanı yöneticisi entegrasyonu tamamlandı.

---

## 1. Mimari ve Bileşenler

Boru hattı `pipelines/api_stream/dergipark/` dizini altında tam modüler yapıda hayata geçirildi:

- **Downloader ([`downloader.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/dergipark/downloader.py)):** DergiPark OAI-PMH 2.0 uç noktası (`https://dergipark.org.tr/api/public/oai/`) üzerinden `ListRecords`, `ListSets` ve `GetRecord` akışı; `resumptionToken` yönetimi, üstel geri çekilme ve SSL sertifika doğrulaması.
- **Cleaner ([`cleaner.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/dergipark/cleaner.py)):** Dublin Core ve CDATA metinlerini temizleyen, Türkçe özel karakterleri koruyan, DOI/ISSN çıkaran 16 alanlı standart şema dönüştürücüsü.
- **Packer ([`packer.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/dergipark/packer.py)):** `BaseParquetSharder` tabanlı, 50.000 kayıt veya 512 MB eşiğinde otomatik shard rotasyonu yapan Zstandard (Seviye 3) Parquet yazıcısı.
- **Ledger ([`ledger.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/dergipark/ledger.py)):** `BaseLedger` tabanlı WAL modunda `data/catalogs/dergipark_catalog.sqlite` ilişkisel veritabanı; `data/catalog.sqlite` ile çift yönlü `dataset_shards` senkronizasyonu.
- **Drive Sync ([`drive_sync.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/dergipark/drive_sync.py)):** `BaseDriveSync` tabanlı, Google Drive üzerinde `DergiPark/` klasörüne uzaktan MD5 doğrulaması ile aktaran ve yerel dosyayı anında silen sıfır disk artığı (zero-disk residue) motoru.
- **Orchestrator ([`orchestrator.py`](file:///home/l7v/l7v-dev/play/protokol-7/pipelines/api_stream/dergipark/orchestrator.py)):** Satır tamponlamalı gerçek zamanlı telemetri sunan CLI yönetim arayüzü.
- **Launcher ([`scripts/run_dergipark.sh`](file:///home/l7v/l7v-dev/play/protokol-7/scripts/run_dergipark.sh)):** Arka planda bağımsız `setsid nohup` çalıştırma betiği.

---

## 2. Doğrulama ve Test Sonuçları

### 2.1. Python Birim Testleri (8/8 Başarılı)
```text
pipelines/api_stream/dergipark/test_dergipark_pipeline.py ........ [100%]
============================== 8 passed in 0.21s ===============================
```
- `test_cleaner_valid_record`: Geçerli Dublin Core verisinden 16 alanlı tam şema üretimi.
- `test_cleaner_turkish_normalization`: Türkçe karakterler (ç, ğ, ı, ö, ş, ü, İ) ve HTML varlıklarının korunması.
- `test_cleaner_deleted_or_empty_rejected`: Silinmiş ve yetersiz kayıtların elenmesi.
- `test_cleaner_doi_and_issn_extraction`: DOI ve ISSN çıkarımı.
- `test_downloader_xml_record_parser`: XML ayrıştırıcı dayanıklılığı.
- `test_ledger_index_and_retrieve`: SQLite indeksleme ve geri çağırma.
- `test_packer_parquet_generation`: Parquet tamponlama, Zstd yazma ve SHA-256/MD5 mühürleme.
- `test_drive_sync_dry_run`: Google Drive yükleme simülasyonu.

### 2.2. TypeScript Aktör Testleri (11/11 Başarılı)
```text
▶ DergiParkActor (729.585561ms)
ℹ tests 11 | pass 11 | fail 0
```

### 2.3. Canlı Dry-Run Doğrulaması
Canlı TÜBİTAK ULAKBİM DergiPark OAI-PMH servisinden 10 makale çekilip indekslendi:
```text
[DERGIPARK] Starting TÜBİTAK ULAKBİM DergiPark Ingestion Pipeline
[DERGIPARK] Mode: OAI-PMH Bulk Harvest (all journals)
[SHARDER] Opened new shard: dergipark_20261003_p00000.parquet
[SHARDER] Shard completed: dergipark_20261003_p00000.parquet (10 records, 0.01 MB)
[DRIVE-DRY] Would upload dergipark_20261003_p00000.parquet (0.01 MB)
[DRIVE-DRY] Purged local file: data/parquets/dergipark/dergipark_20261003_p00000.parquet
[LEDGER] Synchronized 1 shards to central catalog: data/catalog.sqlite
[DERGIPARK] Ingestion Complete in 0.5s (10 raw, 10 clean, 0 rejected)
```

### 2.4. dbx Veritabanı Entegrasyonu
`data/catalogs/dergipark_catalog.sqlite`, `scripts/sync-dbx-connections.py` üzerinden yerel `dbx` GUI yöneticisine `protokol-dergipark` adıyla kaydedildi (toplam aktif bağlantı: **58**).

---

## 3. Çalıştırma Talimatları

İstenildiği anda DergiPark boru hattını canlı üretim modunda başlatmak için:

```bash
# Arka planda müstakil başlatma
./scripts/run_dergipark.sh

# Canlı log takibi
tail -f logs/dergipark.log

# Veritabanı sorgulama
sqlite3 data/catalogs/dergipark_catalog.sqlite "SELECT count(*) FROM dergipark_articles;"
```
