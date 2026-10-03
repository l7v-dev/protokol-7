# DergiPark Tarih Bölümlemeli Toplama (Partitioned Harvest) Mimari Planı

## 1. Amaç ve Kapsam
TÜBİTAK ULAKBİM DergiPark OAI-PMH servisi genel/bölümlenmemiş (`verb=ListRecords&metadataPrefix=oai_dc`) sorgularda yaklaşık 131.200 kayıttan sonra derleme penceresi sınırına (resumptionToken tükenmesi) ulaşmaktadır. DergiPark külliyatı ise 800.000'den fazla hakemli makale içermektedir.

Bu plan, DergiPark'ın yayın tarihi tabanlı filtreleme (`from=YYYY-MM-DD&until=YYYY-MM-DD`) yeteneğini kullanarak tüm külliyata deterministik, kesintiye dayanıklı ve mükerrersiz (deduplicated) biçimde ulaşacak olan **Bölümlemeli Toplama Motorunu** kurmayı hedefler.

## 2. Mimari Bileşenler ve Mekanizma

### A. Tarih Bölümleme Üreticisi (`partitioner.py`)
- DergiPark yayın yoğunluğuna göre optimize edilmiş kronolojik tarih pencereleri oluşturur:
  - Tarihi Arşiv: 1900-01-01 ile 1999-12-31 arası (düşük hacim).
  - 2000-2009: 2 yıllık pencereler (ör. 2000-2001, 2002-2003...).
  - 2010-2017: Yıllık pencereler (ör. 2010-01-01..2010-12-31).
  - 2018-2026: 6 aylık veya yıllık pencereler (yüksek yoğunluk, 131K sınırının çok altında kalarak sıfır kesinti sağlar).
- Özel aralık (`--start-year`, `--end-year`, `--from-date`, `--until-date`) desteği.

### B. SQLite Bölüm Durum Defteri (`dergipark_partitions`)
- `data/catalogs/dergipark_catalog.sqlite` içinde her bölümün durumunu atomik olarak takip eder:
  ```sql
  CREATE TABLE IF NOT EXISTS dergipark_partitions (
      partition_id TEXT PRIMARY KEY,
      from_date TEXT,
      until_date TEXT,
      set_spec TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
      resumption_token TEXT,
      raw_count INTEGER DEFAULT 0,
      clean_count INTEGER DEFAULT 0,
      new_count INTEGER DEFAULT 0,
      started_at TEXT,
      completed_at TEXT
  );
  ```
- Yeniden başlatıldığında `completed` olan bölümleri atlar, yarım kalmış bölümleri `resumption_token` ile kaldığı yerden devam ettirir.

### C. Parquet Tekilleştirme Güvencesi (Deduplication Invariant)
- Veritabanında hali hazırda 131.127 makale bulunmaktadır.
- Yeni bölümlerden gelen kayıtlar:
  - SQLite tarafında `ON CONFLICT(id) DO UPDATE SET...` ile güncellenir.
  - Parquet Sharder tarafında: Yalnızca daha önce katalogda yer almayan (yeni) kayıtlar yeni Parquet shard'larına (`p00004`, `p00005`...) yazılır.
  - Böylece Parquet dosyaları arasında makale mükerrerliği %0 olur.
- `DergiParkLedger.load_existing_ids()` ile bellekte tutulan $O(1)$ Python kümesi (131K ID ~12 MB RAM) ile sıfır gecikmeli tekilleştirme kontrolü sağlanır.

### D. Orkestratör CLI Entegrasyonu (`orchestrator.py`)
- `--auto-partition`: Sırayla tüm tarih pencerelerini işler.
- `--start-year` / `--end-year`: Hedef yılları belirler.
- `--status`: Mevcut bölüm ilerlemesini ve tamamlanan makale sayılarını raporlar.

## 3. Doğrulama ve Testler
1. `test_partitioner_date_windows`: Tarih aralıklarının boşluksuz, kronolojik ve sınırları aşmayan pencereler ürettiğini test eder.
2. `test_partition_ledger_state`: `init_partition`, `update_partition_token`, `complete_partition` işlemlerini ve durum geçişlerini doğrular.
3. `test_deduplication_isolation`: Mevcut bir ID'nin Parquet sharder'a yeniden eklenmediğini doğrular.
4. `test_orchestrator_cli_flags`: CLI argümanlarının hatasız ayrıştırıldığını doğrular.
5. `npm run verify`: 6 katmanlı tam doğrulama hattı.

## 4. Kısıtlar ve Güvenlik
- **Sıfır Emoji:** Kod, log, commit ve dokümanlarda kesinlikle emoji kullanılmaz.
- **DOAJ Süreç Güvenliği:** PID 106385 DOAJ arka plan akışı kesintisiz çalışmaya devam eder.
- **Git Standartları:** `feat(dergipark): implement date partitioned harvesting and state ledger`.
