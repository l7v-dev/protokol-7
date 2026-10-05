# DergiPark Tarih Bölümlemeli Toplama (Partitioned Harvest) Walkthrough

## 1. Genel Bakış ve Çözülen Problem
TÜBİTAK ULAKBİM DergiPark OAI-PMH 2.0 servisinde tekil genel sorgular (`verb=ListRecords&metadataPrefix=oai_dc`) ~131.200 kayıttan sonra derleme penceresi sınırına ulaşıp sonlanıyordu. DergiPark külliyatındaki 800.000+ hakemli akademik makalenin tamamına erişebilmek için tarih aralıklı (`from=YYYY-MM-DD&until=YYYY-MM-DD`) bölümlemeli toplama mimarisi kuruldu.

## 2. Yapılan Değişiklikler

### A. Tarih Bölümleme Modülü (`pipelines/api_stream/dergipark/partitioner.py`)
- `DergiParkPartitioner.generate_date_partitions()`:
  - 1970 öncesi arşiv: Blok tarih aralığı.
  - 1970-1999: 5 yıllık aralıklar.
  - 2000-2009: 2 yıllık pencereler.
  - 2010-2017: Yıllık pencereler.
  - 2018-2026: 6 aylık yoğunluk pencereleri (yıllık 50K+ makale hacmini güvenle ~25K-30K'ya bölerek sıfır kesinti sağlar).
  - Modlar: `auto`, `year`, `half_year`.

### B. SQLite Bölüm Durum Defteri (`pipelines/api_stream/dergipark/ledger.py`)
- `dergipark_partitions` tablosu eklendi:
  - Bölüm kimliği (`partition_id`), tarih sınırları (`from_date`, `until_date`), set kodu (`set_spec`), durum (`pending`, `running`, `completed`, `failed`), anlık `resumption_token`, `raw_count`, `clean_count`, `new_count`, `started_at`, `completed_at`.
- İlerleme metotları: `init_partition`, `start_partition`, `update_partition_progress`, `complete_partition`, `fail_partition`, `get_partition`, `get_partitions`.
- Tekilleştirme güvencesi: `has_article(id)`, `load_existing_ids()`.

### C. OAI-PMH İlerleme Bildirimi (`pipelines/api_stream/dergipark/downloader.py`)
- `stream_records` fonksiyonuna `on_token_update` geri çağırma (callback) parametresi eklendi.
- Her yeni `resumptionToken` alındığında veritabanındaki bölüm durumu anında güncellenerek kesinti durumunda kaldığı sayfadan devam edebilme sağlandı.

### D. Orkestratör ve CLI Yetenekleri (`pipelines/api_stream/dergipark/orchestrator.py`)
- `--auto-partition`: Sırayla tüm tarih pencerelerini çalıştırır, tamamlananları atlar.
- `--status`: Mevcut külliyat ve bölüm ilerlemesini tablo olarak raporlar.
- `--start-year` / `--end-year` / `--partition-mode`: Esnek tarih kapsamı.
- Bellek içi tekilleştirme: Mevcut 131.127 kayıt hafızaya alınır, sadece yeni kayıtlar Parquet shard'larına eklenir; Parquet dosyaları arasında makale mükerrerliği %0'dır.
- Tamamlanma ayrımı: Yalnızca OAI akışı doğal olarak bittiğinde bölüm `completed` işaretlenir; `max-records` kesintisinde bölüm duraklatılmış olarak korunur.

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
**Sonuç:** 12/12 test yeşil geçti (0.79s).

### TypeScript Aktör Testleri
```bash
npx tsx --test tests/dergipark-actor.test.ts
```
**Sonuç:** 11/11 test yeşil geçti.

### 6 Katmanlı Doğrulama Hattı
```bash
npm run verify
```
- [1/6] Mimari Dosya Bütünlüğü: PASS
- [2/6] İsimlendirme ve Dokümantasyon Disiplini: PASS
- [3/6] Loglama Disiplini (Sıfır Emoji): PASS
- [4/6] Gizli Anahtar Taraması: PASS
- [5/6] Bağımlılık ve Paket Halüsinasyonu (SCA): PASS (11 paket doğrulandı)
- [6/6] Kod Stili ve Statik Analiz (Biome Lint): PASS (357 dosya temiz)

### Canlı Süreç Güvenliği
- DOAJ Arka Plan Daemon'ı (PID 106385) kesintisiz ve hatasız biçimde akmaya devam etmektedir.

## 4. Kullanım Örnekleri

### Durum Raporu
```bash
python pipelines/api_stream/dergipark/orchestrator.py --status
```

### Bölümlemeli Toplama Başlatma
```bash
# Otomatik tarih bölümleme ile tüm külliyatı toplama (arka plan akışı)
python -u pipelines/api_stream/dergipark/orchestrator.py --auto-partition --start-year 1970 --max-records 0 --batch-size 1000 --max-shard-records 50000 --shard-size-mb 512
```

## 5. Sıradaki Adım (Yol Haritası)
- **Madde C:** V3 Kontrol Düzlemi Kaynak Tanımlayıcı Entegrasyonu (`contracts/source-descriptors/` altında DergiPark kaynak tanımlayıcısı kaydı ve SQLite defter entegrasyonu).
